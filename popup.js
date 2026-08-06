const PLATFORMS = ["lc", "gfg", "hr"];
const PLATFORM_NAMES = { lc: "LeetCode", gfg: "GfG", hr: "HackerRank" };
const PLATFORM_HOSTS = {
  lc:  "leetcode.com",
  gfg: "geeksforgeeks.org",
  hr:  "hackerrank.com",
};

let activePlatform = "lc";
const buffer = {};  // in-memory store while switching tabs

// ── Tab status ───────────────────────────────────────────────────────────────

async function checkTabStatus() {
  const el = document.getElementById("tab-status");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";

  const platform = Object.keys(PLATFORM_HOSTS).find((p) => url.includes(PLATFORM_HOSTS[p]));
  if (!platform) {
    el.className = "tab-status tab-inactive";
    el.textContent = "Navigate to LeetCode, GfG or HackerRank.";
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "PING" }, (res) => {
    if (chrome.runtime.lastError || !res?.active) {
      el.className = "tab-status tab-error";
      el.textContent = `⚠️ Script not active — hard-refresh the tab (Ctrl+Shift+R).`;
      return;
    }
    if (platform === "lc" && !res.bridgeActive) {
      el.className = "tab-status tab-error";
      el.textContent = "⚠️ Fetch interceptor not loaded — hard-refresh the tab.";
      return;
    }
    el.className = "tab-status tab-ok";
    el.textContent = `✅ Detection active on this ${PLATFORM_NAMES[platform]} tab.`;
  });
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function loadStats() {
  chrome.runtime.sendMessage({ type: "GET_STATS" }, (stats) => {
    stats = stats || {};
    document.getElementById("stat-leetcode").textContent = stats["LeetCode"] || 0;
    document.getElementById("stat-gfg").textContent     = stats["GeeksforGeeks"] || 0;
    document.getElementById("stat-hr").textContent      = stats["HackerRank"] || 0;
  });
}

// ── Settings load/save ────────────────────────────────────────────────────────

async function loadSettings() {
  const keys = ["githubToken", "githubOwner", "githubRepo", "githubBranch",
    ...PLATFORMS.flatMap((p) => [`${p}_owner`, `${p}_repo`, `${p}_branch`])];
  const s = await chrome.storage.sync.get(keys);

  document.getElementById("githubToken").value = s.githubToken || "";

  // Migrate old single-platform keys → lc_*
  if (s.githubOwner && !s.lc_owner) {
    await chrome.storage.sync.set({
      lc_owner: s.githubOwner, lc_repo: s.githubRepo || "", lc_branch: s.githubBranch || "main",
    });
    s.lc_owner = s.githubOwner; s.lc_repo = s.githubRepo || ""; s.lc_branch = s.githubBranch || "main";
  }

  PLATFORMS.forEach((p) => {
    buffer[p] = { owner: s[`${p}_owner`] || "", repo: s[`${p}_repo`] || "", branch: s[`${p}_branch`] || "main" };
  });

  renderFields(activePlatform);
}

function renderFields(platform) {
  const d = buffer[platform] || {};
  document.getElementById("platform-owner").value  = d.owner  || "";
  document.getElementById("platform-repo").value   = d.repo   || "";
  document.getElementById("platform-branch").value = d.branch || "main";
  document.getElementById("platform-label").textContent = `${PLATFORM_NAMES[platform]} Repository`;
}

function captureFields() {
  buffer[activePlatform] = {
    owner:  document.getElementById("platform-owner").value.trim(),
    repo:   document.getElementById("platform-repo").value.trim(),
    branch: document.getElementById("platform-branch").value.trim() || "main",
  };
}

// ── Platform tab switching ────────────────────────────────────────────────────

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    captureFields();
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    activePlatform = btn.dataset.platform;
    renderFields(activePlatform);
    document.getElementById("save-status").textContent = "";
  });
});

// ── Save ──────────────────────────────────────────────────────────────────────

document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  captureFields();
  const values = { githubToken: document.getElementById("githubToken").value.trim() };
  PLATFORMS.forEach((p) => {
    values[`${p}_owner`]  = buffer[p]?.owner  || "";
    values[`${p}_repo`]   = buffer[p]?.repo   || "";
    values[`${p}_branch`] = buffer[p]?.branch || "main";
  });
  await chrome.storage.sync.set(values);
  const status = document.getElementById("save-status");
  status.style.color = "#1a7f37";
  status.textContent = "Saved ✓";
  setTimeout(() => (status.textContent = ""), 2000);
});

// ── Test Connection ───────────────────────────────────────────────────────────

document.getElementById("test-btn").addEventListener("click", async () => {
  captureFields();
  const status = document.getElementById("save-status");
  const token  = document.getElementById("githubToken").value.trim();
  const { owner, repo } = buffer[activePlatform] || {};

  if (!token || !owner || !repo) {
    status.style.color = "#c0392b";
    status.textContent = "⚠️ Fill in token, owner and repo first.";
    return;
  }
  status.style.color = "#656d76";
  status.textContent = "Testing…";

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (res.ok) {
      const data = await res.json();
      const access = data.permissions?.push ? "read/write" : "read-only";
      status.style.color = "#1a7f37";
      status.textContent = `✅ Connected! ${data.full_name} (${access})`;
    } else if (res.status === 401) {
      status.style.color = "#c0392b"; status.textContent = "❌ Invalid token — check your PAT.";
    } else if (res.status === 404) {
      status.style.color = "#c0392b"; status.textContent = "❌ Repo not found — check owner & name.";
    } else {
      status.style.color = "#c0392b"; status.textContent = `❌ GitHub error ${res.status}.`;
    }
  } catch {
    status.style.color = "#c0392b"; status.textContent = "❌ Network error.";
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

checkTabStatus();
loadSettings();
loadStats();

