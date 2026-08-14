// Runs in MAIN world — intercepts HackerRank's REST submission API (XHR + fetch).
// Polling stays here (page context) so HackerRank session cookies are always sent.
(function () {
  if (window.__codehubHRBridge) return;
  window.__codehubHRBridge = true;

  // Trailing-slash and query-string safe; matches /master/ (practice) and contest slugs.
  const SUBMIT_RE = /\/rest\/contests\/([^/?#]+)\/challenges\/([^/?#]+)\/submissions\/?(?:[?#]|$)/;

  const _fetch = window.fetch.bind(window);
  const _open  = XMLHttpRequest.prototype.open;
  const _send  = XMLHttpRequest.prototype.send;

  function parseCode(parsed) {
    return parsed?.code || parsed?.source || parsed?.solution ||
           parsed?.submission?.code || parsed?.submission?.source || "";
  }
  function parseLang(parsed) {
    return parsed?.language || parsed?.lang || parsed?.submission?.language || "";
  }
  // POST response may nest the id under model or at the root level.
  function extractId(data) {
    return data?.model?.id ?? data?.id ?? data?.submission_id ?? null;
  }

  // ── XHR interception (HackerRank primarily uses XHR) ─────────
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__chMethod = method;
    this.__chUrl    = typeof url === "string" ? url : String(url);
    return _open.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const m = (this.__chUrl || "").match(SUBMIT_RE);
    if (m && (this.__chMethod || "").toUpperCase() === "POST") {
      const [, contestSlug, challengeSlug] = m;
      let code = "", language = "";
      try {
        const parsed = typeof body === "string" ? JSON.parse(body) : {};
        code     = parseCode(parsed);
        language = parseLang(parsed);
      } catch (_) {}

      this.addEventListener("load", () => {
        try {
          const data = JSON.parse(this.responseText);
          const id   = extractId(data);
          if (id) {
            window.postMessage({ __codehub: "HR_SUBMISSION_PENDING" }, "*");
            pollResult(contestSlug, challengeSlug, id, code, language);
          }
        } catch (_) {}
      });
    }
    return _send.call(this, body);
  };

  // ── Fetch interception (fallback in case HR switches away from XHR) ───
  window.fetch = async function (input, init = {}) {
    const url    = typeof input === "string" ? input : (input?.url ?? "");
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const m      = url.match(SUBMIT_RE);
    if (m && method === "POST") {
      const [, contestSlug, challengeSlug] = m;
      let code = "", language = "";
      try {
        const rawBody = init?.body ?? (input instanceof Request ? await input.clone().text() : "");
        const parsed  = typeof rawBody === "string" ? JSON.parse(rawBody) : {};
        code     = parseCode(parsed);
        language = parseLang(parsed);
      } catch (_) {}
      const response = await _fetch(input, init);
      response.clone().json().then(data => {
        const id = extractId(data);
        if (id) {
          window.postMessage({ __codehub: "HR_SUBMISSION_PENDING" }, "*");
          pollResult(contestSlug, challengeSlug, id, code, language);
        }
      }).catch(() => {});
      return response;
    }
    return _fetch(input, init);
  };

  // ── Polling (runs in page context so session cookies are included) ────
  async function pollResult(contestSlug, challengeSlug, id, code, language) {
    const base = `/rest/contests/${contestSlug}/challenges/${challengeSlug}`;
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      try {
        const res = await _fetch(`${base}/submissions/${id}`);
        if (!res.ok) continue;
        const { model } = await res.json();
        if (!model) continue;

        const sc        = +model.status_code;
        const statusStr = (model.status || "").toLowerCase();

        // Still queued or processing — keep polling.
        if (sc === 0 || isNaN(sc) || statusStr === "processing" || statusStr === "in queue") continue;

        // Accept status_code 1 or 2 (HackerRank has used both) and the status string.
        const accepted = sc === 1 || sc === 2 || statusStr === "accepted";
        if (accepted) {
          const meta = await fetchChallengeMeta(contestSlug, challengeSlug);
          dispatch({
            challengeSlug, contestSlug,
            code:     model.code || model.typed_code || model.source || code,
            language: model.language || model.lang || language,
            meta,
          });
        }
        break;
      } catch (_) { /* network hiccup — retry */ }
    }
  }

  async function fetchChallengeMeta(contestSlug, challengeSlug) {
    try {
      const res = await _fetch(`/rest/contests/${contestSlug}/challenges/${challengeSlug}`);
      if (!res.ok) return null;
      return (await res.json())?.model ?? null;
    } catch (_) { return null; }
  }

  function dispatch({ challengeSlug, contestSlug, code, language, meta }) {
    window.postMessage({
      __codehub:     "HR_SUBMISSION",
      challengeSlug,
      contestSlug,
      title:         meta?.name              || challengeSlug,
      language,
      code,
      difficulty:    meta?.difficulty_name   || "",
      trackSlug:     meta?.track?.track_slug || "",
      trackName:     meta?.track?.track_name || "",
      subdomainSlug: meta?.track?.slug       || "",
      subdomainName: meta?.track?.name       || "",
      bodyHtml:      meta?.body_html         || meta?.preview || "",
      problemUrl:    `https://www.hackerrank.com/challenges/${challengeSlug}/problem`,
    }, "*");
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
})();

