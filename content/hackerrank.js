// Isolated-world bridge: receives HR_SUBMISSION from hr-bridge and forwards to background.
window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  const d = e.data;

  if (d?.__codehub === "HR_SUBMISSION_PENDING") {
    showToast("⏳ Submission detected, waiting for result…");
    return;
  }

  if (d?.__codehub === "HR_SUBMISSION") {
    if (!d.code) {
      showToast("⚠️ CodeHub Sync: Could not capture code — try submitting again.", true);
      return;
    }
    try {
      chrome.runtime.sendMessage(
        {
          type: "PUSH_SOLUTION",
          payload: {
            platform:      "HackerRank",
            problemSlug:   d.challengeSlug,
            problemTitle:  d.title,
            language:      d.language,
            code:          d.code,
            difficulty:    d.difficulty,
            trackSlug:     d.trackSlug,
            trackName:     d.trackName,
            subdomainSlug: d.subdomainSlug,
            subdomainName: d.subdomainName,
            bodyHtml:      d.bodyHtml,
            problemUrl:    d.problemUrl,
            contestSlug:   d.contestSlug,
          },
        },
        (result) => {
          if (chrome.runtime.lastError) return;
          if (result?.ok && !result.skipped) showToast(`✅ Synced to GitHub: ${result.filePath}`);
          else if (result?.skipped)          showToast(`ℹ️ ${result.reason}`);
          else if (result && !result.ok)     showToast(`⚠️ CodeHub Sync: ${result.error}`, true);
        }
      );
    } catch (_) {}
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

