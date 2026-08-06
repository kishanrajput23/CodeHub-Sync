// Runs in the normal (isolated) content-script world — has access to
// chrome.runtime but not to the page's own JS. Listens for the message that
// content/inject-bridge.js posts from the page context, then forwards a
// clean payload to the background service worker.

// Fallback: inject fetch-interceptor via <script> tag in case world:"MAIN" is blocked by CSP.
// The guard inside inject-bridge.js prevents it from running twice.
(function injectBridge() {
  if (document.documentElement.getAttribute("data-codehub-bridge") === "active") return;
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("content/inject-bridge.js");
  document.documentElement.appendChild(s);
})();

const LANG_MAP = {
  cpp: "cpp",
  java: "java",
  python: "python",
  python3: "python3",
  javascript: "javascript",
  typescript: "typescript",
  csharp: "csharp",
  golang: "go",
  kotlin: "kotlin",
  swift: "swift",
  rust: "rust",
  ruby: "ruby",
  scala: "scala",
  php: "php",
  c: "c",
};

// Lets the popup check whether this content script is alive in the current tab
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "PING") {
    const bridgeActive = document.documentElement.getAttribute("data-codehub-bridge") === "active";
    sendResponse({ active: true, bridgeActive });
  }
});

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.source !== "codehub-sync") return;

  if (msg.type === "SUBMISSION_PENDING") {
    showToast("⏳ Submission detected, waiting for result…");
    return;
  }

  if (msg.type === "SUBMISSION_ACCEPTED") {
    const d = msg.data;
    if (!d.code) {
      showToast("⚠️ CodeHub Sync: Could not capture code — try submitting again", true);
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "PUSH_SOLUTION",
        payload: {
          platform: "LeetCode",
          problemSlug: d.slug,
          problemTitle: d.title || d.slug,
          language: LANG_MAP[d.lang] || d.lang,
          code: d.code,
          status: "Accepted",
          questionId: d.questionId || "",
          topicTags: d.topicTags || [],
          difficulty: d.difficulty || "",
          problemStatementHtml: d.problemStatementHtml || "",
          problemUrl: d.problemUrl || "",
          runtimeDisplay: d.runtimeDisplay || "",
          runtimePct: d.runtimePct ?? null,
          memoryDisplay: d.memoryDisplay || "",
          memoryPct: d.memoryPct ?? null,
        },
      },
      (result) => {
        if (chrome.runtime.lastError) {
          showToast(`⚠️ CodeHub Sync: ${chrome.runtime.lastError.message}`, true);
          return;
        }
        if (result?.ok && !result?.skipped) {
          showToast(`✅ Synced to GitHub: ${result.filePath}`);
        } else if (result?.skipped) {
          showToast(`ℹ️ ${result.reason}`);
        } else if (result && !result.ok) {
          showToast(`⚠️ CodeHub Sync: ${result.error}`, true);
        }
      }
    );
  }
});

function showToast(text, isError = false) {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 999999;
    background: ${isError ? "#c0392b" : "#1a7f37"}; color: #fff;
    padding: 10px 16px; border-radius: 8px; font: 13px system-ui, sans-serif;
    box-shadow: 0 2px 10px rgba(0,0,0,0.25); max-width: 320px;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}
