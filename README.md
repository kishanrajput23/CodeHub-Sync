<h1 align="center">
  <img src="icons/icon128.png" alt="CodeHub Sync" width="48" height="48" style="vertical-align: middle;" />
  &nbsp;CodeHub Sync
</h1>

<p align="center">
  A Chrome extension that automatically pushes your <strong>accepted</strong> coding solutions to GitHub across LeetCode, GeeksforGeeks, and HackerRank with per-problem READMEs, topic-based folder organization, and multi-solution history that never overwrites your previous work.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Extension" />
  <img src="https://img.shields.io/badge/Platforms-LeetCode%20%7C%20GFG%20%7C%20HackerRank-orange?style=flat-square" alt="Platforms" />
  <img src="https://img.shields.io/github/stars/kishanrajput23/CodeHub-Sync?style=flat-square" alt="Stars" />
  <img src="https://img.shields.io/github/forks/kishanrajput23/CodeHub-Sync?style=flat-square" alt="Forks" />
  <img src="https://visitor-badge.laobi.icu/badge?page_id=kishanrajput23.CodeHub-Sync" alt="Visitors" />
</p>

<img width="1536" height="1024" alt="CodeHub Sync" src="https://github.com/user-attachments/assets/616eba91-42f0-433c-9555-eb6181558d33" />

---

## Why CodeHub Sync?

Most sync extensions push one file per problem and silently overwrite it on every new submission. CodeHub Sync keeps **every distinct solution** you ever write:

```
Solutions/0001-two-sum/
  README.md          ← auto-generated problem description
  0001-two-sum_1.cpp ← first accepted solution
  0001-two-sum_2.py  ← second attempt in a different language
  0001-two-sum_3.cpp ← optimized approach
```

Nothing is ever deleted. Identical re-submissions are silently skipped.

---

## Features

| Feature | LeetCode | GeeksforGeeks | HackerRank |
|---|:---:|:---:|:---:|
| Accepted submission detection | ✅ | ✅ | ✅ |
| Per-problem README with description | ✅ | ✅ | ✅ |
| Difficulty & topic tags | ✅ | ✅ | ✅ |
| Multi-solution history | ✅ | ✅ | ✅ |
| Duplicate submission guard | ✅ | ✅ | ✅ |
| Runtime / memory in commit message | ✅ | — | — |
| Topic-indexed main README | ✅ | — | — |
| Track / subdomain folder structure | — | — | ✅ |

---

## How It Works

The extension runs two content scripts per platform, one in the **page's own JavaScript context** (to intercept network calls before they leave the browser) and one in the **isolated extension context** (to talk to GitHub). No DOM scraping. No polling for verdict banners.

<video>https://drive.google.com/file/d/1llN7NchTzRf-XPlQu1pwOXSDMHs6jGwH/view?usp=sharing</video>

### LeetCode
Intercepts the `/graphql` and submission fetch calls directly. Captures the exact code you submitted along with runtime percentile, memory percentile, difficulty, and topic tags. Pushes under `Solutions/{padded-id}-{slug}/`.

### GeeksforGeeks
Intercepts XHR and fetch calls to GFG's `practiceapi` endpoints. Detects acceptance via the result payload (`view_mode === "correct"` or `sub_status === 1`). Selects the primary topic folder using a 60+ entry priority list (Dynamic Programming beats Arrays, Sliding Window beats Searching, etc.).

### HackerRank
Intercepts the XHR submission POST to HackerRank's REST API, extracts the submission ID, then polls the result endpoint until a terminal status arrives. Fetches challenge metadata (track, subdomain, difficulty, full problem HTML) in the same pass.

---

## 🎥 Demo
#### Click on images to watch the demo!
<p align="center">
  <a href="https://drive.google.com/file/d/1hvw4adv3P3r8WYV48tpOHaphd41GbXeu/view?usp=sharing">
    <img src="https://github.com/user-attachments/assets/7fb94a15-d0c3-4908-9c9c-43a255f7fed1" width="250" alt="GeeksforGeeks Demo">
  </a>
  &nbsp;&nbsp;
  <a href="https://drive.google.com/file/d/1llN7NchTzRf-XPlQu1pwOXSDMHs6jGwH/view?usp=sharing">
    <img src="https://github.com/user-attachments/assets/49544266-2fc3-4299-abd1-63e3eea9624e" width="250" alt="LeetCode Demo">
  </a>
  &nbsp;&nbsp;
  <a href="https://drive.google.com/file/d/1BmMkb0nA4b2zTuxOagx8Vm5jD6wYWKlV/view?usp=sharing">
    <img src="https://github.com/user-attachments/assets/7e4cb1dc-6e22-451d-890b-e28663cdd91d" width="250" alt="HackerRank Demo">
  </a>
</p>

---

## Folder Structure

### LeetCode repo
```
Solutions/
  0001-two-sum/
    README.md
    0001-two-sum_1.cpp
  0102-binary-tree-level-order-traversal/
    README.md
    0102-binary-tree-level-order-traversal_1.java
README.md   ← managed topic index (Array, Dynamic Programming, …)
```

### GeeksforGeeks repo
```
Dynamic_Programming/
  0-1-knapsack-problem/
    README.md
    0-1-knapsack-problem_1.cpp
Sliding_Window/
  sliding-window-maximum/
    README.md
    sliding-window-maximum_1.cpp
```

### HackerRank repo
```
Algorithms/
  Warmup/
    solve-me-first/
      README.md
      solve-me-first_1.cpp
Data_Structures/
  Arrays/
    arrays-ds/
      README.md
      arrays-ds_1.py
SQL/
  Basic_Select/
    revising-the-select-query/
      README.md
      revising-the-select-query_1.sql
```

---

## Setup

### 1. Create GitHub repos
Create one repo per platform you want to track (or reuse existing ones), e.g. `leetcode-solutions`, `gfg-solutions`, `hackerrank-solutions`.

### 2. Generate a GitHub Personal Access Token
1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens**
2. Set **Repository access** to your solution repos
3. Grant **Contents: Read and write**
4. Copy the token — you only need one token for all three platforms

### 3. Load the extension
1. On this GitHub repo page click the green **Code** button → **Download ZIP** and extract it or run `git clone https://github.com/your-username/CodeHub-Sync.git`
2. Open `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the extracted `codehub-sync` folder
5. The CodeHub Sync icon appears in your toolbar

### 4. Configure each platform
Click the extension icon and fill in the popup:

- **GitHub Token** shared across all platforms (paste once)
- **LeetCode tab** → Owner / Repository / Branch
- **GfG tab** → Owner / Repository / Branch
- **HR tab** → Owner / Repository / Branch

Click **Save Settings**. Use **Test Connection** to verify GitHub access before solving anything.

### 5. Solve and submit as normal
Accept a solution on any supported platform. The extension intercepts the network call in the background and pushes to GitHub automatically. The popup's stats counters tick up for each successful push.

---

## Per-Problem README

Every new problem folder gets a `README.md` generated automatically on first push:

**LeetCode example:**
```markdown
## [1. Two Sum](https://leetcode.com/problems/two-sum/)

**Difficulty:** Easy
**Topics:** Array, Hash Table

**Problem Description:**
<full cleaned HTML from LeetCode's GraphQL API>
```

**GeeksforGeeks example:**
```markdown
## [Sliding Window Maximum](https://www.geeksforgeeks.org/problems/sliding-window-maximum/1)

**Difficulty:** Hard
**Topics:** sliding-window, Deque

**Problem Description:**
...
```

**HackerRank example:**
```markdown
## [Solve Me First](https://www.hackerrank.com/challenges/solve-me-first/problem)

**Domain:** Algorithms
**Subdomain:** Warmup
**Difficulty:** Easy

**Problem Description:**
...
```

---

## LeetCode Topic Index

After each LeetCode push, the repo's root `README.md` is updated between managed markers:

```markdown
<!---LeetCode Topics Start-->
# LeetCode Topics

## Array
| [two-sum](https://github.com/you/repo/tree/main/Solutions/0001-two-sum) |
| ------- |

## Dynamic Programming
| [climbing-stairs](https://github.com/you/repo/tree/main/Solutions/0070-climbing-stairs) |
| ------- |
<!---LeetCode Topics End-->
```

Problems are filed under every topic tag they carry. The section is append-only — existing entries are never removed.

---

## Duplicate Avoidance

Before every push, the extension computes a **SHA-256 hash** of your code. If that exact hash was already pushed for that problem (tracked in `chrome.storage.local`), the push is silently skipped. This prevents double-commits from accidentally clicking Submit twice. Any genuinely different solution — different approach, language, or optimization — always gets its own `_N` file.

---

## Supported Languages

Any language accepted by the platform is handled. File extension is derived from the submission language:

`cpp` `c` `java` `py` `js` `ts` `cs` `go` `kt` `swift` `rs` `rb` `scala` `php` `hs` `sh` `sql` `pl` `lua` …

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Nothing pushed after Accepted | Open DevTools on the problem page → Console tab → look for `[CodeHub Sync]` errors |
| Solution pushed on old tab but nothing happens | Hard refresh the tab (`Ctrl+Shift+R`) after reloading the extension — old content scripts don't auto-update |
| `Missing GitHub settings` error | Open popup → check the correct platform tab has Owner/Repo/Branch filled in |
| `UPSERT_FILE_FAILED_422` | SHA mismatch — delete the conflicting file on GitHub and resubmit |
| Stats counter not incrementing | Open `chrome://extensions` → find CodeHub Sync → click **service worker** → check background console |
| GFG solution filed under wrong topic | The problem's tags didn't match the priority list — open an issue with the problem URL |
| HackerRank: nothing after Accepted | Check Network tab — filter `submissions` — confirm the POST is `xhr` type and URL matches `/rest/contests/.../submissions` |

---

## Privacy & Security

- Your GitHub token is stored only in `chrome.storage.sync` (encrypted by Chrome, synced to your signed-in Google account).
- The token is sent **only** to `api.github.com` — never to any third-party server.
- No analytics, no tracking, no external calls beyond GitHub's API.
- All source code is in this repo — nothing is minified or obfuscated.

## 🙋‍♂️ Author

**Kishan Kumar Rai**

- GitHub: https://github.com/kishanrajput23

---

<div align="center">

⭐ If you found this repository useful, consider giving it a star!

Made with ❤️ using **CodeHub Sync**

</div>
