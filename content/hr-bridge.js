// Runs in MAIN world — intercepts HackerRank's REST submission API (XHR + fetch).
(function () {
  if (window.__codehubHRBridge) return;
  window.__codehubHRBridge = true;

  // Matches the submission POST endpoint for both practice and contest problems.
  const SUBMIT_RE = /\/rest\/contests\/([^/?#]+)\/challenges\/([^/?#]+)\/submissions$/;

  const _fetch = window.fetch.bind(window);

  // ── XHR interception (HackerRank uses XHR, not fetch) ─────────
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

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
        code     = parsed.code     || parsed.source || "";
        language = parsed.language || "";
      } catch (_) {}

      this.addEventListener("load", () => {
        try {
          const data = JSON.parse(this.responseText);
          const id   = data?.model?.id;
          if (id) pollResult(contestSlug, challengeSlug, id, code, language);
        } catch (_) {}
      });
    }
    return _send.call(this, body);
  };

  // ── Fetch interception (fallback in case HR ever switches) ────
  window.fetch = async function (input, init = {}) {
    const url    = typeof input === "string" ? input : (input?.url ?? "");
    const method = (init?.method || "GET").toUpperCase();
    const m      = url.match(SUBMIT_RE);
    if (m && method === "POST") {
      const [, contestSlug, challengeSlug] = m;
      let code = "", language = "";
      try {
        const parsed = typeof init.body === "string" ? JSON.parse(init.body) : {};
        code     = parsed.code     || parsed.source || "";
        language = parsed.language || "";
      } catch (_) {}
      const response = await _fetch(input, init);
      response.clone().json().then(data => {
        const id = data?.model?.id;
        if (id) pollResult(contestSlug, challengeSlug, id, code, language);
      }).catch(() => {});
      return response;
    }
    return _fetch(input, init);
  };

  // ── Polling ───────────────────────────────────────────────────
  async function pollResult(contestSlug, challengeSlug, id, code, language) {
    const base = `/rest/contests/${contestSlug}/challenges/${challengeSlug}`;
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      try {
        const res = await _fetch(`${base}/submissions/${id}`);
        if (!res.ok) continue;
        const { model } = await res.json();
        if (!model) continue;

        const sc = model.status_code;
        if (sc === 0 || sc == null) continue; // still processing

        if (sc === 1) {
          const meta = await fetchChallengeMeta(contestSlug, challengeSlug);
          dispatch({ challengeSlug, contestSlug, code: model.code || code, language: model.language || language, meta });
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

