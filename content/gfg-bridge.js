(function () {
  if (document.documentElement.getAttribute("data-codehub-gfg")) return;
  document.documentElement.setAttribute("data-codehub-gfg", "active");
  console.log("[CodeHub GFG] bridge loaded");

  const origFetch = window.fetch.bind(window);
  const origOpen  = XMLHttpRequest.prototype.open;
  const origSend  = XMLHttpRequest.prototype.send;

  function getSlug() {
    const m = location.pathname.match(/\/problems\/([^/?#]+)/);
    if (!m) return "";
    // GFG appends a numeric DB id to slugs (e.g. second-largest3735) — strip it
    return m[1].replace(/\d+$/, "").replace(/-+$/, "");
  }

  function getCode() {
    const cm = document.querySelector(".CodeMirror");
    if (cm?.CodeMirror) return cm.CodeMirror.getValue();
    const ace = document.querySelector(".ace_editor");
    if (ace && window.ace) {
      try { return window.ace.edit(ace).getValue(); } catch (_) {}
    }
    return "";
  }

  function getLang() {
    const sel = document.querySelector(
      "[class*='language'] select, [id*='language'], [class*='lang'] select, select"
    );
    if (!sel) return "cpp";
    return sel.options?.[sel.selectedIndex]?.text?.trim() || sel.value?.trim() || "cpp";
  }

  function getTitle() {
    // document.title is "Problem Name | GeeksforGeeks" — most reliable
    const fromDocTitle = document.title.split("|")[0].trim();
    if (fromDocTitle && fromDocTitle.length > 2 && !/geeksforgeeks/i.test(fromDocTitle)) return fromDocTitle;
    const el = document.querySelector(
      "h1[class], [class*='problem-title'], [class*='problemTitle'], [class*='header_content'] h1"
    );
    return el ? el.textContent.trim() : getSlug().replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  function getTopics() {
    // DOM links are the authoritative source — returns ALL topic tags on the page
    const topicLinks = [...document.querySelectorAll("a[href*='category']")]
      .filter(a => !a.href.includes("company"))
      .map(a => a.textContent.trim())
      .filter(t => t && t.length > 1 && t.length < 40);
    if (topicLinks.length) return [...new Set(topicLinks)].slice(0, 5);
    // Fallback: URL param (only carries one topic)
    const cat = new URLSearchParams(location.search).get("category");
    if (cat) return [cat];
    return [];
  }

  function getDifficulty() {
    // URL param: ?difficulty=Easy
    const fromUrl = new URLSearchParams(location.search).get("difficulty");
    if (fromUrl && /basic|easy|medium|hard/i.test(fromUrl)) return fromUrl;
    // GFG structure: <span>"Difficulty: "<strong>Easy</strong></span>
    const strong = [...document.querySelectorAll("strong")]
      .find(e => /^(Basic|Easy|Medium|Hard)$/i.test(e.textContent.trim()));
    if (strong) return strong.textContent.trim();
    // CSS selectors with partial text match
    for (const sel of ["[class*='difficulty']", "[class*='Difficulty']", "[class*='diffTag']", "[class*='diff_tag']", "[class*='level']"]) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const m = el.textContent.match(/\b(Basic|Easy|Medium|Hard)\b/i);
      if (m) return m[1];
    }
    // Broadest fallback: shortest element whose text contains a difficulty word
    const hits = [...document.querySelectorAll("span, div, a, p")]
      .map(e => ({ e, t: e.textContent.trim() }))
      .filter(({ t }) => /\b(Basic|Easy|Medium|Hard)\b/i.test(t) && t.length < 60)
      .sort((a, b) => a.t.length - b.t.length);
    if (hits.length) {
      const m = hits[0].t.match(/\b(Basic|Easy|Medium|Hard)\b/i);
      if (m) return m[1];
    }
    return "";
  }

  function getProblemDescription() {
    const candidates = [
      "[class*='problems_problem_content']",
      "[class*='problem-statement']",
      "[class*='problem_content']",
      "[class*='questionDetails']",
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const clone = el.cloneNode(true);
      // Remove noise: share widgets, buttons, SVGs, scripts
      clone.querySelectorAll("button, script, style, svg, [class*='share'], [class*='social']").forEach(n => n.remove());
      // Remove company tags, related articles, expected complexity (captured separately)
      clone.querySelectorAll("[class*='company'], [class*='Company'], [class*='related'], [class*='Related'], [class*='complex'], [class*='Complex']").forEach(n => n.remove());
      // Remove company links (href contains company[])
      clone.querySelectorAll("a[href*='company']").forEach(n => n.remove());
      // Remove anchors with no visible text
      clone.querySelectorAll("a").forEach(a => { if (!a.textContent.trim()) a.remove(); });
      const html = clone.innerHTML.trim();
      if (html.length > 50) return html;
    }
    return "";
  }

  function getExpectedComplexity() {
    // Look for the Expected Time/Space Complexity section on the page
    const candidates = [
      "[class*='expected-complexity']", "[class*='expectedComplexity']",
      "[class*='expected_complexity']",
      "[class*='complexity']", "[class*='Complexity']",
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      const text = el?.innerText?.trim() || "";
      if (text.length > 5) return text;
    }
    // Fallback: scan for any element mentioning time/space complexity (with or without "Expected" prefix).
    const all = [...document.querySelectorAll("p, div, section")];
    const found = all.find(el =>
      /\b(expected\s+)?(time|auxiliary|space)\s+complexity/i.test(el.textContent) &&
      el.textContent.length < 500
    );
    return found ? found.innerText.trim() : "";
  }

  function dispatch() {
    const code = getCode();
    if (!code || code.length < 5) return;
    const diff = getDifficulty();
    const topics = getTopics();
    console.log("[CodeHub GFG] dispatch — difficulty:", diff, "| topics:", topics);
    window.postMessage({ __codehub: "GFG_SUBMISSION_PENDING" }, "*");
    window.postMessage(
      {
        __codehub: "GFG_SUBMISSION",
        slug:        getSlug(),
        title:       getTitle(),
        lang:        getLang(),
        code,
        url:         window.location.href,
        topics:      topics,
        difficulty:  diff,
        description: getProblemDescription(),
        complexity:  getExpectedComplexity(),
      },
      "*"
    );
  }

  function isAccepted(data) {
    if (!data || typeof data !== "object") return false;
    // GFG result/ endpoint: view_mode "correct" or sub_status 1 mean accepted
    if (data.view_mode === "correct" || data.sub_status === 1) return true;
    const v = String(data.result ?? data.verdict ?? data.status ?? "").toLowerCase();
    return v === "correct" || v === "accepted";
  }

  // Log every fetch on GFG so we can find the real submit URL
  // Match geeksforgeeks.org only in the path/domain, not in encoded query params (analytics URLs)
  const GFG_RE = /^https?:\/\/[^?#]*geeksforgeeks\.org/i;

  window.fetch = async function (...args) {
    const url = (typeof args[0] === "string" ? args[0] : args[0]?.url) || "";
    if (GFG_RE.test(url)) console.log("[CodeHub GFG] fetch →", url);
    const res = await origFetch(...args);
    if (GFG_RE.test(url)) {
      res.clone().json().then(d => { isAccepted(d); if (isAccepted(d)) dispatch(); }).catch(() => {});
    }
    return res;
  };

  // Intercept XHR (older GFG code paths)
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._chUrl = url;
    if (GFG_RE.test(url)) console.log("[CodeHub GFG] XHR →", url);
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (GFG_RE.test(this._chUrl || "")) {
      this.addEventListener("load", () => {
        try {
          const d = JSON.parse(this.responseText);
          if (isAccepted(d)) dispatch();
        } catch (_) {}
      });
    }
    return origSend.apply(this, args);
  };
})();
