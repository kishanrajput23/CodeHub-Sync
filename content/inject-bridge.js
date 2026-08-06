// Runs in the PAGE's own JS context — patches window.fetch to intercept
// LeetCode submissions (both the legacy REST endpoint and the current GraphQL API).

(function () {
  // Set the marker first — must be visible to the isolated-world PING before anything else runs
  document.documentElement.setAttribute("data-codehub-bridge", "active");
  // Prevent double-patching window.fetch if both world:MAIN and script-tag injection fire
  if (window.__codehubBridgeInstalled) return;
  window.__codehubBridgeInstalled = true;

  const originalFetch = window.fetch;
  const pending = new Map();
  const questionMeta = new Map();

  // LeetCode serves initial question data via SSR (no network call), so we must fetch it ourselves.
  function prefetchQuestionMeta(slug) {
    if (!slug || questionMeta.has(slug)) return;
    originalFetch("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: "query q($s:String!){question(titleSlug:$s){questionFrontendId questionId difficulty topicTags{name}content}}",
        variables: { s: slug },
      }),
    })
      .then((r) => r.json())
      .then(({ data }) => {
        const q = data?.question;
        if (!q) return;
        questionMeta.set(slug, {
          questionId: q.questionFrontendId || q.questionId || "",
          difficulty: q.difficulty || "",
          topicTags: (q.topicTags || []).map((t) => t.name),
          content: q.content || "",
        });
      })
      .catch(() => {});
  }

  prefetchQuestionMeta(slugFromUrl(document.location.href));
  const _origPushState = history.pushState.bind(history);
  history.pushState = function (...a) {
    _origPushState(...a);
    prefetchQuestionMeta(slugFromUrl(document.location.href));
  };
  window.addEventListener("popstate", () => prefetchQuestionMeta(slugFromUrl(document.location.href)));

  function slugFromUrl(url) {
    const m = url.match(/\/problems\/([^/]+)\//);
    return m ? m[1] : null;
  }

  // Pull the submission ID out of a REST or GraphQL POST response.
  function extractSubId(data) {
    if (!data) return null;
    if (data.submission_id) return String(data.submission_id);         // REST
    const gql = data.data;
    if (!gql) return null;
    for (const key of Object.keys(gql)) {
      // Only look inside keys that look like a submit/create mutation
      if (!/submit|creat/i.test(key)) continue;
      const v = gql[key];
      if (!v || typeof v !== "object") continue;
      if (v.id) return String(v.id);
      if (v.submissionId) return String(v.submissionId);
      if (v.submission_id) return String(v.submission_id);
    }
    return null;
  }

  // Extract typed code from REST body or GraphQL variables — scan every nested object.
  function extractCode(parsed) {
    if (!parsed) return "";
    if (parsed.typed_code) return parsed.typed_code;
    const v = parsed.variables;
    if (!v) return "";
    // Direct fields first
    if (v.typedCode) return v.typedCode;
    if (v.code) return v.code;
    // Any nested object (input, submissionInput, etc.)
    for (const key of Object.keys(v)) {
      const inner = v[key];
      if (inner && typeof inner === "object") {
        if (inner.typedCode) return inner.typedCode;
        if (inner.code) return inner.code;
        if (inner.typed_code) return inner.typed_code;
      }
    }
    return "";
  }

  function extractLang(parsed) {
    if (!parsed) return "";
    if (parsed.lang) return parsed.lang;
    const v = parsed.variables;
    if (!v) return "";
    if (v.lang) return v.lang;
    for (const key of Object.keys(v)) {
      const inner = v[key];
      if (inner && typeof inner === "object" && inner.lang) return inner.lang;
    }
    return "";
  }

  function extractSlug(parsed, url) {
    const v = parsed?.variables;
    if (!v) return slugFromUrl(url) || slugFromUrl(document.location.href) || "";
    if (v.questionSlug) return v.questionSlug;
    if (v.titleSlug) return v.titleSlug;
    for (const key of Object.keys(v)) {
      const inner = v[key];
      if (inner && typeof inner === "object") {
        if (inner.questionSlug) return inner.questionSlug;
        if (inner.titleSlug) return inner.titleSlug;
      }
    }
    return slugFromUrl(url) || slugFromUrl(document.location.href) || "";
  }

  window.fetch = async function (...args) {
    const reqArg = args[0];
    const init = args[1] || {};
    const url = typeof reqArg === "string" ? reqArg : reqArg?.url || "";
    const pathname = url.split("?")[0];
    const method = (init.method || (reqArg instanceof Request ? reqArg.method : "") || "GET").toUpperCase();

    let rawBody = init.body ?? null;
    if (rawBody === null && reqArg instanceof Request) {
      try { rawBody = await reqArg.clone().text(); } catch (e) {}
    }

    const response = await originalFetch.apply(this, args);

    try {
      let parsed = null;
      try { if (rawBody) parsed = JSON.parse(rawBody); } catch (e) {}

      const isRestSubmit = method === "POST" && /\/(api\/)?problems\/[^/]+\/submit\/?$/.test(pathname);
      const isGraphQL    = method === "POST" && url.includes("/graphql");

      // Single clone — handle capture + acceptance check in one callback
      response.clone().json().then((data) => {
        if (!data) return;

        // Cache question metadata (number, difficulty, topics, description)
        const q = data?.data?.question;
        if (q?.titleSlug) {
          questionMeta.set(q.titleSlug, {
            questionId: q.questionFrontendId || q.frontendQuestionId || q.questionId || "",
            difficulty: q.difficulty || "",
            topicTags: (q.topicTags || []).map((t) => t.name),
            content: q.content || "",
          });
        }

        // ── Capture submission ID from submit POST or GraphQL mutation ───────
        if (isRestSubmit || isGraphQL) {
          const subId = extractSubId(data);
          if (subId) {
            pending.set(subId, {
              code: extractCode(parsed),
              lang: extractLang(parsed),
              slug: extractSlug(parsed, url),
            });
            window.postMessage({ source: "codehub-sync", type: "SUBMISSION_PENDING" }, "*");
          }
        }

        // ── Detect acceptance in ANY response while submissions are pending ──
        if (pending.size === 0) return;

        let accepted = false;
        let resolvedId = null;
        let code = "";
        let lang = "";
        let runtimeDisplay = "";
        let runtimePct = null;
        let memoryDisplay = "";
        let memoryPct = null;

        // Pattern A: REST check { status_code: 10 }
        if (data.status_code === 10) {
          const m = url.match(/\/(?:submissions\/detail\/|submission\/)(\d+)/);
          resolvedId = m ? m[1] : null;
          code = data.code || "";
          lang = data.lang || "";
          runtimeDisplay = data.status_runtime || "";
          runtimePct = data.runtime_percentile ?? null;
          memoryDisplay = data.status_memory || "";
          memoryPct = data.memory_percentile ?? null;
          accepted = true;
        }

        // Pattern B: GraphQL — try every possible field name LeetCode might use
        if (!accepted) {
          const details = data?.data?.submissionDetails
                       || data?.data?.submissionDetail
                       || data?.data?.checkSubmission
                       || data?.data?.submission;
          const isOK = details && (
            details.statusCode === 10 || details.statusCode === "10" ||
            details.status === "Accepted" ||
            details.runtimeStatus === "Accepted"
          );
          if (isOK) {
            const varId = parsed?.variables?.submissionId ?? parsed?.variables?.id;
            resolvedId = varId != null ? String(varId) : null;
            code = details.code || details.typedCode || "";
            lang = details.lang || details.language || "";
            runtimeDisplay = details.runtimeDisplay || "";
            runtimePct = details.runtimePercentile ?? null;
            memoryDisplay = details.memoryDisplay || "";
            memoryPct = details.memoryPercentile ?? null;
            accepted = true;
          }
        }

        if (!accepted) return;

        const info = resolvedId ? pending.get(resolvedId) : null;
        // Fallback: if only one submission is pending, use it regardless of ID
        const fallback = info || (pending.size === 1 ? [...pending.values()][0] : null);
        const slug = fallback?.slug || slugFromUrl(document.location.href);
        const meta = questionMeta.get(slug) || {};

        window.postMessage({
          source: "codehub-sync",
          type: "SUBMISSION_ACCEPTED",
          data: {
            code: code || fallback?.code || "",
            lang: lang || fallback?.lang || "",
            slug,
            title: document.title.replace(" - LeetCode", ""),
            questionId: meta.questionId || "",
            difficulty: meta.difficulty || "",
            topicTags: meta.topicTags || [],
            problemStatementHtml: meta.content || "",
            problemUrl: `https://leetcode.com/problems/${slug}/`,
            runtimeDisplay,
            runtimePct,
            memoryDisplay,
            memoryPct,
          },
        }, "*");

        if (resolvedId) pending.delete(resolvedId);
        else pending.clear();
      }).catch(() => {});

    } catch (e) {
      // Never let our instrumentation break the page's real network calls.
    }

    return response;
  };
})();

