// app.js (MODULE)

/***********************
 * FIREBASE HELPERS (from index.html)
 ***********************/
function requireFirebaseReady() {
  if (!window.firebaseDb || !window.firebaseAuth?.currentUser || !window.fs) {
    throw new Error("Firebase not ready. window.firebaseDb / window.fs missing.");
  }
}

function getTournamentRef(groupCode, tournamentId) {
  const db = window.firebaseDb;
  const { doc } = window.fs;
  return doc(db, "groups", groupCode, "tournaments", String(tournamentId));
}

function getGroupRef(groupCode) {
  const db = window.firebaseDb;
  const { doc } = window.fs;
  return doc(db, "groups", groupCode);
}

function computePlayerStatsFromResults(matchResults = []) {
  const stats = {};

  matchResults.forEach(r => {
    const allPlayers = [...r.teamAIds, ...r.teamBIds];
    const winners = r.winnerTeam === "A" ? r.teamAIds : r.teamBIds;

    allPlayers.forEach(pid => {
      if (!stats[pid]) stats[pid] = { played: 0, won: 0, lost: 0 };
      stats[pid].played++;
    });

    winners.forEach(pid => stats[pid].won++);
    allPlayers
      .filter(pid => !winners.includes(pid))
      .forEach(pid => stats[pid].lost++);
  });

  return stats;
}

function buildStatsTable(rows, containerId) {
  const sortFn = (key) => {
    const stateKey = `${containerId}_sort`;
    const prev = window[stateKey] || { key: null, asc: false };

    const asc = prev.key === key ? !prev.asc : false;
    window[stateKey] = { key, asc };

    rows.sort((a, b) => {
      if (typeof a[key] === "string") {
        return asc
          ? a[key].localeCompare(b[key])
          : b[key].localeCompare(a[key]);
      }
      return asc ? a[key] - b[key] : b[key] - a[key];
    });

    document.getElementById(containerId).innerHTML =
      buildStatsTable(rows, containerId);
  };

  return `
    <table border="1" cellpadding="6" style="cursor:pointer;">
      <tr>
        <th onclick="(${sortFn})('name')">Player</th>
        <th onclick="(${sortFn})('played')">Played</th>
        <th onclick="(${sortFn})('won')">Won</th>
        <th onclick="(${sortFn})('lost')">Lost</th>
        <th onclick="(${sortFn})('winPct')">Win %</th>
      </tr>
      ${rows.map(r => `
        <tr>
          <td>${escapeHtml(r.name)}</td>
          <td>${r.played}</td>
          <td>${r.won}</td>
          <td>${r.lost}</td>
          <td>${r.winPct}%</td>
        </tr>
      `).join("")}
    </table>
  `;
}

function buildGroupStatsShareText(stats = {}) {
  let lines = [
    `🏸 Badminton Group Stats`,
    `Group: ${groupDisplayName}`,
    ``
  ];

  Object.entries(stats).forEach(([pid, s]) => {
    const name = getPlayerNameById(pid);
    lines.push(
      `${name}: Played ${s.played}, Won ${s.won}, Lost ${s.lost}`
    );
  });

  return lines.join("\n");
}


async function fetchTournamentsFromCloud(groupCode) {
  requireFirebaseReady();
  const db = window.firebaseDb;
  const { collection, getDocs } = window.fs;

  const colRef = collection(db, "groups", groupCode, "tournaments");
  const snap = await getDocs(colRef);

  const list = [];
  snap.forEach(docSnap => {
    list.push(docSnap.data());
  });

  return list;
}

function renderPlayerStatsFromCloud(playerStats = {}) {
  const container = document.getElementById("playerStatsTable");
  if (!container) return;

  if (!playerStats || Object.keys(playerStats).length === 0) {
    container.innerHTML = "<p>No player stats available.</p>";
    return;
  }

  const rows = Object.entries(playerStats).map(([pid, stats]) => {
    const name = getPlayerNameById(pid);
    const isPOT = potIds.includes(pid);
  
    return `
      <tr>
        <td>
          ${escapeHtml(name)}
          ${isPOT ? '<span title="Player of the Tournament"> ⭐</span>' : ''}
        </td>
        <td>${stats.played}</td>
        <td>${stats.won}</td>
        <td>${stats.lost}</td>
      </tr>
    `;
  });

  container.innerHTML = `
    <table border="1" cellpadding="6">
      <tr>
        <th>Player</th>
        <th>Played</th>
        <th>Won</th>
        <th>Lost</th>
      </tr>
      ${rows.join("")}
    </table>
  `;
}

async function showGroupStatsOnHome(groupCode) {
  try {
    requireFirebaseReady();

    const { collection, getDocs } = window.fs;
    const db = window.firebaseDb;

    const snap = await getDocs(
      collection(db, "groups", groupCode, "tournaments")
    );

    if (snap.empty) return;

    const aggregated = {};

    snap.forEach(docSnap => {
      const t = docSnap.data();
      if (t.status !== "COMPLETED" || !t.playerStats) return;

      Object.entries(t.playerStats).forEach(([pid, s]) => {
        if (!aggregated[pid]) {
          aggregated[pid] = { played: 0, won: 0, lost: 0 };
        }
        aggregated[pid].played += s.played || 0;
        aggregated[pid].won += s.won || 0;
        aggregated[pid].lost += s.lost || 0;
      });
    });

    if (Object.keys(aggregated).length === 0) return;

    renderPlayerStatsIntoContainer(
      aggregated,
      "groupStatsHomeTable"
    );

    document.getElementById("groupStatsHome").style.display = "block";
  } catch (err) {
    console.error("❌ Failed to load group stats on home", err);
  }
}

async function openTournamentHistory() {
  try {
    requireFirebaseReady();

    const { collection, getDocs, query, orderBy } = window.fs;
    const db = window.firebaseDb;

    const listEl = document.getElementById("tournamentHistoryList");
    listEl.innerHTML = "🔄 Loading tournaments...";

    const q = query(
      collection(db, "groups", groupCodeActive, "tournaments"),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      listEl.innerHTML = "<p>No tournaments found.</p>";
      showStep(5);
      return;
    }

    listEl.innerHTML = "";

    snap.forEach(docSnap => {
      const t = docSnap.data();
      const tid = docSnap.id;

      let actions = "";

      if (t.status === "COMPLETED") {
        actions = `
          <button onclick="viewCompletedTournament('${tid}')">
            📊 View Stats
          </button>
        `;
      } else {
        actions = `
          <button onclick="resumeTournament('${tid}')">
            ▶ Resume
          </button>
        `;
      }

      listEl.innerHTML += `
        <div class="schedule-card">
          <strong>${t.playDate || "Unknown Date"}</strong>
          <div>Status: <strong>${t.status}</strong></div>
          ${actions}
        </div>
      `;
    });

    showStep(5);

  } catch (err) {
    console.error(err);
    alert("Failed to load tournament history.");
  }
}

function renderPlayerStatsIntoContainer(playerStats, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Build rows with derived win %
  let rows = Object.entries(playerStats).map(([pid, s]) => {
    const played = s.played || 0;
    const won = s.won || 0;
    const lost = s.lost || 0;
    const winPct = played > 0 ? (won / played) * 100 : 0;

    return {
      pid,
      name: getPlayerNameById(pid),
      played,
      won,
      lost,
      winPct: Number(winPct.toFixed(1))
    };
  });

  // Default sort: Win % desc
  rows.sort((a, b) => b.winPct - a.winPct);

  container.innerHTML = buildStatsTable(rows, containerId);
}


function setStep4Mode(mode) {
  step4Mode = mode;

  const titleEl = document.getElementById("step4Title");

  if (titleEl) {
    titleEl.textContent =
      mode === "PLAY" ? "Play" : "Tournament Stats";
  }

  toggleStep4ModeElements(mode);

  // VIEW mode should show final summary
  const finalSection = document.getElementById("finalSummarySection");
  if (finalSection) {
    finalSection.style.display =
      mode === "VIEW" ? "block" : "none";
  }
}

function computePlayerOfTournament(matchResults = []) {
  const winCount = {};

  matchResults.forEach(r => {
    const winners =
      r.winnerTeam === "A" ? r.teamAIds :
      r.winnerTeam === "B" ? r.teamBIds :
      [];

    winners.forEach(pid => {
      winCount[pid] = (winCount[pid] || 0) + 1;
    });
  });

  if (Object.keys(winCount).length === 0) {
    return "N/A";
  }

  const maxWins = Math.max(...Object.values(winCount));
  const topIds = Object.keys(winCount).filter(
    pid => winCount[pid] === maxWins
  );

  const names = topIds.map(pid => getPlayerNameById(pid));
  return `${names.join(", ")} (${maxWins} wins)`;
}

function getPlayerOfTournamentIds(matchResults = []) {
  const winCount = {};

  matchResults.forEach(r => {
    const winners =
      r.winnerTeam === "A" ? r.teamAIds :
      r.winnerTeam === "B" ? r.teamBIds :
      [];

    winners.forEach(pid => {
      winCount[pid] = (winCount[pid] || 0) + 1;
    });
  });

  if (Object.keys(winCount).length === 0) return [];

  const maxWins = Math.max(...Object.values(winCount));
  return Object.keys(winCount).filter(pid => winCount[pid] === maxWins);
}


/***********************
 * WIZARD STATE
 ***********************/
let currentStep = 1;
let addPlayerMode = false;
let currentTournamentId = null;
let hasPlayStarted = false;
let step4Mode = "PLAY"; // PLAY | VIEW

/***********************
 * GLOBAL STATE (current group/tournament)
 ***********************/
let groupKey = ""; // normalized name (local cache)
let groupDisplayName = "";
let groupCodeActive = ""; // Firestore document id = groupCode
let groupPlayers = []; // [{id,name,hand,deleted?}...]

let manageMode = false;

let availableTodayMap = {}; // {playerId: true/false}
let teamMap = {}; // {playerId: "A"|"B"|""}

let scheduledMatches = []; // [{matchNo, teamAIds, teamBIds, teamASnapshot, teamBSnapshot}]

/***********************
 * UI NAVIGATION
 ***********************/
function showStep(stepNo) {
  currentStep = stepNo;

  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`step${i}`);
    if (el) el.style.display = i === stepNo ? "block" : "none";
  }

  const stepText = document.getElementById("currentStepText");

  if (stepText) {
    stepText.textContent = stepNo <= 4 ? stepNo : "History";
  }

  // Stepper UI only highlights steps 1–4
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`s${i}`);
    if (!el) continue;

    el.classList.remove("active");
    el.classList.remove("done");

    if (i < stepNo && stepNo <= 4) el.classList.add("done");
    if (i === stepNo) el.classList.add("active");
  }
}


function goBack() {
  // Step 4 special handling
  if (currentStep === 4) {
    if (step4Mode === "VIEW") {
      showStep(5); // Tournament History
      return;
    }
    if (step4Mode === "PLAY") {
      showStep(3);
      return;
    }
  }

  if (currentStep > 1) {
    showStep(currentStep - 1);
  }
}

function goHome() {
  if (currentTournamentId && hasPlayStarted) {
    alert(
      "Tournament play is in progress. Please complete the tournament or finish entering scores before going home."
    );
    return;
  }
  showStep(1);
}


/***********************
 * UTILITIES
 ***********************/
function normalizeGroupName(name) {
  return (name || "").trim().toLowerCase();
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escapeHtml(text) {
  return (text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getTodayDateString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getMatchesPerPlayer() {
  const val = Number(document.getElementById("matchesPerPlayer").value);
  return val;
}

function getRandomnessLevel() {
  const el = document.getElementById("randomnessLevel");
  let val = el ? Number(el.value) : 30;
  if (Number.isNaN(val)) val = 30;
  return Math.max(0, Math.min(100, val));
}

function getRng() {
  const seedStr = (document.getElementById("seedInput")?.value || "").trim();
  if (!seedStr) return Math.random;
  return mulberry32(hashSeedToInt(seedStr));
}

function getNumberOfCourts() {
  const val = Number(document.getElementById("numberOfCourts")?.value);
  if (!val || val < 1) return 1;
  return Math.min(val, 3); // restrict to max 3 for now
}

function shuffleArray(arr, rngFn) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rngFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function getEnteredGroupCode() {
  return (document.getElementById("groupCode")?.value || "").trim().toUpperCase();
}

function makeGroupCode() {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `BDM-${num}`;
}

function setGroupCodeUI({ showBox, codeText, enableGenerate }) {
  const box = document.getElementById("groupCodeBox");
  const txt = document.getElementById("groupCodeText");
  const btn = document.getElementById("generateGroupCodeBtn");

  if (box) box.style.display = showBox ? "block" : "none";
  if (txt) txt.textContent = codeText || "";
  if (btn) btn.disabled = !enableGenerate;
}

function assignTeamsRandomlyPreview() {
  const available = groupPlayers.filter(p => availableTodayMap[p.id]);
  if (available.length < 4) {
    alert("At least 4 available players required.");
    return;
  }

  // Clear previous assignments
  available.forEach(p => (teamMap[p.id] = ""));

  const shuffled = [...available];
  shuffleArray(shuffled, Math.random);

  const teamSize = Math.floor(shuffled.length / 2);

  // Assign equal teams
  shuffled.slice(0, teamSize).forEach(p => {
  teamMap[p.id] = "A";
  });

  shuffled.slice(teamSize, teamSize * 2).forEach(p => {
    teamMap[p.id] = "B";
  });

  // Remaining players stay unassigned (bench)
  renderTeamAssignmentPanel();
}


function isTournamentInProgress() {
  return Boolean(currentTournamentId);
}

async function shareGroupPlayerStats() {
  try {
    requireFirebaseReady();

    const { collection, getDocs } = window.fs;
    const db = window.firebaseDb;

    const snap = await getDocs(
      collection(db, "groups", groupCodeActive, "tournaments")
    );

    const aggregated = {};

    snap.forEach(docSnap => {
      const t = docSnap.data();
      if (t.status !== "COMPLETED" || !t.playerStats) return;

      Object.entries(t.playerStats).forEach(([pid, s]) => {
        if (!aggregated[pid]) {
          aggregated[pid] = { played: 0, won: 0, lost: 0 };
        }
        aggregated[pid].played += s.played || 0;
        aggregated[pid].won += s.won || 0;
        aggregated[pid].lost += s.lost || 0;
      });
    });

    if (Object.keys(aggregated).length === 0) {
      alert("No completed tournament stats to share.");
      return;
    }

    const text = buildGroupStatsShareText(aggregated);

    if (navigator.share) {
      await navigator.share({ text });
    } else {
      await navigator.clipboard.writeText(text);
      alert("Stats copied to clipboard. You can paste and share.");
    }

  } catch (err) {
    console.error(err);
    alert("Failed to share player stats.");
  }
}

function isValidBadmintonScore(scoreA, scoreB) {
  if (scoreA < 0 || scoreB < 0) return false;
  if (scoreA > 30 || scoreB > 30) return false;
  if (scoreA === scoreB) return false;

  const max = Math.max(scoreA, scoreB);
  const min = Math.min(scoreA, scoreB);
  const diff = max - min;

  // Must reach at least 21 to win
  if (max < 21) return false;

  // If max is exactly 21–29
  if (max < 30) {
    // Must win by at least 2
    return diff >= 2;
  }

  // If max is 30 → ONLY valid is 30–29
  if (max === 30) {
    return min === 29;
  }

  return false;
}

function groupMatchesIntoRounds(matches, courts) {
  const rounds = [];
  let currentRound = [];
  let usedPlayers = new Set();

  matches.forEach(match => {
    const players = [...match.teamAIds, ...match.teamBIds];

    const hasConflict = players.some(pid => usedPlayers.has(pid));

    // If conflict OR courts full → start new round
    if (hasConflict || currentRound.length >= courts) {
      if (currentRound.length > 0) {
        rounds.push(currentRound);
      }
      currentRound = [];
      usedPlayers = new Set();
    }

    currentRound.push(match);
    players.forEach(pid => usedPlayers.add(pid));
  });

  if (currentRound.length > 0) {
    rounds.push(currentRound);
  }

  return rounds;
}

function toggleStep4ModeElements(mode) {

  document.querySelectorAll(".play-only")
    .forEach(el => {
      el.style.display = mode === "PLAY" ? "" : "none";
    });

  document.querySelectorAll(".view-only")
    .forEach(el => {
      el.style.display = mode === "VIEW" ? "" : "none";
    });
}

/***********************
 * PLAYER HELPERS (ID based)
 ***********************/
function getPlayerById(pid) {
  return groupPlayers.find(p => p.id === pid) || null;
}

function getPlayerNameById(pid, fallbackName = "") {
  const p = getPlayerById(pid);
  return p?.name || fallbackName || "Deleted Player";
}

/***********************
 * SEEDED RNG
 ***********************/
function hashSeedToInt(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/***********************
 * FIRESTORE: GROUP CRUD
 ***********************/
async function createGroupInCloud(groupCode, groupName) {
  requireFirebaseReady();
  const db = window.firebaseDb;
  const { doc, setDoc, serverTimestamp } = window.fs;

  const ref = doc(db, "groups", groupCode);

  await setDoc(
    ref,
    {
      groupCode,
      groupName,
      createdAt: serverTimestamp(),
      players: [],
      tournaments: []
    },
    { merge: true }
  );
}

async function fetchGroupFromCloud(groupCode) {
  requireFirebaseReady();
  const db = window.firebaseDb;
  const { doc, getDoc } = window.fs;

  const ref = doc(db, "groups", groupCode);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;
  return snap.data();
}

async function savePlayersToCloud(groupCode, players) {
  requireFirebaseReady();
  const db = window.firebaseDb;
  const { doc, setDoc } = window.fs;

  const ref = doc(db, "groups", groupCode);

  await setDoc(
    ref,
    {
      players: players || []
    },
    { merge: true }
  );
}

async function showPlayerStats() {
  try {
    requireFirebaseReady();

    if (!groupCodeActive) {
      alert("Please fetch a group first.");
      return;
    }

    const container = document.getElementById("playerStatsTable");
    if (!container) return;

    container.innerHTML = "🔄 Loading player stats from cloud…";

    const { collection, getDocs } = window.fs;
    const db = window.firebaseDb;

    const snap = await getDocs(
      collection(db, "groups", groupCodeActive, "tournaments")
    );

    if (snap.empty) {
      container.innerHTML = "<p>No tournaments found.</p>";
      return;
    }

    // ✅ Aggregate stats across ALL completed tournaments
    const aggregated = {};

    snap.forEach(docSnap => {
      const t = docSnap.data();
      if (t.status !== "COMPLETED" || !t.playerStats) return;

      Object.entries(t.playerStats).forEach(([pid, stats]) => {
        if (!aggregated[pid]) {
          aggregated[pid] = { played: 0, won: 0, lost: 0 };
        }
        aggregated[pid].played += stats.played || 0;
        aggregated[pid].won += stats.won || 0;
        aggregated[pid].lost += stats.lost || 0;
      });
    });

    if (Object.keys(aggregated).length === 0) {
      container.innerHTML = "<p>No completed tournaments yet.</p>";
      return;
    }

    // ✅ Build table rows
    const rows = Object.entries(aggregated)
      .map(([pid, s]) => {
        const name = getPlayerNameById(pid);
        return `
          <tr>
            <td>${escapeHtml(name)}</td>
            <td>${s.played}</td>
            <td>${s.won}</td>
            <td>${s.lost}</td>
          </tr>
        `;
      })
      .join("");

    container.innerHTML = `
      <table border="1" cellpadding="6">
        <tr>
          <th>Player</th>
          <th>Matches Played</th>
          <th>Wins</th>
          <th>Losses</th>
        </tr>
        ${rows}
      </table>
    `;

  } catch (err) {
    console.error(err);
    document.getElementById("playerStatsTable").innerHTML =
      "<p>❌ Failed to load player stats.</p>";
  }
}

async function showUpcomingTournamentsFromCloud() {
  try {
    requireFirebaseReady();

    const listEl = document.getElementById("upcomingList");
    if (!listEl) return;

    listEl.innerHTML = "🔄 Loading tournaments…";

    const { collection, getDocs, query, orderBy } = window.fs;
    const db = window.firebaseDb;

    const q = query(
      collection(db, "groups", groupCodeActive, "tournaments"),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      listEl.innerHTML = "<p>No tournaments found.</p>";
      return;
    }

    listEl.innerHTML = "";
    let shown = 0;
    const MAX_HOME_TOURNAMENTS = 2;

    snap.forEach(docSnap => {
      const t = docSnap.data();
      const tid = docSnap.id;

      // ❌ Do NOT show completed tournaments on Home
      if (t.status === "COMPLETED") return;

      // ❌ Limit number shown on Home
      if (shown >= MAX_HOME_TOURNAMENTS) return;
      shown++;

      listEl.innerHTML += `
        <div class="schedule-card">
          <strong>${t.playDate}</strong>
          <div>Status: <strong>${t.status}</strong></div>

          ${
            t.status === "SCHEDULED"
              ? `<button onclick="resumeTournament('${tid}')">▶ Resume</button>
                 <span class="badge">⏸ Not Started</span>`
              : `<button onclick="resumeTournament('${tid}')">▶ Resume</button>
                 <span class="badge">▶ In Progress</span>`
          }
        </div>
      `;
    });

// If nothing active/scheduled exists
if (shown === 0) {
  listEl.innerHTML = "<p>No active or scheduled tournaments.</p>";
}


  } catch (err) {
    console.error(err);
    document.getElementById("upcomingList").innerHTML =
      "<p>❌ Error loading tournaments.</p>";
  }
}


async function resumeTournament(tournamentId) {
  try {
    requireFirebaseReady();
    const ref = getTournamentRef(groupCodeActive, tournamentId);
    const snap = await window.fs.getDoc(ref);

    if (!snap.exists()) {
      alert("Tournament not found in cloud.");
      return;
    }
    const data = snap.data();
    
    // 🚫 Do not allow resume for completed tournaments
    if (data.status === "COMPLETED") {
      alert("This tournament is already completed and cannot be resumed.");
      return;
    }
    scheduledMatches = data.scheduledMatches || [];
    currentTournamentId = tournamentId;
    
    hasPlayStarted = (data.matchResults || []).length > 0;
    // ✅ Restore saved match results
    window._resumedMatchResults = data.matchResults || [];

    const homeBtn = document.getElementById("homeBtnStep4");
    if (homeBtn) homeBtn.disabled = true;

    document.getElementById("playDate").value = data.playDate;

    renderScheduleCardsFromIds();
    showStep(3);

  } catch (err) {
    console.error(err);
    alert("Failed to load tournament.");
  }
}


/***********************
 * STEP 1: FETCH GROUP (Cloud)
 ***********************/
async function checkGroupHistory() {
  const groupCode = getEnteredGroupCode();
  const msgEl = document.getElementById("historyMessage");

  if (!groupCode) {
    if (msgEl) msgEl.textContent = "Please enter a Group Code (example: BDM-482913).";
    return;
  }

  try {
    if (msgEl) msgEl.textContent = "🔄 Fetching from Cloud...";

    const cloudGroup = await fetchGroupFromCloud(groupCode);

    if (!cloudGroup) {
      if (msgEl) msgEl.textContent = "Group not found in Cloud. You can generate a new Group Code.";
      const historyBtn = document.getElementById("historyBtn");
      if (historyBtn) historyBtn.style.display = "none";
      document.getElementById("historySection").style.display = "none";
      document.getElementById("upcomingSection").style.display = "none";
      // ✅ If group has NO players yet → show player count setup
      if (!cloudGroup.players || cloudGroup.players.length === 0) {
        document.getElementById("newGroupSetup").style.display = "block";
      } else {
        document.getElementById("newGroupSetup").style.display = "none";
      }
      setGroupCodeUI({ showBox: false, codeText: "", enableGenerate: true });
      return;
    }

    // ✅ Apply global state from cloud
    groupCodeActive = groupCode;
    const historyBtn = document.getElementById("historyBtn");
    if (historyBtn) historyBtn.style.display = "inline-block";
    groupDisplayName = cloudGroup.groupName || "(Unnamed Group)";
    groupKey = normalizeGroupName(groupDisplayName);
    groupPlayers = cloudGroup.players || [];
    // ✅ Show overall stats on Home (if any completed tournaments exist)
    await showGroupStatsOnHome(groupCode);

    document.getElementById("clubName").value = groupDisplayName;

    // init availability/team maps
    availableTodayMap = {};
    teamMap = {};
    groupPlayers.forEach(p => {
      availableTodayMap[p.id] = true;
      teamMap[p.id] = "";
    });

    if (msgEl) msgEl.textContent = `✅ Group found in Cloud: ${groupDisplayName}`;
    
    setGroupCodeUI({ showBox: true, codeText: groupCode, enableGenerate: false });
    // ✅ Show upcoming / saved tournaments from cloud
    await showUpcomingTournamentsFromCloud();
    document.getElementById("upcomingSection").style.display = "block";

    // Hide local history views for now (cloud tournaments later)
    document.getElementById("historySection").style.display = "none";
    document.getElementById("newGroupSetup").style.display = "none";
  } catch (err) {
    console.error(err);
    if (msgEl) msgEl.textContent = "❌ Error fetching group from Cloud. Check console.";
  }
}

/***********************
 * STEP 1: GENERATE GROUP CODE (Cloud)
 ***********************/
async function generateGroupCode() {
  const nameInput = document.getElementById("clubName").value;
  const displayName = (nameInput || "").trim();

  if (!displayName) {
    alert("Please enter a Group Name first.");
    return;
  }

  try {
    const code = makeGroupCode();
    await createGroupInCloud(code, displayName);

    // set state
    groupCodeActive = code;
    groupDisplayName = displayName;
    groupKey = normalizeGroupName(displayName);
    groupPlayers = [];

    document.getElementById("groupCode").value = code;
    setGroupCodeUI({ showBox: true, codeText: code, enableGenerate: false });

    alert("✅ Group Code generated and saved to Cloud: " + code);
  } catch (err) {
    console.error(err);
    alert("❌ Failed to generate group code in Cloud. Check console.");
  }
}

async function viewCompletedTournament(tournamentId) {
  try {
    requireFirebaseReady();

    const ref = getTournamentRef(groupCodeActive, tournamentId);
    const snap = await window.fs.getDoc(ref);

    if (!snap.exists()) {
      alert("Tournament not found.");
      return;
    }

    const data = snap.data();
    if (data.status !== "COMPLETED") {
      alert("Only completed tournaments can be viewed.");
      return;
    }

    // Render results & stats
    const potIds = getPlayerOfTournamentIds(data.matchResults || []);
    renderPlayerStatsFromCloud(data.playerStats || {}, potIds);
    
    renderCompletedMatchSummary(data.matchResults || []);

    const potText = computePlayerOfTournament(data.matchResults || []);
    const potEl = document.getElementById("playerOfTournament");
    if (potEl) {
      potEl.innerHTML = `<strong>${potText}</strong>`;
    }

    showStep(4); // reuse final summary UI
    setStep4Mode("VIEW"); 
    
  } catch (err) {
    console.error(err);
    alert("Failed to load tournament stats.");
  }
}

function renderCompletedMatchSummary(results = []) {
  if (!results.length) {
    document.getElementById("matchSummary").innerHTML =
      "<p>No match data available.</p>";
    return;
  }

  let html = `
    <table border="1" cellpadding="6">
      <tr>
        <th>Team A</th>
        <th>Score</th>
        <th>Team B</th>
        <th>Score</th>
      </tr>
  `;

  results.forEach(r => {
    const a = r.teamAIds.map((id, i) =>
      getPlayerNameById(id, r.teamASnapshot?.[i])
    );
    const b = r.teamBIds.map((id, i) =>
      getPlayerNameById(id, r.teamBSnapshot?.[i])
    );

    html += `
      <tr>
        <td>${a.join(" + ")}</td>
        <td>${r.scoreA}</td>
        <td>${b.join(" + ")}</td>
        <td>${r.scoreB}</td>
      </tr>
    `;
  });

  html += "</table>";
  document.getElementById("matchSummary").innerHTML = html;
}


/***********************
 * STEP 1 -> STEP 2
 ***********************/
async function goNextFromSetup() {
  const nameInput = document.getElementById("clubName").value;
  groupDisplayName = (nameInput || "").trim();

  if (!groupDisplayName) {
    alert("Please enter a Club / Group Name.");
    return;
  }

  if (!groupCodeActive) {
    alert("Please Fetch Group (using Group Code) OR Generate Group Code first.");
    return;
  }

  groupKey = normalizeGroupName(groupDisplayName);

  const matchesPerPlayer = getMatchesPerPlayer();
  if (!matchesPerPlayer || matchesPerPlayer < 1) {
    alert("Please enter a valid Matches per Player value.");
    return;
  }

  // If no players yet (new group), create placeholders using playerCount
  if (!groupPlayers || groupPlayers.length === 0) {
    const count = Number(document.getElementById("playerCount").value);
    if (!count || count < 4) {
      alert("Please enter at least 4 players for doubles.");
      return;
    }

    groupPlayers = [];
    for (let i = 0; i < count; i++) {
      groupPlayers.push({
        id: uid(),
        name: "",
        hand: "Right"
      });
    }

    // ✅ SAVE placeholders immediately
    if (groupCodeActive) {
      await savePlayersToCloud(groupCodeActive, groupPlayers);
    }

    // init today maps
    availableTodayMap = {};
    teamMap = {};
    groupPlayers.forEach(p => {
      availableTodayMap[p.id] = true;
      teamMap[p.id] = "";
    });
  } else {
    // existing group players from cloud
    availableTodayMap = {};
    teamMap = {};
    groupPlayers.forEach(p => {
      availableTodayMap[p.id] = true;
      teamMap[p.id] = "";
    });
  }

  manageMode = false;
  renderPlayersPanel();
  updateManageButtonState();
  renderTeamAssignmentPanel();

  showStep(2);
}

/***********************
 * STEP 2: Players Panel
 ***********************/
function renderPlayersPanel() {
  const panel = document.getElementById("playersPanel");
  panel.innerHTML = "";

  groupPlayers.forEach((p, idx) => {
    panel.innerHTML += `
      <div style="border-bottom:1px solid #eee; padding:8px 0;">
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <label>
            <input type="checkbox" ${availableTodayMap[p.id] ? "checked" : ""} 
              onchange="window.toggleAvailability('${p.id}', this.checked)">
            Available Today
          </label>

          <span style="min-width:70px;"><strong>P${idx + 1}</strong></span>

          <input type="text" id="pname_${p.id}" placeholder="Player Name"
            value="${escapeHtml(p.name)}"
            ${!manageMode && p.name ? "disabled" : ""}
            style="width:180px;"
          />

          <select id="phand_${p.id}" ${!manageMode && p.name ? "disabled" : ""}>
            <option value="Right" ${p.hand === "Right" ? "selected" : ""}>Right</option>
            <option value="Left" ${p.hand === "Left" ? "selected" : ""}>Left</option>
          </select>

          ${
            manageMode && p.name
              ? `
                <button type="button" onclick="window.saveEditedPlayer('${p.id}')">Save Edit</button>
                <button type="button" onclick="window.deletePlayer('${p.id}')">Delete</button>
              `
              : ""
          }
        </div>
      </div>
    `;
  });

  document.getElementById("manageModeText").textContent = manageMode
    ? "Manage Mode ON (cloud players will be updated)"
    : "";
}

function toggleManagePlayers() {
  if (addPlayerMode) return;

  manageMode = !manageMode;
  const btn = document.getElementById("managePlayersBtn");
  btn.textContent = manageMode ? "Done" : "🛠️ Manage Players";
  renderPlayersPanel();
}

function updateManageButtonState() {
  const manageBtn = document.getElementById("managePlayersBtn");
  if (!manageBtn) return;

  if (addPlayerMode) {
    manageBtn.disabled = true;
    return;
  }

  const hasUnnamed = groupPlayers.some(p => !p.name);
  manageBtn.disabled = hasUnnamed;
}

async function saveEditedPlayer(playerId) {

  if (currentTournamentId) {
    alert("Players cannot be modified after tournament creation.");
   return;
  }
  const nameEl = document.getElementById(`pname_${playerId}`);
  const handEl = document.getElementById(`phand_${playerId}`);

  const newName = (nameEl.value || "").trim();
  const newHand = handEl.value;

  if (!newName) {
    alert("Player name cannot be empty.");
    return;
  }

  // duplicate check by name (good UX)
  const lowerNew = newName.toLowerCase();
  const otherNames = groupPlayers
    .filter(p => p.id !== playerId && p.name)
    .map(p => p.name.toLowerCase());

  if (otherNames.includes(lowerNew)) {
    alert("Duplicate player name in this group. Please choose a unique name.");
    return;
  }

  const p = groupPlayers.find(x => x.id === playerId);
  if (!p) return;

  p.name = newName;
  p.hand = newHand;

  renderPlayersPanel();
  updateManageButtonState();
  renderTeamAssignmentPanel();

  // ✅ save to cloud
  if (groupCodeActive) {
    await savePlayersToCloud(groupCodeActive, groupPlayers);
  }
}

async function deletePlayer(playerId) {

  if (currentTournamentId) {
    alert("Players cannot be modified after tournament creation.");
    return;
  }
  const p = groupPlayers.find(x => x.id === playerId);
  if (!p) return;

  const ok = confirm(
    `Delete "${p.name}" from group?\nPast tournaments will still show using snapshots.`
  );
  if (!ok) return;

  groupPlayers = groupPlayers.filter(x => x.id !== playerId);

  delete availableTodayMap[playerId];
  delete teamMap[playerId];

  renderPlayersPanel();
  renderTeamAssignmentPanel();

  // ✅ save to cloud
  if (groupCodeActive) {
    await savePlayersToCloud(groupCodeActive, groupPlayers);
  }
}

/***********************
 * STEP 2: Add Player (cloud)
 ***********************/
function startAddPlayer() {
  addPlayerMode = true;

  const panel = document.getElementById("addPlayerPanel");
  if (panel) panel.style.display = "block";

  const n = document.getElementById("newPlayerName");
  const h = document.getElementById("newPlayerHand");
  if (n) n.value = "";
  if (h) h.value = "Right";

  const manageBtn = document.getElementById("managePlayersBtn");
  if (manageBtn) manageBtn.disabled = true;

  const addBtn = document.getElementById("addPlayerBtn");
  if (addBtn) addBtn.disabled = true;

  manageMode = false;
  if (manageBtn) manageBtn.textContent = "🛠️ Manage Players";

  renderPlayersPanel();
  updateManageButtonState();
}

function cancelAddPlayer() {
  addPlayerMode = false;

  const panel = document.getElementById("addPlayerPanel");
  if (panel) panel.style.display = "none";

  const manageBtn = document.getElementById("managePlayersBtn");
  if (manageBtn) manageBtn.disabled = false;

  const addBtn = document.getElementById("addPlayerBtn");
  if (addBtn) addBtn.disabled = false;

  updateManageButtonState();
}

async function saveNewPlayer() {

  if (currentTournamentId) {
    alert("Players cannot be modified after tournament creation.");
   return;
  }
  
  const name = (document.getElementById("newPlayerName").value || "").trim();
  const hand = document.getElementById("newPlayerHand").value;

  if (!name) {
    alert("Please enter player name.");
    return;
  }

  const lowerName = name.toLowerCase();
  const exists = groupPlayers.some(p => (p.name || "").toLowerCase() === lowerName);
  if (exists) {
    alert("Player already exists in this group.");
    return;
  }

  const newPlayer = { id: uid(), name, hand };

  groupPlayers.push(newPlayer);

  availableTodayMap[newPlayer.id] = true;
  teamMap[newPlayer.id] = "";

  cancelAddPlayer();
  renderPlayersPanel();
  updateManageButtonState();
  renderTeamAssignmentPanel();

  // ✅ save to cloud
  if (groupCodeActive) {
    await savePlayersToCloud(groupCodeActive, groupPlayers);
  }
}

/***********************
 * STEP 2: Team Assignment Panel
 ***********************/
function renderTeamAssignmentPanel() {
  const panel = document.getElementById("teamAssignmentPanel");
  panel.innerHTML = "";

  const availablePlayers = groupPlayers.filter(p => availableTodayMap[p.id]);

  if (availablePlayers.length === 0) {
    panel.innerHTML = "<p>No available players selected.</p>";
    updateTeamCounts();
    return;
  }

  availablePlayers.forEach(p => {
    const assigned = teamMap[p.id] || "";
    const color =
      assigned === "A" ? "#1976d2" :
      assigned === "B" ? "#ef6c00" :
      "#ccc";
    panel.innerHTML += `
      <div style="
        padding:8px 10px;
        border-bottom:1px solid #eee;
        display:flex;
        align-items:center;
        gap:10px;
        border-left:6px solid ${color};
        ">
        <span style="
        font-weight:bold;
        color:white;
        background:${color};
        padding:2px 8px;
        border-radius:12px;
        min-width:70px;
        text-align:center;
        ">
        ${assigned ? `Team ${assigned}` : "Unassigned"}
        </span>
        <strong>${escapeHtml(p.name || "(Unnamed)")}</strong> (${p.hand})
        <label style="margin-left:10px;">
          <input type="radio" name="team_${p.id}" value="A"
            ${assigned === "A" ? "checked" : ""}
            onchange="window.setTeam('${p.id}', 'A')"> Team A
        </label>
        <label style="margin-left:10px;">
          <input type="radio" name="team_${p.id}" value="B"
            ${assigned === "B" ? "checked" : ""}
            onchange="window.setTeam('${p.id}', 'B')"> Team B
        </label>
      </div>
    `;
  });

  updateTeamCounts();
}

function setTeam(playerId, team) {
  teamMap[playerId] = team;
  updateTeamCounts();
}

function toggleAvailability(playerId, isAvailable) {
  availableTodayMap[playerId] = isAvailable;
  if (!isAvailable) teamMap[playerId] = "";
  renderTeamAssignmentPanel();
}

function updateTeamCounts() {
  const availablePlayers = groupPlayers.filter(p => availableTodayMap[p.id]);

  let a = 0;
  let b = 0;
  availablePlayers.forEach(p => {
    if (teamMap[p.id] === "A") a++;
    if (teamMap[p.id] === "B") b++;
  });

  document.getElementById("teamACount").textContent = a;
  document.getElementById("teamBCount").textContent = b;
}

/***********************
 * STEP 2 -> STEP 3
 ***********************/
async function goNextFromPlayersTeams() {
  document.getElementById("teamAssignmentMessage").textContent = "";

  // Ensure all players have names
  for (const p of groupPlayers) {
    const nameEl = document.getElementById(`pname_${p.id}`);
    const handEl = document.getElementById(`phand_${p.id}`);

    if (nameEl && handEl) {
      p.name = (nameEl.value || "").trim();
      p.hand = handEl.value;
    }

    if (!p.name) {
      alert("Please enter names for all players in the group list.");
      return;
    }
  }

  // Save players to cloud
  if (groupCodeActive) {
    await savePlayersToCloud(groupCodeActive, groupPlayers);
  }

  const availablePlayers = groupPlayers.filter(p => availableTodayMap[p.id]);
  if (availablePlayers.length < 4) {
    alert("At least 4 available players are required for doubles.");
    return;
  }

  const teamA = [];
  const teamB = [];

  for (const p of availablePlayers) {
    if (teamMap[p.id] !== "A" && teamMap[p.id] !== "B") {
      document.getElementById("teamAssignmentMessage").textContent =
        "Please assign all available players to Team A or Team B.";
      return;
    }
    if (teamMap[p.id] === "A") teamA.push(p);
    if (teamMap[p.id] === "B") teamB.push(p);
  }

  if (teamA.length < 2 || teamB.length < 2) {
    document.getElementById("teamAssignmentMessage").textContent =
      "Each team must have at least 2 players.";
    return;
  }

  const matchesPerPlayer = getMatchesPerPlayer();
  const totalPlayers = availablePlayers.length;
  const totalMatchesNeeded = Math.ceil((totalPlayers * matchesPerPlayer) / 4);

  scheduleMatchesSmart(teamA, teamB, totalMatchesNeeded);

  const pd = document.getElementById("playDate");
  if (pd && !pd.value) pd.value = getTodayDateString();

  const msg = document.getElementById("scheduleSaveMsg");
  if (msg) msg.textContent = "";

  const homeBtn = document.getElementById("homeBtnStep3");
  if (homeBtn) homeBtn.disabled = true;

  // 🚫 Disable Let's Play until schedule is saved
  const playBtn = document.getElementById("letsPlayBtn");
  if (playBtn) playBtn.disabled = true;

  showStep(3);
}

/***********************
 * STEP 3: SCHEDULER (Guaranteed)
 ***********************/
function scheduleMatchesSmart(teamAPlayers, teamBPlayers, matchCount) {
  const rng = getRng();
  const randomnessLevel = getRandomnessLevel();

  const playedCount = {};
  const partnerCount = {};
  const opponentCount = {};

  function pairKey(a, b) {
    return [a, b].sort().join("|");
  }

  function inc(map, a, b) {
    const k = pairKey(a, b);
    map[k] = (map[k] || 0) + 1;
  }

  function get(map, a, b) {
    return map[pairKey(a, b)] || 0;
  }

  [...teamAPlayers, ...teamBPlayers].forEach(p => {
    playedCount[p.id] = 0;
  });

  scheduledMatches = [];

  function choosePair(team, partnerMap) {
    const pool = [...team];
    if (randomnessLevel > 0) shuffleArray(pool, rng);

    pool.sort((a, b) => (playedCount[a.id] || 0) - (playedCount[b.id] || 0));

    let best = null;
    let bestScore = Infinity;

    const searchLimit = Math.min(pool.length, 6);

    for (let i = 0; i < searchLimit; i++) {
      for (let j = i + 1; j < searchLimit; j++) {
        const p1 = pool[i];
        const p2 = pool[j];

        const partnerRepeat = get(partnerMap, p1.id, p2.id);
        const imbalance = (playedCount[p1.id] || 0) + (playedCount[p2.id] || 0);

        const score = imbalance + partnerRepeat * 6 + rng() * (randomnessLevel / 100);

        if (score < bestScore) {
          bestScore = score;
          best = [p1, p2];
        }
      }
    }

    return best || [pool[0], pool[1]];
  }

  let m = 1;
  let attempts = 0;
  const maxAttempts = matchCount * 50;

  while (m <= matchCount && attempts < maxAttempts) {
    attempts++;

    const [a1, a2] = choosePair(teamAPlayers, partnerCount);
    const [b1, b2] = choosePair(teamBPlayers, partnerCount);

    const opponentPenalty =
      get(opponentCount, a1.id, b1.id) +
      get(opponentCount, a1.id, b2.id) +
      get(opponentCount, a2.id, b1.id) +
      get(opponentCount, a2.id, b2.id);

    if (opponentPenalty > 4 && randomnessLevel < 50) {
      continue;
    }

    [a1, a2, b1, b2].forEach(p => {
      playedCount[p.id] = (playedCount[p.id] || 0) + 1;
    });

    inc(partnerCount, a1.id, a2.id);
    inc(partnerCount, b1.id, b2.id);

    inc(opponentCount, a1.id, b1.id);
    inc(opponentCount, a1.id, b2.id);
    inc(opponentCount, a2.id, b1.id);
    inc(opponentCount, a2.id, b2.id);

    scheduledMatches.push({
      matchNo: m,
      teamAIds: [a1.id, a2.id],
      teamBIds: [b1.id, b2.id],
      teamASnapshot: [a1.name, a2.name],
      teamBSnapshot: [b1.name, b2.name]
    });

    m++;
  }

  while (m <= matchCount) {
    const [a1, a2] = choosePair(teamAPlayers, partnerCount);
    const [b1, b2] = choosePair(teamBPlayers, partnerCount);

    [a1, a2, b1, b2].forEach(p => {
      playedCount[p.id] = (playedCount[p.id] || 0) + 1;
    });

    inc(partnerCount, a1.id, a2.id);
    inc(partnerCount, b1.id, b2.id);

    inc(opponentCount, a1.id, b1.id);
    inc(opponentCount, a1.id, b2.id);
    inc(opponentCount, a2.id, b1.id);
    inc(opponentCount, a2.id, b2.id);

    scheduledMatches.push({
      matchNo: m,
      teamAIds: [a1.id, a2.id],
      teamBIds: [b1.id, b2.id],
      teamASnapshot: [a1.name, a2.name],
      teamBSnapshot: [b1.name, b2.name]
    });

    m++;
  }

  renderScheduleCardsFromIds();
  renderFairnessReport();
}

/***********************
 * STEP 3: RENDER SCHEDULE
 ***********************/
function renderScheduleCardsFromIds() {
  const resultsDiv = document.getElementById("matchResults");
  if (!resultsDiv) return;
  resultsDiv.innerHTML = "";

  const courts = getNumberOfCourts();
  const rounds = groupMatchesIntoRounds(scheduledMatches, courts);

  rounds.forEach((round, roundIndex) => {
    resultsDiv.innerHTML += `
      <div class="round-header">
        <h3>Round ${roundIndex + 1}</h3>
      </div>
    `;

    round.forEach((match, courtIndex) => {
      const a1 = getPlayerNameById(match.teamAIds[0], match.teamASnapshot?.[0]);
      const a2 = getPlayerNameById(match.teamAIds[1], match.teamASnapshot?.[1]);
      const b1 = getPlayerNameById(match.teamBIds[0], match.teamBSnapshot?.[0]);
      const b2 = getPlayerNameById(match.teamBIds[1], match.teamBSnapshot?.[1]);

      resultsDiv.innerHTML += `
        <div class="schedule-card">
          <strong>Round ${roundIndex + 1} – Court ${courtIndex + 1}</strong>
          <div>
            <span class="badge badge-a">A</span>
            ${escapeHtml(a1)} + ${escapeHtml(a2)}
          </div>
          <div>
            <span class="badge badge-b">B</span>
            ${escapeHtml(b1)} + ${escapeHtml(b2)}
          </div>
        </div>
      `;
    });
  });

  document.getElementById("playMatchesGrid").innerHTML = "";
  document.getElementById("finalSummarySection").style.display = "none";
}

/***********************
 * STEP 3: FAIRNESS REPORT
 ***********************/
function renderFairnessReport() {
  const reportEl = document.getElementById("fairnessReport");
  if (!reportEl) return;

  if (!scheduledMatches || scheduledMatches.length === 0) {
    reportEl.innerHTML = "<p>No matches generated yet.</p>";
    return;
  }

  const idToName = {};
  (groupPlayers || []).forEach(p => (idToName[p.id] = p.name || "(Unknown Player)"));

  (scheduledMatches || []).forEach(m => {
    const aIds = m.teamAIds || [];
    const bIds = m.teamBIds || [];
    const aSnap = m.teamASnapshot || [];
    const bSnap = m.teamBSnapshot || [];
    if (aIds[0]) idToName[aIds[0]] = aSnap[0] || idToName[aIds[0]];
    if (aIds[1]) idToName[aIds[1]] = aSnap[1] || idToName[aIds[1]];
    if (bIds[0]) idToName[bIds[0]] = bSnap[0] || idToName[bIds[0]];
    if (bIds[1]) idToName[bIds[1]] = bSnap[1] || idToName[bIds[1]];
  });

  const played = {};
  const partnerCount = {};
  const opponentCount = {};

  function key2(a, b) {
    return [a, b].sort().join("|");
  }
  function inc(map, a, b) {
    const k = key2(a, b);
    map[k] = (map[k] || 0) + 1;
  }

  scheduledMatches.forEach(m => {
    const A = m.teamAIds || [];
    const B = m.teamBIds || [];
    if (A.length !== 2 || B.length !== 2) return;

    played[A[0]] = (played[A[0]] || 0) + 1;
    played[A[1]] = (played[A[1]] || 0) + 1;
    played[B[0]] = (played[B[0]] || 0) + 1;
    played[B[1]] = (played[B[1]] || 0) + 1;

    inc(partnerCount, A[0], A[1]);
    inc(partnerCount, B[0], B[1]);

    inc(opponentCount, A[0], B[0]);
    inc(opponentCount, A[0], B[1]);
    inc(opponentCount, A[1], B[0]);
    inc(opponentCount, A[1], B[1]);
  });

  const playedRows = (groupPlayers || []).map(p => ({
    id: p.id,
    name: idToName[p.id] || p.name || "(Unknown)",
    played: played[p.id] || 0
  }));

  playedRows.sort((a, b) => b.played - a.played);

  const partnerRepeats = Object.entries(partnerCount)
    .filter(([_, c]) => c > 1)
    .sort((a, b) => b[1] - a[1]);

  const opponentRepeats = Object.entries(opponentCount)
    .filter(([_, c]) => c > 1)
    .sort((a, b) => b[1] - a[1]);

  const playedCounts = playedRows.map(r => r.played);
  const maxPlayed = Math.max(...playedCounts);
  const minPlayed = Math.min(...playedCounts);
  const diff = maxPlayed - minPlayed;

  const partnerWorst = partnerRepeats.length ? partnerRepeats[0][1] : 1;
  const opponentWorst = opponentRepeats.length ? opponentRepeats[0][1] : 1;

  function safeName(id) {
    return idToName[id] || "(Unknown Player)";
  }

  function partnerToNames(pairKey) {
    const [id1, id2] = pairKey.split("|");
    return `${safeName(id1)} + ${safeName(id2)}`;
  }

  function opponentToNames(pairKey) {
    const [id1, id2] = pairKey.split("|");
    return `${safeName(id1)} vs ${safeName(id2)}`;
  }

  reportEl.innerHTML = `
    <div style="padding:12px; border:1px solid #eee; border-radius:12px; background:white;">
      <p style="margin:0;"><strong>Match Balance:</strong> Max Played = ${maxPlayed}, Min Played = ${minPlayed}, Difference = ${diff}</p>
      <p style="margin:6px 0 0 0;"><strong>Worst Partner Repeat:</strong> ${partnerWorst} time(s)</p>
      <p style="margin:6px 0 0 0;"><strong>Worst Opponent Repeat:</strong> ${opponentWorst} time(s)</p>
    </div>

    <h4 style="margin-top:14px;">✅ Matches Played Per Player</h4>
    <table border="1" cellpadding="6">
      <tr><th>Player</th><th>Matches Played</th></tr>
      ${playedRows.map(r => `
        <tr><td>${escapeHtml(r.name)}</td><td>${r.played}</td></tr>
      `).join("")}
    </table>

    <h4 style="margin-top:14px;">🤝 Partner Repeats</h4>
    ${
      partnerRepeats.length === 0
        ? "<p>No partner repeats ✅</p>"
        : `
        <table border="1" cellpadding="6">
          <tr><th>Partner Pair</th><th>Times</th></tr>
          ${partnerRepeats.map(([k, c]) => `
            <tr><td>${escapeHtml(partnerToNames(k))}</td><td>${c}</td></tr>
          `).join("")}
        </table>
      `
    }

    <h4 style="margin-top:14px;">⚔️ Opponent Repeats</h4>
    ${
      opponentRepeats.length === 0
        ? "<p>No opponent repeats ✅</p>"
        : `
        <table border="1" cellpadding="6">
          <tr><th>Opponent Pair</th><th>Times</th></tr>
          ${opponentRepeats.map(([k, c]) => `
            <tr><td>${escapeHtml(opponentToNames(k))}</td><td>${c}</td></tr>
          `).join("")}
        </table>
      `
    }
  `;
}

/***********************
 * STEP 3: SAVE SCHEDULE (local only for now)
 ***********************/
async function saveSchedule() {
  const msgEl = document.getElementById("scheduleSaveMsg");
  if (msgEl) msgEl.textContent = "";

  if (!groupCodeActive) {
    alert("Please fetch or generate a Group Code first.");
    return;
  }

  if (!scheduledMatches || scheduledMatches.length === 0) {
    alert("No schedule generated yet.");
    return;
  }

  const playDate = document.getElementById("playDate")?.value;
  if (!playDate) {
    alert("Please select a Tournament Play Date.");
    return;
  }

  const availablePlayers = groupPlayers.filter(p => availableTodayMap[p.id]);
  if (availablePlayers.length < 4) {
    alert("At least 4 available players required.");
    return;
  }

  const teamAIds = availablePlayers
    .filter(p => teamMap[p.id] === "A")
    .map(p => p.id);

  const teamBIds = availablePlayers
    .filter(p => teamMap[p.id] === "B")
    .map(p => p.id);

  if (teamAIds.length < 2 || teamBIds.length < 2) {
    alert("Each team must have at least 2 players.");
    return;
  }

  // 🔑 Generate tournamentId ONCE
  const tournamentId = Date.now().toString();

  const shuffleBtn = document.getElementById("shuffleTeamsBtn");
  if (shuffleBtn) shuffleBtn.disabled = true;

  // ✅ Re-enable Home button now that tournament is saved
  const homeBtn = document.getElementById("homeBtnStep3");
  if (homeBtn) homeBtn.disabled = false;

  const tournamentData = {
    tournamentId,
    playDate,
    matchesPerPlayer: getMatchesPerPlayer(),
    availablePlayerIds: availablePlayers.map(p => p.id),
    teamAIds,
    teamBIds,
    scheduledMatches
  };

  // 🔒 Save to cloud FIRST
  await saveScheduleToCloud(tournamentData);

  // ✅ Only after successful save
  currentTournamentId = tournamentId;

  if (msgEl) {
    msgEl.textContent = `✅ Schedule saved for ${playDate}`;
    msgEl.style.color = "green";
  }

  const playBtn = document.getElementById("letsPlayBtn");
  if (playBtn) playBtn.disabled = false;

  alert("Tournament saved to Cloud ✅");
}

async function saveScheduleToCloud(tournament) {
  try {
    requireFirebaseReady();

    const db = window.firebaseDb;
    const { doc, setDoc, serverTimestamp } = window.fs;

    const ref = doc(
      db,
      "groups",
      groupCodeActive,
      "tournaments",
      tournament.tournamentId
    );

    // ✅ STRICT, COMPLETE SCHEMA
    await setDoc(ref, {
      tournamentId: tournament.tournamentId,
      groupCode: groupCodeActive,

      createdAt: new Date().toISOString(),
      cloudSavedAt: serverTimestamp(),

      playDate: tournament.playDate,
      matchesPerPlayer: tournament.matchesPerPlayer,

      availablePlayerIds: tournament.availablePlayerIds,
      teamAIds: tournament.teamAIds,
      teamBIds: tournament.teamBIds,

      scheduledMatches: tournament.scheduledMatches,

      // 🔒 Lifecycle fields (NON-NEGOTIABLE)
      status: "SCHEDULED",
      matchResults: [],
      playerStats: {}
    });

    console.log("☁️ Tournament initialized in cloud:", ref.path);

  } catch (err) {
    console.error("❌ Failed to save tournament", err);
    alert("Failed to save tournament to cloud. Check console.");
    throw err; // IMPORTANT
  }
}



function regenerateMatches() {
  const availablePlayers = groupPlayers.filter(p => availableTodayMap[p.id]);
  const teamA = availablePlayers.filter(p => teamMap[p.id] === "A");
  const teamB = availablePlayers.filter(p => teamMap[p.id] === "B");

  if (teamA.length < 2 || teamB.length < 2) {
    alert("Each team must have at least 2 available players.");
    return;
  }

  const matchesPerPlayer = getMatchesPerPlayer();
  const totalPlayers = availablePlayers.length;
  const totalMatchesNeeded = Math.ceil((totalPlayers * matchesPerPlayer) / 4);

  scheduleMatchesSmart(teamA, teamB, totalMatchesNeeded);
}

function goNextFromSchedule() {
  if (!currentTournamentId) {
    alert("Please save the schedule before starting play.");
    return;
  }

  setStep4Mode("PLAY");
  letsPlay();
  showStep(4);
}


/***********************
 * STEP 4: PLAY (temp storage)
 ***********************/
function letsPlay() {
  if (!scheduledMatches || scheduledMatches.length === 0) {
    alert("No scheduled matches found.");
    return;
  }

  const grid = document.getElementById("playMatchesGrid");
  grid.innerHTML = "";

  scheduledMatches.forEach(match => {
    const a1 = getPlayerNameById(match.teamAIds[0], match.teamASnapshot?.[0]);
    const a2 = getPlayerNameById(match.teamAIds[1], match.teamASnapshot?.[1]);
    const b1 = getPlayerNameById(match.teamBIds[0], match.teamBSnapshot?.[0]);
    const b2 = getPlayerNameById(match.teamBIds[1], match.teamBSnapshot?.[1]);

    grid.innerHTML += `
      <div style="border:1px solid #ddd; padding:12px; border-radius:8px; margin-bottom:10px;">
        <div><strong>Match ${match.matchNo}</strong></div>
        <div style="margin-top:6px;">Team A: ${escapeHtml(a1)} + ${escapeHtml(a2)}</div>
        <div style="margin-top:6px;">Team B: ${escapeHtml(b1)} + ${escapeHtml(b2)}</div>

        <div style="margin-top:10px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <label>Score A:</label>
          <input type="number" id="scoreA${match.matchNo}" min="0" style="width:70px;">
          <label>Score B:</label>
          <input type="number" id="scoreB${match.matchNo}" min="0" style="width:70px;">
          <button onclick="window.saveMatchResult(${match.matchNo})">Save</button>
          <span id="saveMsg${match.matchNo}" style="margin-left:6px;"></span>
        </div>
      </div>
    `;
  });

  document.getElementById("finalSummarySection").style.display = "none";

  // ✅ Restore saved scores when resuming
  if (window._resumedMatchResults?.length) {
    window._resumedMatchResults.forEach(r => {
      const a = document.getElementById(`scoreA${r.matchNo}`);
      const b = document.getElementById(`scoreB${r.matchNo}`);
      const msg = document.getElementById(`saveMsg${r.matchNo}`);
  
      if (a && b) {
        a.value = r.scoreA;
        b.value = r.scoreB;
        if (msg) {
          msg.textContent = "Saved ✅";
          msg.style.fontWeight = "bold";
        }
      }
    });
  }

}

async function saveMatchResult(matchNo) {

  if (!currentTournamentId) {
    alert("Tournament not saved. Please save the schedule first.");
    return;
  }

  const scoreAEl = document.getElementById(`scoreA${matchNo}`);
  const scoreBEl = document.getElementById(`scoreB${matchNo}`);
  if (!scoreAEl || !scoreBEl) return;

  if (scoreAEl.value === "" || scoreBEl.value === "") {
    alert("Please enter both scores.");
    return;
  }

  const scoreA = Number(scoreAEl.value);
  const scoreB = Number(scoreBEl.value);

  if (Number.isNaN(scoreA) || Number.isNaN(scoreB)) {
    alert("Please enter valid numeric scores.");
    return;
  }

  if (!isValidBadmintonScore(scoreA, scoreB)) {
    alert(
      "Invalid badminton score.\n\n" +
      "Rules:\n" +
      "- Game to 21 points\n" +
      "- Win by 2\n" +
      "- At 29-29, next point wins (30-29 max)"
    );
    return;
  }

  const match = scheduledMatches.find(m => m.matchNo === matchNo);
  if (!match) return;

  const winnerTeam = scoreA > scoreB ? "A" : "B";

  const resultObj = {
    matchNo,
    teamAIds: match.teamAIds,
    teamBIds: match.teamBIds,
    teamASnapshot: match.teamASnapshot,
    teamBSnapshot: match.teamBSnapshot,
    scoreA,
    scoreB,
    winnerTeam,
    savedAt: new Date().toISOString()
  };

  const msgEl = document.getElementById(`saveMsg${matchNo}`);
  msgEl.textContent = "Saving…";

  // ✅ WAIT for cloud save
  await saveMatchResultToCloud(resultObj);  
  msgEl.textContent = `Saved (Updated) ✅ Team ${winnerTeam} won`;
  msgEl.style.fontWeight = "bold";
}


async function saveMatchResultToCloud(result) {

  if (!currentTournamentId) {
    alert("Tournament not saved. Please save schedule first.");
    return;
  }

  try {
    const { updateDoc, getDoc } = window.fs;
    const ref = getTournamentRef(groupCodeActive, currentTournamentId);

    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const data = snap.data();

    if (data.status === "COMPLETED") {
      alert("Tournament is completed. Scores cannot be edited.");
      return;
    }

    const existing = data.matchResults || [];
    const filtered = existing.filter(r => r.matchNo !== result.matchNo);
    const updatedResults = [...filtered, result];

    await updateDoc(ref, {
      matchResults: updatedResults,
      status: "ONGOING"
    });
    
    hasPlayStarted = true;
    console.log("☁️ Match result saved (deduplicated)");

  } catch (err) {
    console.error("❌ Failed to save match result", err);
  }
}



async function concludePlay() {

  if (!currentTournamentId) {
    alert("Tournament not saved. Cannot conclude play.");
    return;
  }

  try {
    requireFirebaseReady();

    if (!groupCodeActive || !currentTournamentId) {
      alert("No active tournament.");
      return;
    }

    const ref = getTournamentRef(groupCodeActive, currentTournamentId);
    const snap = await window.fs.getDoc(ref);

    if (!snap.exists()) {
      alert("Tournament not found in cloud.");
      return;
    }

    const data = snap.data();
    let groupResults = data.matchResults || [];

    // ✅ NEW: render player stats
    renderPlayerStatsFromCloud(data.playerStats || {});

    if (groupResults.length === 0) {
      // ⏳ wait once and retry (last write safety)
      await new Promise(r => setTimeout(r, 500));
    
      const retrySnap = await window.fs.getDoc(ref);
      const retryData = retrySnap.data();
      groupResults = retryData.matchResults || [];
    }
    
    if (groupResults.length === 0) {
      alert("No match results found yet. Please save scores before concluding.");
      return;
    }

    // 🏅 Compute Player of the Tournament (runtime)
    const playerWinCount = {};
    
    groupResults.forEach(r => {
      const winners =
        r.winnerTeam === "A" ? r.teamAIds :
        r.winnerTeam === "B" ? r.teamBIds :
        [];
    
      winners.forEach(pid => {
        playerWinCount[pid] = (playerWinCount[pid] || 0) + 1;
      });
    });
    
    let playerOfTournamentText = "N/A";
    
    if (Object.keys(playerWinCount).length > 0) {
      const maxWins = Math.max(...Object.values(playerWinCount));
      const topIds = Object.keys(playerWinCount)
        .filter(pid => playerWinCount[pid] === maxWins);
    
      const topNames = topIds.map(pid => getPlayerNameById(pid));
      playerOfTournamentText =
        `${topNames.join(", ")} (${maxWins} wins)`;
    }
    
    document.getElementById("playerOfTournament").innerHTML =
      `<strong>${playerOfTournamentText}</strong>`;

    const totalMatches = scheduledMatches.length;
    const savedMatches = (data.matchResults || []).length;

    if (savedMatches < totalMatches) {
      alert(`Please save all match scores (${savedMatches}/${totalMatches}).`);
      return;
    }

    let teamAWins = 0;
    let teamBWins = 0;

    groupResults.forEach(r => {
      if (r.winnerTeam === "A") teamAWins++;
      else if (r.winnerTeam === "B") teamBWins++;
    });

    let tournamentWinner = "Draw";
    if (teamAWins > teamBWins) tournamentWinner = "Team A";
    else if (teamBWins > teamAWins) tournamentWinner = "Team B";

    document.getElementById("finalHeader").innerHTML =
      `<strong>${tournamentWinner} won</strong>`;

    document.getElementById("overallSummary").innerHTML = `
      <table border="1" cellpadding="6">
        <tr>
          <th>Team A</th>
          <th>Matches Won</th>
          <th>Team B</th>
          <th>Matches Won</th>
        </tr>
        <tr>
          <td>Team A</td>
          <td>${teamAWins}</td>
          <td>Team B</td>
          <td>${teamBWins}</td>
        </tr>
      </table>
    `;

    let matchTable = `
      <table border="1" cellpadding="6">
        <tr>
          <th>Team A Players</th>
          <th>Score</th>
          <th>Team B Players</th>
          <th>Score</th>
        </tr>
    `;

    groupResults.forEach(r => {
      const aNames = r.teamAIds.map((id, i) =>
        getPlayerNameById(id, r.teamASnapshot?.[i])
      );
      const bNames = r.teamBIds.map((id, i) =>
        getPlayerNameById(id, r.teamBSnapshot?.[i])
      );

      matchTable += `
        <tr>
          <td>${aNames.join(" | ")}</td>
          <td>${r.scoreA}</td>
          <td>${bNames.join(" | ")}</td>
          <td>${r.scoreB}</td>
        </tr>
      `;
    });

    matchTable += `</table>`;
    document.getElementById("matchSummary").innerHTML = matchTable;

    document.getElementById("finalSummarySection").style.display = "block";

  } catch (err) {
    console.error(err);
    alert("Failed to conclude tournament.");
  }
}


async function saveResults() {
  alert("✅ Results saved locally. Syncing to cloud…");

  await concludeTournamentInCloud(); // ✅ WAIT for cloud update
  // ✅ Tournament completed → allow Home
  currentTournamentId = null;
  hasPlayStarted = false;
  document.getElementById("playerStatsView").style.display = "block";
  document.getElementById("tournamentStatsView").style.display = "none";

  // Refresh home so completed status is reflected
  showStep(1);
  await checkGroupHistory();
  resetAll();
}

async function concludeTournamentInCloud() {
  try {
    const ref = getTournamentRef(groupCodeActive, currentTournamentId);
    const { updateDoc, serverTimestamp, getDoc } = window.fs;

    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const data = snap.data();
    const playerStats = computePlayerStatsFromResults(data.matchResults || []);

    await updateDoc(ref, {
      status: "COMPLETED",
      playerStats,
      completedAt: serverTimestamp()
    });

    console.log("🏁 Tournament concluded in cloud");
  } catch (err) {
    console.error("❌ Failed to conclude tournament", err);
  }
}


/***********************
 * RESET
 ***********************/
function resetGroupHistory() {
  alert("Group reset is disabled. Cloud data is preserved.");
}

function resetAll() {
  document.getElementById("playerCount").value = "";
  document.getElementById("matchesPerPlayer").value = 1;
  document.getElementById("numberOfCourts").value = 1;
  document.getElementById("seedInput").value = "";
  document.getElementById("randomnessLevel").value = 30;
  const historyBtn = document.getElementById("historyBtn");
  if (historyBtn) historyBtn.style.display = "none";
  document.getElementById("matchResults").innerHTML = "";
  document.getElementById("fairnessReport").innerHTML = "";
  document.getElementById("playMatchesGrid").innerHTML = "";

  document.getElementById("teamAssignmentMessage").textContent = "";
  document.getElementById("finalSummarySection").style.display = "none";

  manageMode = false;
  availableTodayMap = {};
  teamMap = {};
  scheduledMatches = [];

  document.getElementById("clubName").value = "";
  document.getElementById("historyMessage").textContent = "";

  document.getElementById("historySection").style.display = "none";
  document.getElementById("upcomingSection").style.display = "none";

  const msg = document.getElementById("scheduleSaveMsg");
  if (msg) msg.textContent = "";

  const playDate = document.getElementById("playDate");
  if (playDate) playDate.value = "";

  groupKey = "";
  groupDisplayName = "";
  groupCodeActive = "";
  currentTournamentId = null;
  groupPlayers = [];

  setGroupCodeUI({ showBox: false, codeText: "", enableGenerate: true });

  const playBtn = document.getElementById("letsPlayBtn");
  if (playBtn) playBtn.disabled = true;

  showStep(1);
}

/***********************
 * DARK MODE
 ***********************/
function toggleDarkMode() {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  localStorage.setItem("badmintonDarkMode", isDark ? "1" : "0");
}

/***********************
 * FIRESTORE TEST WRITE
 ***********************/
async function testFirestoreWrite() {
  try {
    requireFirebaseReady();

    const db = window.firebaseDb;
    const { collection, addDoc, serverTimestamp } = window.fs;

    const ref = await addDoc(collection(db, "testWrites"), {
      message: "Hello Firestore ✅",
      createdAt: serverTimestamp()
    });

    alert("Firestore write success ✅ Doc ID: " + ref.id);
  } catch (e) {
    console.error(e);
    alert("Firestore write failed ❌ Check console");
  }
}

/***********************
 * INITIAL LOAD
 ***********************/
window.addEventListener("load", () => {
  const saved = localStorage.getItem("badmintonDarkMode");
  if (saved === "1") document.body.classList.add("dark");

  setGroupCodeUI({ showBox: false, codeText: "", enableGenerate: true });
  showStep(1);
});

/***********************
 * EXPOSE FUNCTIONS for onclick
 ***********************/
window.showStep = showStep;
window.goBack = goBack;
window.goHome = goHome;

window.toggleDarkMode = toggleDarkMode;

window.checkGroupHistory = checkGroupHistory;
window.generateGroupCode = generateGroupCode;
window.goNextFromSetup = goNextFromSetup;
window.resumeTournament = resumeTournament;
window.showPlayerStats = showPlayerStats;
window.assignTeamsRandomlyPreview = assignTeamsRandomlyPreview;
window.viewCompletedTournament = viewCompletedTournament;
window.shareGroupPlayerStats = shareGroupPlayerStats;
window.shareGroupPlayerStats = shareGroupPlayerStats;
window.openTournamentHistory = openTournamentHistory;

window.startAddPlayer = startAddPlayer;
window.cancelAddPlayer = cancelAddPlayer;
window.saveNewPlayer = saveNewPlayer;

window.toggleManagePlayers = toggleManagePlayers;
window.saveEditedPlayer = saveEditedPlayer;
window.deletePlayer = deletePlayer;

window.toggleAvailability = toggleAvailability;
window.setTeam = setTeam;

window.goNextFromPlayersTeams = goNextFromPlayersTeams;
window.regenerateMatches = regenerateMatches;
window.saveSchedule = saveSchedule;
window.goNextFromSchedule = goNextFromSchedule;

window.letsPlay = letsPlay;
window.saveMatchResult = saveMatchResult;
window.concludePlay = concludePlay;
window.saveResults = saveResults;

window.resetAll = resetAll;
window.resetGroupHistory = resetGroupHistory;

window.testFirestoreWrite = testFirestoreWrite;
