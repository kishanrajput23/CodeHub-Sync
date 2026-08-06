// Isolated-world bridge: receives HR_SUBMISSION from hr-bridge and forwards to background.
window.addEventListener("message", (e) => {
  if (e.source !== window || e.data?.__codehub !== "HR_SUBMISSION") return;
  const d = e.data;
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
        if (result?.ok && !result.skipped) console.log("[CodeHub Sync] HR pushed:", result.filePath);
        else if (result && !result.ok) console.warn("[CodeHub Sync] HR failed:", result.error);
      }
    );
  } catch (_) {}
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "PING") sendResponse({ active: true });
});

