// background.js — the brain of the extension.
// Every content script sends a PUSH_SOLUTION message here; this file talks to
// the GitHub REST API and decides where/how to save the file.

const GITHUB_API = "https://api.github.com";

// ---------- settings ----------
const PLATFORM_PREFIX = { LeetCode: "lc", GeeksforGeeks: "gfg", HackerRank: "hr" };

async function getSettings(platform) {
  const prefix = PLATFORM_PREFIX[platform];
  const s = await chrome.storage.sync.get([
    "githubToken",
    // New per-platform keys
    ...(prefix ? [`${prefix}_owner`, `${prefix}_repo`, `${prefix}_branch`] : []),
    // Legacy LeetCode-only keys for backward compatibility
    "githubOwner", "githubRepo", "githubBranch",
  ]);
  const owner  = (prefix ? s[`${prefix}_owner`]  : "") || (prefix === "lc" ? s.githubOwner  : "") || "";
  const repo   = (prefix ? s[`${prefix}_repo`]   : "") || (prefix === "lc" ? s.githubRepo   : "") || "";
  const branch = (prefix ? s[`${prefix}_branch`] : "") || (prefix === "lc" ? s.githubBranch : "") || "main";
  return { token: s.githubToken || "", owner, repo, branch };
}

function b64EncodeUnicode(str) {
  // btoa() chokes on non-latin1 chars (comments in other languages, etc.)
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode("0x" + p1)
    )
  );
}

function b64DecodeUnicode(str) {
  return decodeURIComponent(
    atob(str).split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
  );
}

// ---------- README builders ----------

// Strips noise from LeetCode/HackerRank HTML before writing to README.
function cleanLeetCodeHtml(html) {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/<span[^>]*MathJax[^>]*>\s*<\/span>/gi, "")  // empty wrappers after SVG removal
    .replace(/<p[^>]*>\s*&nbsp;\s*<\/p>/gi, "")
    .replace(/\s*style="[^"]*"/gi, "")
    .replace(/\s*class="[^"]*"/gi, "")
    .trim();
}

function buildProblemReadme({ folderName, questionId, slug, title, difficulty, topicTags, problemStatementHtml, problemUrl }) {
  const numericId = questionId ? String(parseInt(questionId, 10)) : "";
  const displayTitle = numericId ? `${numericId}. ${title || slug}` : (title || slug);
  const url = problemUrl || `https://leetcode.com/problems/${slug}/`;
  let md = `## [${displayTitle}](${url})\n\n`;
  if (difficulty) md += `**Difficulty:** ${difficulty}  \n`;
  if (topicTags?.length) md += `**Topics:** ${topicTags.join(", ")}  \n`;
  md += "\n";
  const cleaned = cleanLeetCodeHtml(problemStatementHtml);
  if (cleaned) md += `**Problem Description:**\n\n${cleaned}\n`;
  return md;
}

function buildGFGProblemReadme({ slug, title, difficulty, topicTags, problemStatement, problemUrl, expectedComplexity }) {
  const url = problemUrl || `https://www.geeksforgeeks.org/problems/${slug}/1`;
  let md = `## [${title || slug}](${url})\n\n`;
  if (difficulty) md += `**Difficulty:** ${difficulty}  \n`;
  if (topicTags?.length) md += `**Topics:** ${topicTags.join(", ")}  \n`;
  if (expectedComplexity) md += `\n**Expected Complexities:**\n\n${expectedComplexity}\n`;
  md += "\n";
  if (problemStatement) md += `**Problem Description:**\n\n${problemStatement}\n`;
  return md;
}

function buildHRProblemReadme({ slug, title, difficulty, trackName, subdomainName, bodyHtml, problemUrl }) {
  const url = problemUrl || `https://www.hackerrank.com/challenges/${slug}/problem`;
  let md = `## [${title || slug}](${url})\n\n`;
  if (trackName)     md += `**Domain:** ${trackName}  \n`;
  if (subdomainName) md += `**Subdomain:** ${subdomainName}  \n`;
  if (difficulty)    md += `**Difficulty:** ${difficulty}  \n`;
  md += "\n";
  const cleaned = cleanLeetCodeHtml(bodyHtml);
  if (cleaned) md += `**Problem Description:**\n\n${cleaned}\n`;
  return md;
}

// Insert/update the problem entry in each topic section between the managed markers.
function updateMainReadme(existing, folderName, topicTags, owner, repo, branch) {
  const START = "<!---LeetCode Topics Start-->";
  const END   = "<!---LeetCode Topics End-->";
  // folderName may include a subfolder prefix (e.g. Solutions/0027-foo) — show only the problem name
  const displayName = folderName.includes("/") ? folderName.split("/").pop() : folderName;
  const ghUrl = `https://github.com/${owner}/${repo}/tree/${branch}/${folderName}`;
  const entry = `| [${displayName}](${ghUrl}) |`;
  const tags  = topicTags?.length ? topicTags : ["Uncategorized"];

  let content = existing || "";
  if (!content.includes(START)) {
    // Bootstrap the managed section on a fresh or unmanaged README
    content = content.trimEnd();
    content += `\n\n${START}\n# LeetCode Topics\n${END}\n`;
  }

  const startIdx = content.indexOf(START);
  const endIdx   = content.indexOf(END);
  const before   = content.slice(0, startIdx);
  let   managed  = content.slice(startIdx + START.length, endIdx);
  const after    = content.slice(endIdx + END.length);

  let lines = managed.split("\n");

  for (const tag of tags) {
    const header = `## ${tag}`;
    let headerIdx = lines.findIndex((l) => l.trim() === header);

    if (headerIdx === -1) {
      while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
      lines.push("", header, "|  |", "| ------- |", entry, "");
    } else {
      let sectionEnd = lines.length;
      for (let i = headerIdx + 1; i < lines.length; i++) {
        if (/^##\s/.test(lines[i])) { sectionEnd = i; break; }
      }
      if (lines.slice(headerIdx, sectionEnd).some((l) => l.includes(`/${displayName})`))) continue;
      let insertIdx = sectionEnd;
      while (insertIdx > headerIdx + 1 && lines[insertIdx - 1].trim() === "") insertIdx--;
      lines.splice(insertIdx, 0, entry);
    }
  }

  return before + START + lines.join("\n") + END + after;
}

function sanitize(name) {
  return (name || "untitled")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 100);
}

function sanitizeTopic(name) {
  return ((name || "General").trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 50)) || "General";
}

// Lower index = higher priority (more specific/advanced topic wins over generic ones).
const TOPIC_PRIORITY = [
  // ── DP variants ───────────────────────────────────────────────
  "Dynamic Programming",
  "Digit DP", "Bitmask DP", "DP on Trees",
  // ── Graph algorithms ──────────────────────────────────────────
  "Graph",
  "BFS", "DFS",
  "Shortest Path", "Dijkstra", "Bellman Ford", "Floyd Warshall",
  "Topological Sort",
  "Strongly Connected Components",
  "Minimum Spanning Tree",
  "Network Flow", "Maximum Flow",
  "Bipartite Graph",
  "Eulerian Circuit", "Eulerian Path",
  "Bridges", "Articulation Points",
  // ── Advanced data structures ──────────────────────────────────
  "Trie",
  "Segment Tree", "Persistent Segment Tree", "Merge Sort Tree",
  "Fenwick Tree", "Binary Indexed Tree",
  "Sparse Table",
  "Suffix Array", "Suffix Tree",
  "Disjoint Set", "Disjoint Set Union", "Union Find",
  "Heap", "Priority Queue",
  "Binary Search Tree", "AVL Tree", "Red Black Tree", "Treap",
  "Lowest Common Ancestor",
  // ── Core techniques ───────────────────────────────────────────
  "Binary Search",
  "Sliding Window",
  "Two Pointers", "Two Pointer",
  "Prefix Sum",
  "Kadane's Algorithm", "Kadanes Algorithm",
  "Greedy",
  "Backtracking",
  "Divide and Conquer",
  "Meet in the Middle",
  "Game Theory",
  "Geometry", "Convex Hull",
  // ── String algorithms ─────────────────────────────────────────
  "Pattern Searching", "KMP", "Z Algorithm",
  "Rabin Karp", "Aho Corasick", "Manacher",
  // ── Data structures ───────────────────────────────────────────
  "Hashing", "Hash",
  "Tree", "Binary Tree",
  "Linked List",
  "Stack", "Monotonic Stack",
  "Queue", "Deque", "Circular Queue", "Monotonic Queue",
  // ── Matrix / linear ───────────────────────────────────────────
  "Matrix",
  "Strings", "String",
  "Arrays", "Array",
  // ── Sorting & searching ───────────────────────────────────────
  "Searching",
  "Sorting",
  "Merge Sort", "Quick Sort", "Heap Sort", "Counting Sort", "Radix Sort", "Bucket Sort",
  // ── Foundational ──────────────────────────────────────────────
  "Recursion", "Memoization",
  "Combinatorics", "Permutation and Combination",
  "Modular Arithmetic",
  "Number Theory", "Prime Number", "Sieve", "GCD", "LCM",
  "Bit Magic", "Bit Manipulation",
  "Mathematical", "Math",
  "Simulation", "Implementation",
  "Data Structures",  // catch-all DSA tag GFG sometimes uses
];

function selectPrimaryTopic(topics) {
  if (!topics?.length) return "General";
  const norm = s => s.trim().toLowerCase().replace(/-/g, " ");
  const rankOf = new Map(TOPIC_PRIORITY.map((t, i) => [norm(t), i]));
  let best = topics[0];
  let bestRank = rankOf.get(norm(topics[0])) ?? Infinity;
  for (const t of topics.slice(1)) {
    const rank = rankOf.get(norm(t)) ?? Infinity;
    if (rank < bestRank) { bestRank = rank; best = t; }
  }
  return best;
}

const EXT_BY_LANG = {
  cpp: "cpp",
  "c++": "cpp",
  c: "c",
  java: "java",
  python: "py",
  python3: "py",
  javascript: "js",
  typescript: "ts",
  csharp: "cs",
  "c#": "cs",
  golang: "go",
  go: "go",
  kotlin: "kt",
  swift: "swift",
  rust: "rs",
  ruby: "rb",
  scala: "scala",
  php: "php",
  // HackerRank-specific language slugs
  cpp14: "cpp", cpp17: "cpp", cpp20: "cpp",
  java8: "java", java15: "java",
  pypy3: "py",
  haskell: "hs",
  bash: "sh",
  mysql: "sql", oracle: "sql", mssql: "sql", db2: "sql",
  perl: "pl",
  lua: "lua",
  clojure: "clj",
};

function extFor(language) {
  const key = (language || "").toLowerCase().trim();
  return EXT_BY_LANG[key] || "txt";
}

const HR_TRACK_NAMES = {
  "algorithms":             "Algorithms",
  "data-structures":        "Data_Structures",
  "mathematics":            "Mathematics",
  "ai":                     "AI",
  "c":                      "C",
  "cpp":                    "CPP",
  "java":                   "Java",
  "python":                 "Python",
  "ruby":                   "Ruby",
  "sql":                    "SQL",
  "databases":              "Databases",
  "linux-shell":            "Linux_Shell",
  "functional-programming": "Functional_Programming",
  "regex":                  "Regex",
};

// ---------- GitHub REST helpers ----------
async function ghFetch(path, opts = {}) {
  const { token } = await getSettings();
  if (!token) throw new Error("NO_TOKEN");
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.headers || {}),
    },
  });
  return res;
}

// Each segment of the path must be encoded separately so slashes are preserved.
function encodePath(p) {
  return p.split("/").map(encodeURIComponent).join("/");
}

function padId(n) {
  return String(n || 0).padStart(4, "0");
}

// Returns [] when the directory does not exist yet.
async function listDir(owner, repo, branch, dirPath) {
  const res = await ghFetch(
    `/repos/${owner}/${repo}/contents/${encodePath(dirPath)}?ref=${branch}`
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`LIST_DIR_FAILED_${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// Returns { content: string, sha: string } or null if the file does not exist.
async function getFile(owner, repo, branch, filePath) {
  const res = await ghFetch(
    `/repos/${owner}/${repo}/contents/${encodePath(filePath)}?ref=${branch}`
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET_FILE_FAILED_${res.status}`);
  const data = await res.json();
  return {
    content: b64DecodeUnicode(data.content.replace(/\s/g, "")),
    sha: data.sha,
  };
}

// Create or update a file. Pass sha to update an existing one.
async function upsertFile(owner, repo, branch, filePath, content, message, sha) {
  const reqBody = { message, content: b64EncodeUnicode(content), branch };
  if (sha) reqBody.sha = sha;
  const res = await ghFetch(
    `/repos/${owner}/${repo}/contents/${encodePath(filePath)}`,
    { method: "PUT", body: JSON.stringify(reqBody) }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`UPSERT_FILE_FAILED_${res.status}: ${txt}`);
  }
  return res.json();
}

// Create a brand-new file (no sha — will fail if it already exists, which we want for solutions).
async function createFile(owner, repo, branch, filePath, content, message) {
  return upsertFile(owner, repo, branch, filePath, content, message, null);
}

// Dedup guard: avoid pushing the exact same code twice for the same problem
// (e.g. user re-runs "Submit" without changing anything).
async function alreadyPushed(problemKey, codeHash) {
  const store = await chrome.storage.local.get(["pushedHashes"]);
  const map = store.pushedHashes || {};
  return map[problemKey] && map[problemKey].includes(codeHash);
}

async function rememberPushed(problemKey, codeHash) {
  const store = await chrome.storage.local.get(["pushedHashes"]);
  const map = store.pushedHashes || {};
  const list = map[problemKey] || [];
  list.push(codeHash);
  map[problemKey] = list.slice(-20); // cap history per problem
  await chrome.storage.local.set({ pushedHashes: map });
}

async function hashOf(text) {
  const enc = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function bumpStats(platform) {
  const store = await chrome.storage.local.get(["stats"]);
  const stats = store.stats || {};
  stats[platform] = (stats[platform] || 0) + 1;
  await chrome.storage.local.set({ stats });
}

// ---------- platform-specific push functions ----------
async function pushSolutionLeetCode(payload) {
  const { owner, repo, branch, token } = await getSettings(payload.platform);
  if (!token || !owner || !repo) {
    return { ok: false, error: `Missing GitHub settings for ${payload.platform}. Open the popup and fill in the ${payload.platform} tab.` };
  }

  const slug = payload.problemSlug || "";
  const title = payload.problemTitle || slug;
  const ext = extFor(payload.language);
  const codeHash = await hashOf(payload.code);

  // Derive problem number — prefer explicit questionId, fall back to parsing the title
  let questionId = payload.questionId;
  if (!questionId) {
    const m = title.match(/^(\d+)\./);
    if (m) questionId = m[1];
  }
  const paddedId = padId(questionId);
  const folderName = `${paddedId}-${slug}`;
  const problemPath = `Solutions/${folderName}`;  // all files live under Solutions/
  const problemKey  = folderName;

  const dirContents = await listDir(owner, repo, branch, problemPath);
  const solutionFiles = dirContents.filter((f) => new RegExp(`^${folderName}_\\d+\\.`).test(f.name));

  if (solutionFiles.length > 0 && await alreadyPushed(problemKey, codeHash)) {
    return { ok: true, skipped: true, reason: "Identical solution already pushed." };
  }

  // Build commit message with runtime/memory stats
  const rt = payload.runtimeDisplay || "N/A";
  const rtPct = payload.runtimePct != null ? Number(payload.runtimePct).toFixed(2) : "N/A";
  const mem = payload.memoryDisplay || "N/A";
  const memPct = payload.memoryPct != null ? Number(payload.memoryPct).toFixed(2) : "N/A";
  const commitMsg = `Time: ${rt} (${rtPct}%) | Space: ${mem} (${memPct}%) - CodeHub Sync`;

  // 1. Create per-problem README only once
  const readmePath = `${problemPath}/README.md`;
  const existingReadme = await getFile(owner, repo, branch, readmePath);
  if (!existingReadme) {
    const readmeContent = buildProblemReadme({
      folderName, questionId: paddedId, slug, title,
      difficulty: payload.difficulty || "",
      topicTags: payload.topicTags || [],
      problemStatementHtml: payload.problemStatementHtml || "",
      problemUrl: payload.problemUrl || `https://leetcode.com/problems/${slug}/`,
    });
    await createFile(owner, repo, branch, readmePath, readmeContent, "Added Problem Description");
  }

  // 2. Push the solution file
  const nextNum = solutionFiles.length + 1;
  const fileName = `${folderName}_${nextNum}.${ext}`;
  const filePath = `${problemPath}/${fileName}`;
  await createFile(owner, repo, branch, filePath, payload.code, commitMsg);

  // 3. Update main README only if the entry isn't already present
  const mainReadmePath = "README.md";
  const mainReadme = await getFile(owner, repo, branch, mainReadmePath);
  const existingMain = mainReadme?.content || "";
  const updatedMain = updateMainReadme(existingMain, problemPath, payload.topicTags || [], owner, repo, branch);
  if (updatedMain !== existingMain) {
    await upsertFile(owner, repo, branch, mainReadmePath, updatedMain, "Updated README", mainReadme?.sha);
  }

  await rememberPushed(problemKey, codeHash);
  await bumpStats(payload.platform);

  return { ok: true, filePath, solutionNumber: nextNum };
}

async function pushSolutionGFG(payload) {
  const { owner, repo, branch, token } = await getSettings(payload.platform);
  if (!token || !owner || !repo) {
    return { ok: false, error: "Missing GitHub settings for GeeksforGeeks. Open the popup and fill in the GfG tab." };
  }

  const slug       = sanitize(payload.problemSlug || "untitled");
  const title      = payload.problemTitle || slug;
  const ext        = extFor(payload.language);
  const codeHash   = await hashOf(payload.code);
  const topics     = payload.topicTags?.length ? payload.topicTags : ["General"];
  const topicDir   = sanitizeTopic(selectPrimaryTopic(topics));
  const problemDir = `${topicDir}/${slug}`;
  const problemKey = problemDir;

  const dirContents   = await listDir(owner, repo, branch, problemDir);
  const solutionFiles = dirContents.filter((f) => new RegExp(`^${slug}_\\d+\\.`).test(f.name));

  if (solutionFiles.length > 0 && await alreadyPushed(problemKey, codeHash)) {
    return { ok: true, skipped: true, reason: "Identical solution already pushed." };
  }

  const readmePath     = `${problemDir}/README.md`;
  const existingReadme = await getFile(owner, repo, branch, readmePath);
  if (!existingReadme) {
    const readmeContent = buildGFGProblemReadme({
      slug, title,
      difficulty:        payload.difficulty || "",
      topicTags:         topics,
      problemStatement:  payload.problemStatementHtml || "",
      problemUrl:        payload.problemUrl || `https://www.geeksforgeeks.org/problems/${slug}/1`,
      expectedComplexity: payload.expectedComplexity || "",
    });
    await createFile(owner, repo, branch, readmePath, readmeContent, "Added Problem Description");
  }

  const nextNum   = solutionFiles.length + 1;
  const filePath  = `${problemDir}/${slug}_${nextNum}.${ext}`;
  const commitMsg = `Added ${title} solution - CodeHub Sync`;

  await createFile(owner, repo, branch, filePath, payload.code, commitMsg);

  await rememberPushed(problemKey, codeHash);
  await bumpStats(payload.platform);

  return { ok: true, filePath, solutionNumber: nextNum };
}

async function pushSolutionHackerRank(payload) {
  const { owner, repo, branch, token } = await getSettings(payload.platform);
  if (!token || !owner || !repo) {
    return { ok: false, error: "Missing GitHub settings for HackerRank. Open the popup and fill in the HR tab." };
  }

  const slug        = payload.problemSlug || "untitled";
  const title       = payload.problemTitle || slug;
  const ext         = extFor(payload.language);
  const codeHash    = await hashOf(payload.code);

  const trackFolder     = HR_TRACK_NAMES[payload.trackSlug] || sanitizeTopic(payload.trackName) || "HackerRank";
  const subdomainFolder = payload.subdomainName ? sanitizeTopic(payload.subdomainName) : "";
  const problemDir      = subdomainFolder
    ? `${trackFolder}/${subdomainFolder}/${slug}`
    : `${trackFolder}/${slug}`;
  const problemKey = problemDir;

  const dirContents   = await listDir(owner, repo, branch, problemDir);
  const solutionFiles = dirContents.filter((f) => new RegExp(`^${slug}_\\d+\\.`).test(f.name));

  if (solutionFiles.length > 0 && await alreadyPushed(problemKey, codeHash)) {
    return { ok: true, skipped: true, reason: "Identical solution already pushed." };
  }

  const readmePath     = `${problemDir}/README.md`;
  const existingReadme = await getFile(owner, repo, branch, readmePath);
  if (!existingReadme) {
    const readmeContent = buildHRProblemReadme({
      slug, title,
      difficulty:    payload.difficulty    || "",
      trackName:     payload.trackName     || trackFolder,
      subdomainName: payload.subdomainName || "",
      bodyHtml:      payload.bodyHtml      || "",
      problemUrl:    payload.problemUrl    || `https://www.hackerrank.com/challenges/${slug}/problem`,
    });
    await createFile(owner, repo, branch, readmePath, readmeContent, "Added Problem Description");
  }

  const nextNum   = solutionFiles.length + 1;
  const filePath  = `${problemDir}/${slug}_${nextNum}.${ext}`;
  const commitMsg = `Added ${title} solution - CodeHub Sync`;

  await createFile(owner, repo, branch, filePath, payload.code, commitMsg);

  await rememberPushed(problemKey, codeHash);
  await bumpStats(payload.platform);

  return { ok: true, filePath, solutionNumber: nextNum };
}

async function pushSolution(payload) {
  if (payload.platform === "GeeksforGeeks") return pushSolutionGFG(payload);
  if (payload.platform === "HackerRank")    return pushSolutionHackerRank(payload);
  return pushSolutionLeetCode(payload);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PUSH_SOLUTION") {
    pushSolution(message.payload)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true; // keep the message channel open for the async response
  }
  if (message?.type === "GET_STATS") {
    chrome.storage.local.get(["stats"]).then((s) => sendResponse(s.stats || {}));
    return true;
  }
});
