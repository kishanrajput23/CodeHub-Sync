# Contributing to CodeHub Sync

Thanks for your interest in contributing! CodeHub Sync is a Chrome extension that auto-syncs accepted
submissions from LeetCode, GeeksforGeeks, and HackerRank to GitHub. This guide will help you get set up
and make a meaningful contribution.

---

## Getting Started

### Prerequisites

- Google Chrome (or any Chromium-based browser that supports Manifest V3 extensions)
- A GitHub account and a personal access token with the `repo` scope (for testing pushes)
- Basic familiarity with Chrome Extension APIs (`chrome.runtime`, `chrome.storage`, content scripts)

### Local Setup

1. Fork this repository and clone your fork:
   ```bash
   git clone https://github.com/<your-username>/CodeHub-Sync.git
   cd CodeHub-Sync
   ```
2. Load the extension in Chrome:
   - Go to `chrome://extensions`
   - Enable **Developer mode** (top-right toggle)
   - Click **Load unpacked** and select the project folder
3. Open the extension popup, paste your GitHub token, and configure a **test repository**
   (do not test against your real solutions repo) for each platform tab you plan to work on.
4. After making changes to any file, go back to `chrome://extensions` and click the **reload** icon
   on the CodeHub Sync card to pick up your changes. For content script changes, also hard-refresh
   (`Ctrl+Shift+R`) the platform tab (LeetCode / GeeksforGeeks / HackerRank).

---

## Project Structure

```
background.js           # Service worker — GitHub API calls, README generation, push logic
popup.html/js/css        # Extension popup UI — settings, stats
manifest.json           # Manifest V3 config — permissions, content script registration
content/
  inject-bridge.js      # MAIN world — intercepts LeetCode GraphQL/REST calls
  leetcode.js            # Isolated world — forwards LeetCode payload to background.js
  gfg-bridge.js          # MAIN world — intercepts GFG XHR/fetch, scrapes DOM
  gfg.js                 # Isolated world — forwards GFG payload to background.js
  hr-bridge.js           # MAIN world — intercepts HackerRank XHR/fetch, polls verdict
  hackerrank.js           # Isolated world — forwards HackerRank payload to background.js
```

Each platform follows the same **two-script pattern**:
- A `*-bridge.js` script runs in the page's own JS context (`world: "MAIN"`) to intercept network
  calls before they leave the browser. It has no access to `chrome.runtime`.
- A paired isolated-world script (`leetcode.js`, `gfg.js`, `hackerrank.js`) listens for
  `window.postMessage` from the bridge and forwards a clean payload to `background.js` via
  `chrome.runtime.sendMessage`.

`background.js` is the only place that talks to the GitHub REST API — it decides the folder
structure, builds READMEs, handles duplicate detection, and commits files.

---

## How to Contribute

1. **Check open issues** first — look for something labeled `good first issue` or `help wanted`,
   or pick any open bug/feature you'd like to work on.
2. **Comment on the issue** before starting, so two people don't end up working on the same thing.
3. **Create a branch** off `main` with a descriptive name, e.g. `fix/hackerrank-mathjax-readme`.
4. **Make your changes**, following the conventions below.
5. **Test manually** on the real platform (LeetCode/GFG/HackerRank) against your test repo —
   there is currently no automated test suite, so manual verification is required.
6. **Open a Pull Request** against `main`, referencing the issue it fixes (e.g. `Fixes #12`).

---

## Code Conventions

- Plain JavaScript (ES2020+), no build step, no TypeScript, no frameworks.
- Keep content scripts framework-free — they run directly in the page context.
- Comments should explain **why**, not what — avoid restating what the next line already shows.
- Match existing formatting (2-space indent, semicolons, template literals for strings).
- Avoid adding new npm dependencies unless there's no reasonable alternative — this is a
  dependency-free extension by design.
- When touching platform-specific logic, change only the file(s) for that platform unless the
  fix is in shared code (`background.js`).

---

## Reporting Bugs

When filing a bug report, please include:

- Which platform (LeetCode / GeeksforGeeks / HackerRank)
- Steps to reproduce
- What you expected vs. what actually happened
- Console output/errors from the relevant tab (`F12` → Console) and from the extension's
  service worker console (`chrome://extensions` → CodeHub Sync → "service worker" link)
- A link to the problem you tested with, if relevant

---

## Suggesting Features

Feature requests are welcome — open an issue describing the use case and, if possible, how it
would fit into the existing architecture (popup vs. background vs. content script).

---

## Questions?

Open an issue with the `question` label, or comment on an existing related issue. Happy to clarify
any part of the codebase to help you get started.
