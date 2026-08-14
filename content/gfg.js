// GeeksforGeeks isolated-world content script — receives from gfg-bridge.js (MAIN world).

const GFG_LANG_MAP = {
  "C++": "cpp", "C++14": "cpp", "C++17": "cpp", "C": "c",
  "Java": "java", "Python": "python", "Python3": "python3",
  "JavaScript": "javascript", "Go": "go", "Rust": "rust",
};

window.addEventListener("message", (e) => {
  if (e.source !== window || e.data?.__codehub !== "GFG_SUBMISSION") return;
  const d = e.data;
  try {
    chrome.runtime.sendMessage(
      {
        type: "PUSH_SOLUTION",
        payload: {
          platform:             "GeeksforGeeks",
          problemSlug:          d.slug || d.title,
          problemTitle:         d.title || d.slug,
          language:             GFG_LANG_MAP[d.lang] || d.lang || "cpp",
          code:                 d.code,
          status:               "Accepted",
          topicTags:            d.topics || [],
          difficulty:           d.difficulty || "",
          problemStatementHtml: d.description || "",
          problemUrl:           d.url || `https://www.geeksforgeeks.org/problems/${d.slug || ""}/1`,
          expectedComplexity:   d.complexity || "",
        },
      },
      (result) => {
        if (chrome.runtime.lastError) return; // stale context after extension reload
        if (result?.ok && !result.skipped) showToast(`✅ Synced to GitHub: ${result.filePath}`);
        else if (result?.skipped)          showToast(`ℹ️ ${result.reason}`);
        else if (result && !result.ok)     showToast(`⚠️ CodeHub Sync: ${result.error}`, true);
      }
    );
  } catch (_) {
    // Extension was reloaded — hard-refresh the tab to reconnect
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "PING") sendResponse({ active: true });
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
