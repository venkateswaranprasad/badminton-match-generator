/***********************
 * WIZARD STATE
 ***********************/
let currentStep = 1;
let addPlayerMode = false;
let currentTournamentId = null; // track currently selected/active tournament

function showStep(stepNo) {
  currentStep = stepNo;

  // Show only the current step section
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`step${i}`);
    if (el) el.style.display = i === stepNo ? "block" : "none";
  }

  // Update text "Step X of 4"
  const stepText = document.getElementById("currentStepText");
  if (stepText) stepText.textContent = stepNo;

  // Update stepper highlight
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`s${i}`);
    if (!el) continue;

    el.classList.remove("active");
    el.classList.remove("done");

    if (i < stepNo) el.classList.add("done");
    if (i === stepNo) el.classList.add("active");
  }
}

function goBack() {
  if (currentStep > 1) showStep(currentStep - 1);
}

function goHome() {
  showStep(1);
  if (groupKey) {
    checkGroupHistory();
  }
}

/***********************
 * STORAGE KEYS
 ***********************/
const GROUPS_KEY = "badmintonGroups";
const TEMP_RESULTS_KEY = "badmintonMatchResults";

/***********************
 * GLOBAL STATE (Current tournament)
 ***********************/
let groupKey = "";
let groupDisplayName = "";
let groupPlayers = [];

let manageMode = false;

// Availability & team assignment for TODAY (tournament)
let availableTodayMap = {}; // {playerId: true/false}
let teamMap = {}; // {playerId: "A" | "B"}

// Scheduled matches for tournament
// NEW SHAPE: {matchNo, teamAIds:[], teamBIds:[], teamASnapshot:[], teamBSnapshot:[]}
let scheduledMatches = [];

/***********************
 * UTILITIES
 ***********************/
function normalizeGroupName(name) {
  return (name || "").trim().toLowerCase();
}

function makeGroupCode() {
  // Example: BDM-482913
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

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getGroupsStore() {
  return JSON.parse(localStorage.getItem(GROUPS_KEY) || "{}");
}

function setGroupsStore(obj) {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(obj));
}

function getMatchesPerPlayer() {
  const val = Number(document.getElementById("matchesPerPlayer").value);
  return val;
}

function getRng() {
  const seedStr = (document.getElementById("seedInput")?.value || "").trim();
  if (!seedStr) return Math.random;
  return mulberry32(hashSeedToInt(seedStr));
}

function getRandomnessLevel() {
  const el = document.getElementById("randomnessLevel");
  let val = el ? Number(el.value) : 30;
  if (Number.isNaN(val)) val = 30;
  return Math.max(0, Math.min(100, val));
}

function shuffleArray(arr, rngFn) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rngFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function getTodayDateString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function escapeHtml(text) {
  return (text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPlayerById(pid) {
  return groupPlayers.find(p => p.id === pid) || null;
}

function getPlayerNameById(pid, fallbackName = "") {
  const p = getPlayerById(pid);
  return p?.name || fallbackName || "Deleted Player";
}

function generateGroupCode() {
  const code = "BDM-" + Math.floor(100000 + Math.random() * 900000);
  document.getElementById("groupCode").value = code;
}

function getEnteredGroupCode() {
  return (document.getElementById("groupCode").value || "").trim().toUpperCase();
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
 * STEP 1 -> STEP 2
 ***********************/
function goNextFromSetup() {
  const nameInput = document.getElementById("clubName").value;
  groupDisplayName = (nameInput || "").trim();

  if (!groupDisplayName) {
    alert("Please enter a Club / Group Name.");
    return;
  }

  groupKey = normalizeGroupName(groupDisplayName);

  const matchesPerPlayer = getMatchesPerPlayer();
  if (!matchesPerPlayer || matchesPerPlayer < 1) {
    alert("Please enter a valid Matches per Player value.");
    return;
  }

  const groups = getGroupsStore();
  const existingGroup = groups[groupKey];

  if (existingGroup) {
    groupPlayers = existingGroup.players || [];
    if (groupPlayers.length < 4) {
      alert("This group has less than 4 players. Please add more players.");
    }
  } else {
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

    groups[groupKey] = {
      groupKey,
      groupName: groupDisplayName,
      groupCode: makeGroupCode(),   // ✅ add group code
      createdAt: new Date().toISOString(),
      players: groupPlayers,
      tournaments: []
    };

    setGroupsStore(groups);
  }

  availableTodayMap = {};
  teamMap = {};
  groupPlayers.forEach(p => {
    availableTodayMap[p.id] = true;
    teamMap[p.id] = "";
  });

  manageMode = false;

  renderPlayersPanel();
  updateManageButtonState();
  renderTeamAssignmentPanel();
  showStep(2);
}

/***********************
 * STEP 2 UI: Players Panel (Left)
 ***********************/
function renderPlayersPanel() {
  const panel = document.getElementById("playersPanel");
  panel.innerHTML = "";

  const groups = getGroupsStore();
  const existingGroup = groups[groupKey];
  const isExistingGroup = !!existingGroup;
  const storedPlayers = existingGroup ? (existingGroup.players || []) : groupPlayers;

  groupPlayers = storedPlayers;

  groupPlayers.forEach((p, idx) => {
    const nameLocked = isExistingGroup && p.name && !manageMode;
    const handLocked = isExistingGroup && p.name && !manageMode;

    panel.innerHTML += `
      <div style="border-bottom:1px solid #eee; padding:8px 0;">
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <label>
            <input type="checkbox" ${availableTodayMap[p.id] ? "checked" : ""} 
              onchange="toggleAvailability('${p.id}', this.checked)">
            Available Today
          </label>

          <span style="min-width:70px;"><strong>P${idx + 1}</strong></span>

          <input type="text" id="pname_${p.id}" placeholder="Player Name"
            value="${escapeHtml(p.name)}"
            ${nameLocked ? "disabled" : ""}
            style="width:180px;"
          />

          <select id="phand_${p.id}" ${handLocked ? "disabled" : ""}>
            <option value="Right" ${p.hand === "Right" ? "selected" : ""}>Right</option>
            <option value="Left" ${p.hand === "Left" ? "selected" : ""}>Left</option>
          </select>

          ${
            manageMode && p.name
              ? `
                <button type="button" onclick="saveEditedPlayer('${p.id}')">Save Edit</button>
                <button type="button" onclick="deletePlayer('${p.id}')">Delete</button>
              `
              : ""
          }
        </div>
      </div>
    `;
  });

  document.getElementById("manageModeText").textContent = manageMode
    ? "Manage Mode ON (past history won't be modified)"
    : "";
}

function toggleManagePlayers() {
  if (addPlayerMode) return;

  manageMode = !manageMode;
  const btn = document.getElementById("managePlayersBtn");
  btn.textContent = manageMode ? "Done" : "🛠️ Manage Players";
  renderPlayersPanel();
}

/***********************
 * Save edits to a player
 ***********************/
function saveEditedPlayer(playerId) {
  const nameEl = document.getElementById(`pname_${playerId}`);
  const handEl = document.getElementById(`phand_${playerId}`);

  const newName = (nameEl.value || "").trim();
  const newHand = handEl.value;

  if (!newName) {
    alert("Player name cannot be empty.");
    return;
  }

  const lowerNew = newName.toLowerCase();
  const otherNames = groupPlayers
    .filter(p => p.id !== playerId && p.name)
    .map(p => p.name.toLowerCase());

  if (otherNames.includes(lowerNew)) {
    alert("Duplicate player name in this group. Please choose a unique name.");
    return;
  }

  const groups = getGroupsStore();
  const group = groups[groupKey];
  if (!group) return;

  const p = group.players.find(x => x.id === playerId);
  if (!p) return;

  p.name = newName;
  p.hand = newHand;

  groups[groupKey] = group;
  setGroupsStore(groups);

  groupPlayers = group.players;

  renderPlayersPanel();
  updateManageButtonState();
  renderTeamAssignmentPanel();
}

/***********************
 * Add Player Mode
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

function saveNewPlayer() {
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

  const groups = getGroupsStore();
  const group = groups[groupKey];

  if (!group) {
    alert("Group not found. Please go back and enter group name again.");
    return;
  }

  const newPlayer = { id: uid(), name, hand };

  group.players.push(newPlayer);
  groups[groupKey] = group;
  setGroupsStore(groups);

  groupPlayers = group.players;
  availableTodayMap[newPlayer.id] = true;
  teamMap[newPlayer.id] = "";

  cancelAddPlayer();

  renderPlayersPanel();
  updateManageButtonState();
  renderTeamAssignmentPanel();
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

/***********************
 * Delete player (history safe)
 ***********************/
function deletePlayer(playerId) {
  const p = groupPlayers.find(x => x.id === playerId);
  if (!p) return;

  const confirmDel = confirm(
    `Delete "${p.name}" from group profile?\nPast tournaments will still show using snapshots.`
  );
  if (!confirmDel) return;

  const groups = getGroupsStore();
  const group = groups[groupKey];
  if (!group) return;

  group.players = group.players.filter(x => x.id !== playerId);
  groups[groupKey] = group;
  setGroupsStore(groups);

  groupPlayers = group.players;

  delete availableTodayMap[playerId];
  delete teamMap[playerId];

  renderPlayersPanel();
  renderTeamAssignmentPanel();
}

/***********************
 * STEP 2 UI: Team Assignment Panel
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
    panel.innerHTML += `
      <div style="padding:6px 0; border-bottom:1px solid #eee;">
        <strong>${escapeHtml(p.name || "(Unnamed)")}</strong> (${p.hand})
        <label style="margin-left:10px;">
          <input type="radio" name="team_${p.id}" value="A"
            ${assigned === "A" ? "checked" : ""}
            onchange="setTeam('${p.id}', 'A')"> Team A
        </label>
        <label style="margin-left:10px;">
          <input type="radio" name="team_${p.id}" value="B"
            ${assigned === "B" ? "checked" : ""}
            onchange="setTeam('${p.id}', 'B')"> Team B
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
function goNextFromPlayersTeams() {
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

  // Save updated players
  const groups = getGroupsStore();
  const group = groups[groupKey];
  if (!group) {
    alert("Group not found. Please go back to Setup.");
    return;
  }

  // Duplicate name check (still good UX)
  const seen = new Set();
  for (const p of groupPlayers) {
    const key = p.name.toLowerCase();
    if (seen.has(key)) {
      alert(`Duplicate player name: "${p.name}". Please fix.`);
      return;
    }
    seen.add(key);
  }

  group.players = groupPlayers;
  groups[groupKey] = group;
  setGroupsStore(groups);

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

  showStep(3);
}

/***********************
 * STEP 3: schedule (ID based)
 ***********************/
function scheduleMatchesSmart(teamAPlayers, teamBPlayers, matchCount) {
  const resultsDiv = document.getElementById("matchResults");
  resultsDiv.innerHTML = "";

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
  const maxAttempts = matchCount * 50; // safety limit

  while (m <= matchCount && attempts < maxAttempts) {
    attempts++;
  
    const [a1, a2] = choosePair(teamAPlayers, partnerCount);
    const [b1, b2] = choosePair(teamBPlayers, partnerCount);
  
    const opponentPenalty =
      get(opponentCount, a1.id, b1.id) +
      get(opponentCount, a1.id, b2.id) +
      get(opponentCount, a2.id, b1.id) +
      get(opponentCount, a2.id, b2.id);
  
    // ❌ if penalty too high, retry (do NOT consume matchNo)
    if (opponentPenalty > 4 && randomnessLevel < 50) {
      continue;
    }
  
    // ✅ Accept match
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

  // ✅ fallback: if attempts exceeded, force-fill remaining matches
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
  
  if ((teamAPlayers.length < 4 || teamBPlayers.length < 4) && matchCount > 3) {
    console.log("Small teams detected: repeats are unavoidable for fairness.");
  }

  renderFairnessReport(playedCount, partnerCount, opponentCount);

  renderScheduleCardsFromIds();

  document.getElementById("finalSummarySection").style.display = "none";
  document.getElementById("playMatchesGrid").innerHTML = "";
}

function renderFairnessReport() {
  const reportEl = document.getElementById("fairnessReport");
  if (!reportEl) return;

  if (!scheduledMatches || scheduledMatches.length === 0) {
    reportEl.innerHTML = "<p>No matches generated yet.</p>";
    return;
  }

  // Build playerId -> best name (snapshot first, then group name)
  const idToName = {};
  
  // 1) First: fill from groupPlayers (fallback)
  (groupPlayers || []).forEach(p => {
    if (!p?.id) return;
    idToName[p.id] = p.name || "(Unknown Player)";
  });
  
  // 2) Override using snapshots from scheduledMatches (highest priority)
  (scheduledMatches || []).forEach(m => {
    const aIds = m.teamAIds || [];
    const bIds = m.teamBIds || [];
    const aSnap = m.teamASnapshot || [];
    const bSnap = m.teamBSnapshot || [];
  
    if (aIds[0]) idToName[aIds[0]] = aSnap[0] || idToName[aIds[0]] || "(Unknown Player)";
    if (aIds[1]) idToName[aIds[1]] = aSnap[1] || idToName[aIds[1]] || "(Unknown Player)";
  
    if (bIds[0]) idToName[bIds[0]] = bSnap[0] || idToName[bIds[0]] || "(Unknown Player)";
    if (bIds[1]) idToName[bIds[1]] = bSnap[1] || idToName[bIds[1]] || "(Unknown Player)";
  });


  // Counters
  const played = {};         // playerId -> count
  const partnerCount = {};   // "id1|id2" -> count
  const opponentCount = {};  // "id1|id2" -> count

  function key2(a, b) {
    return [a, b].sort().join("|");
  }

  function inc(map, a, b) {
    const k = key2(a, b);
    map[k] = (map[k] || 0) + 1;
  }

  function safeIncPlayed(id) {
    played[id] = (played[id] || 0) + 1;
  }

  // Walk through matches
  scheduledMatches.forEach(m => {
    const A = m.teamAIds || [];
    const B = m.teamBIds || [];

    if (A.length !== 2 || B.length !== 2) return;

    // played count
    safeIncPlayed(A[0]);
    safeIncPlayed(A[1]);
    safeIncPlayed(B[0]);
    safeIncPlayed(B[1]);

    // partner repeats
    inc(partnerCount, A[0], A[1]);
    inc(partnerCount, B[0], B[1]);

    // opponent repeats (every A vs every B)
    inc(opponentCount, A[0], B[0]);
    inc(opponentCount, A[0], B[1]);
    inc(opponentCount, A[1], B[0]);
    inc(opponentCount, A[1], B[1]);
  });

  // Prepare played rows (include ALL current players, even 0 played)
  const playedRows = (groupPlayers || []).map(p => {
    return {
      id: p.id,
      name: p.name || "(Unknown)",
      played: played[p.id] || 0
    };
  });

  playedRows.sort((a, b) => b.played - a.played);

  // Partner repeats list (only those > 1)
  const partnerRepeats = Object.entries(partnerCount)
    .filter(([_, c]) => c > 1)
    .sort((a, b) => b[1] - a[1]);

  // Opponent repeats list (only those > 1)
  const opponentRepeats = Object.entries(opponentCount)
    .filter(([_, c]) => c > 1)
    .sort((a, b) => b[1] - a[1]);

  // Helper for name display
  function safeName(id) {
    return idToName[id] || "(Unknown Player)";
  }
  
  function pairToNames(pairKey) {
      const [id1, id2] = pairKey.split("|");
      return `${safeName(id1)} vs ${safeName(id2)}`;
  }

  function partnerToNames(pairKey) {
    const [id1, id2] = pairKey.split("|");
    return `${safeName(id1)} + ${safeName(id2)}`;
  }

  // Basic fairness metrics
  const playedCounts = playedRows.map(r => r.played);
  const maxPlayed = Math.max(...playedCounts);
  const minPlayed = Math.min(...playedCounts);
  const diff = maxPlayed - minPlayed;

  const partnerWorst = partnerRepeats.length ? partnerRepeats[0][1] : 1;
  const opponentWorst = opponentRepeats.length ? opponentRepeats[0][1] : 1;

  reportEl.innerHTML = `
    <div style="padding:12px; border:1px solid #eee; border-radius:12px; background:white;">
      <p style="margin:0;"><strong>Match Balance:</strong> Max Played = ${maxPlayed}, Min Played = ${minPlayed}, Difference = ${diff}</p>
      <p style="margin:6px 0 0 0;"><strong>Worst Partner Repeat:</strong> ${partnerWorst} time(s)</p>
      <p style="margin:6px 0 0 0;"><strong>Worst Opponent Repeat:</strong> ${opponentWorst} time(s)</p>
    </div>

    <h4 style="margin-top:14px;">✅ Matches Played Per Player</h4>
    <table border="1" cellpadding="6">
      <tr>
        <th>Player</th>
        <th>Matches Played</th>
      </tr>
      ${playedRows.map(r => `
        <tr>
          <td>${escapeHtml(r.name)}</td>
          <td>${r.played}</td>
        </tr>
      `).join("")}
    </table>

    <h4 style="margin-top:14px;">🤝 Partner Repeats (same team-mates)</h4>
    ${partnerRepeats.length === 0 ? "<p>No partner repeats ✅</p>" : `
      <table border="1" cellpadding="6">
        <tr>
          <th>Partner Pair</th>
          <th>Times</th>
        </tr>
        ${partnerRepeats.map(([k, c]) => `
          <tr>
            <td>${escapeHtml(partnerToNames(k))}</td>
            <td>${c}</td>
          </tr>
        `).join("")}
      </table>
    `}

    <h4 style="margin-top:14px;">⚔️ Opponent Repeats</h4>
    ${opponentRepeats.length === 0 ? "<p>No opponent repeats ✅</p>" : `
      <table border="1" cellpadding="6">
        <tr>
          <th>Opponent Pair</th>
          <th>Times</th>
        </tr>
        ${opponentRepeats.map(([k, c]) => `
          <tr>
            <td>${escapeHtml(pairToNames(k))}</td>
            <td>${c}</td>
          </tr>
        `).join("")}
      </table>
    `}
  `;
}

function renderScheduleCardsFromIds() {
  const resultsDiv = document.getElementById("matchResults");
  if (!resultsDiv) return;

  resultsDiv.innerHTML = "";

  scheduledMatches.forEach(match => {
    const a1 = getPlayerNameById(match.teamAIds[0], match.teamASnapshot?.[0]);
    const a2 = getPlayerNameById(match.teamAIds[1], match.teamASnapshot?.[1]);
    const b1 = getPlayerNameById(match.teamBIds[0], match.teamBSnapshot?.[0]);
    const b2 = getPlayerNameById(match.teamBIds[1], match.teamBSnapshot?.[1]);

    resultsDiv.innerHTML += `
      <div class="schedule-card">
        <strong>Match ${match.matchNo}</strong>
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
}

/***********************
 * Save schedule
 ***********************/
function saveSchedule() {
  const msgEl = document.getElementById("scheduleSaveMsg");
  if (msgEl) msgEl.textContent = "";

  if (!groupKey) {
    alert("Group not found. Please start from Setup.");
    return;
  }

  if (!scheduledMatches || scheduledMatches.length === 0) {
    alert("No schedule generated yet.");
    return;
  }

  const playDateEl = document.getElementById("playDate");
  const playDate = (playDateEl?.value || "").trim();
  if (!playDate) {
    alert("Please select a Tournament Play Date.");
    return;
  }

  const availablePlayers = groupPlayers.filter(p => availableTodayMap[p.id]);
  const teamAIds = availablePlayers.filter(p => teamMap[p.id] === "A").map(p => p.id);
  const teamBIds = availablePlayers.filter(p => teamMap[p.id] === "B").map(p => p.id);

  const tournamentRecord = {
    tournamentId: Date.now(),
    createdAt: new Date().toISOString(),
    playDate,
    status: "SCHEDULED",
    matchesPerPlayer: getMatchesPerPlayer(),
    availablePlayerIds: availablePlayers.map(p => p.id),
    teamAIds,
    teamBIds,
    scheduledMatches,
    matchResults: []
  };

  const groups = getGroupsStore();
  const group = groups[groupKey];

  if (!group) {
    alert("Group not found in storage.");
    return;
  }

  group.tournaments = group.tournaments || [];
  group.tournaments.push(tournamentRecord);

  groups[groupKey] = group;
  setGroupsStore(groups);

  currentTournamentId = tournamentRecord.tournamentId;

  if (msgEl) {
    msgEl.textContent = `✅ Schedule saved for ${playDate}`;
    msgEl.style.color = "green";
  }

  alert("Schedule saved ✅");

  const homeBtn = document.getElementById("homeBtnStep3");
  if (homeBtn) homeBtn.disabled = false;
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
  if (currentTournamentId) {
    const groups = getGroupsStore();
    const group = groups[groupKey];

    if (group && group.tournaments) {
      const t = group.tournaments.find(x => x.tournamentId === currentTournamentId);
      if (t) {
        t.status = "IN_PROGRESS";
        groups[groupKey] = group;
        setGroupsStore(groups);
      }
    }
  }

  letsPlay();
  showStep(4);
}

/***********************
 * STEP 4: Play (ID based)
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

        <div style="margin-top:6px;">
          Team A: ${escapeHtml(a1)} + ${escapeHtml(a2)}
        </div>

        <div style="margin-top:6px;">
          Team B: ${escapeHtml(b1)} + ${escapeHtml(b2)}
        </div>

        <div style="margin-top:10px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <label>Score A:</label>
          <input type="number" id="scoreA${match.matchNo}" min="0" style="width:70px;">
          <label>Score B:</label>
          <input type="number" id="scoreB${match.matchNo}" min="0" style="width:70px;">
          <button onclick="saveMatchResult(${match.matchNo})">Save</button>
          <span id="saveMsg${match.matchNo}" style="margin-left:6px;"></span>
        </div>
      </div>
    `;
  });

  document.getElementById("finalSummarySection").style.display = "none";
}

/***********************
 * Save per-match result (temp)
 ***********************/
function saveMatchResult(matchNo) {
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

  if (scoreA === scoreB) {
    alert("Draw is not allowed. Please enter a winning score.");
    return;
  }

  const match = scheduledMatches.find(m => m.matchNo === matchNo);
  if (!match) return;

  const winnerTeam = scoreA > scoreB ? "A" : "B";

  const msgEl = document.getElementById(`saveMsg${matchNo}`);
  msgEl.textContent = `Saved ✅ Team ${winnerTeam} won`;
  msgEl.style.fontWeight = "bold";

  const resultObj = {
    groupKey,
    groupName: groupDisplayName,
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

  storeTempMatchResult(resultObj);
}

function storeTempMatchResult(resultObj) {
  const existing = JSON.parse(localStorage.getItem(TEMP_RESULTS_KEY) || "[]");

  const filtered = existing.filter(
    r => !(r.groupKey === resultObj.groupKey && r.matchNo === resultObj.matchNo)
  );

  filtered.push(resultObj);
  localStorage.setItem(TEMP_RESULTS_KEY, JSON.stringify(filtered));
}

/***********************
 * Conclude Play -> Summary
 ***********************/
function concludePlay() {
  const allResults = JSON.parse(localStorage.getItem(TEMP_RESULTS_KEY) || "[]");
  const groupResults = allResults
    .filter(r => r.groupKey === groupKey)
    .sort((a, b) => a.matchNo - b.matchNo);

  if (groupResults.length === 0) {
    alert("No match results found. Save scores for matches first.");
    return;
  }

  let teamAWins = 0;
  let teamBWins = 0;

  groupResults.forEach(r => {
    if (r.winnerTeam === "A") teamAWins++;
    else teamBWins++;
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
        <th>No. of matches won</th>
        <th>Team B</th>
        <th>No. of matches won</th>
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
        <th>Team A Points</th>
        <th>Team B Players</th>
        <th>Team B Points</th>
      </tr>
  `;

  groupResults.forEach(r => {
    const aNames = r.teamAIds.map((id, i) => getPlayerNameById(id, r.teamASnapshot?.[i]));
    const bNames = r.teamBIds.map((id, i) => getPlayerNameById(id, r.teamBSnapshot?.[i]));

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

  // Player of tournament (ID based)
  const playerWinCount = {}; // {playerId: wins}

  groupResults.forEach(r => {
    const winnersIds = r.winnerTeam === "A" ? r.teamAIds : r.teamBIds;
    winnersIds.forEach(pid => {
      playerWinCount[pid] = (playerWinCount[pid] || 0) + 1;
    });
  });

  const maxWins = Math.max(...Object.values(playerWinCount));
  const topIds = Object.keys(playerWinCount).filter(pid => playerWinCount[pid] === maxWins);

  const topNames = topIds.map(pid => getPlayerNameById(pid));
  document.getElementById("playerOfTournament").innerHTML =
    `Player of the tournament: <strong>${topNames.join(", ")}</strong> (${maxWins} wins)`;

  document.getElementById("finalSummarySection").style.display = "block";
}

/***********************
 * Save Results -> Update stored tournament
 ***********************/
function saveResults() {
  const allResults = JSON.parse(localStorage.getItem(TEMP_RESULTS_KEY) || "[]");
  const groupResults = allResults
    .filter(r => r.groupKey === groupKey)
    .sort((a, b) => a.matchNo - b.matchNo);

  if (groupResults.length === 0) {
    alert("No saved match results found. Save scores first.");
    return;
  }

  const groups = getGroupsStore();
  const group = groups[groupKey];

  if (!group) {
    alert("Group not found. Please restart.");
    return;
  }

  group.tournaments = group.tournaments || [];

  if (currentTournamentId) {
    const existingTournament = group.tournaments.find(t => t.tournamentId === currentTournamentId);

    if (existingTournament) {
      existingTournament.status = "COMPLETED";
      existingTournament.matchResults = groupResults;
      existingTournament.completedAt = new Date().toISOString();
      existingTournament.scheduledMatches = scheduledMatches;
    } else {
      // fallback create a completed record
      group.tournaments.push({
        tournamentId: Date.now(),
        createdAt: new Date().toISOString(),
        playDate: "",
        status: "COMPLETED",
        matchesPerPlayer: getMatchesPerPlayer(),
        availablePlayerIds: [],
        teamAIds: [],
        teamBIds: [],
        scheduledMatches,
        matchResults: groupResults,
        completedAt: new Date().toISOString()
      });
    }
  } else {
    // no saved schedule -> still save completed
    group.tournaments.push({
      tournamentId: Date.now(),
      createdAt: new Date().toISOString(),
      playDate: "",
      status: "COMPLETED",
      matchesPerPlayer: getMatchesPerPlayer(),
      availablePlayerIds: [],
      teamAIds: [],
      teamBIds: [],
      scheduledMatches,
      matchResults: groupResults,
      completedAt: new Date().toISOString()
    });
  }

  groups[groupKey] = group;
  setGroupsStore(groups);

  const remaining = allResults.filter(r => r.groupKey !== groupKey);
  localStorage.setItem(TEMP_RESULTS_KEY, JSON.stringify(remaining));

  alert("Results saved ✅ Starting a new tournament for this group.");
  resetAll();
}

/***********************
 * Fetch group history (Updated)
 ***********************/
function checkGroupHistory() {
  const nameInput = document.getElementById("clubName").value;
  const display = (nameInput || "").trim();

  if (!display) {
    document.getElementById("historyMessage").textContent =
      "Please enter a group name to fetch history.";
    return;
  }

  const key = normalizeGroupName(display);
  const groups = getGroupsStore();

  if (!groups[key] || (groups[key].tournaments || []).length === 0) {
    document.getElementById("historyMessage").textContent =
      "No history found for this group.";

    document.getElementById("historySection").style.display = "none";
    document.getElementById("upcomingSection").style.display = "none";

    document.getElementById("newGroupSetup").style.display = "block";
    return;
  }

  if (!groups[key]) {
    document.getElementById("historyMessage").textContent =
      "Group not found. You can generate a new Group Code.";
  
    document.getElementById("historySection").style.display = "none";
    document.getElementById("upcomingSection").style.display = "none";
    document.getElementById("newGroupSetup").style.display = "block";
  
    // ✅ Allow generate for new group
    setGroupCodeUI({ showBox: false, codeText: "", enableGenerate: true });
  
    return;
  }

    const total = (existingGroup.tournaments || []).length;

  if (total === 0) {
    document.getElementById("historyMessage").textContent =
      "Group found ✅ but no tournaments saved yet.";
  
    document.getElementById("historySection").style.display = "none";
    document.getElementById("upcomingSection").style.display = "none";
  
    document.getElementById("newGroupSetup").style.display = "none";
    return;
  }

    // ✅ Group exists → show group code and disable generate
  const existingGroup = groups[key];
  const code = existingGroup.groupCode || "(missing)";
  setGroupCodeUI({ showBox: true, codeText: code, enableGenerate: false });

  const total = (groups[key].tournaments || []).length;
  const completed = (groups[key].tournaments || []).filter(t => t.status === "COMPLETED").length;
  const upcoming = total - completed;

  document.getElementById("historyMessage").textContent =
    `Found ${total} tournament(s): ${upcoming} upcoming/saved schedule(s), ${completed} completed.`;

  document.getElementById("newGroupSetup").style.display = "none";
  document.getElementById("historySection").style.display = "block";

  showGroupHistory(key);
  showTournamentStats();
  showUpcomingTournaments(key);
}

  function generateGroupCode() {
    const nameInput = document.getElementById("clubName").value;
    const displayName = (nameInput || "").trim();
  
    if (!displayName) {
      alert("Please enter a Group Name first.");
      return;
    }
  
    const key = normalizeGroupName(displayName);
    const groups = getGroupsStore();
  
    // ✅ If group already exists, don't regenerate
    if (groups[key]) {
      alert("Group already exists ✅ Group Code cannot be generated again.");
      setGroupCodeUI({
        showBox: true,
        codeText: groups[key].groupCode || "(missing)",
        enableGenerate: false
      });
      return;
    }
  
    const newCode = makeGroupCode();
  
    // ✅ Create the group skeleton
    groups[key] = {
      groupKey: key,
      groupName: displayName,
      groupCode: newCode,
      createdAt: new Date().toISOString(),
      players: [],
      tournaments: []
    };
  
    setGroupsStore(groups);
  
    // ✅ Update UI
    document.getElementById("historyMessage").textContent =
      "Group created ✅ Now go Next and add players.";
  
    setGroupCodeUI({ showBox: true, codeText: newCode, enableGenerate: false });
  
    // ✅ Hide new group count? (optional - you can keep visible)
    document.getElementById("newGroupSetup").style.display = "block";
}

function showUpcomingTournaments(key) {
  const groups = getGroupsStore();
  const group = groups[key];

  const sec = document.getElementById("upcomingSection");
  const list = document.getElementById("upcomingList");

  if (!sec || !list) return;

  const upcoming = (group.tournaments || [])
    .filter(t => t.status === "SCHEDULED" || t.status === "IN_PROGRESS")
    .sort((a, b) => (a.playDate || "").localeCompare(b.playDate || ""));

  if (upcoming.length === 0) {
    sec.style.display = "none";
    list.innerHTML = "";
    return;
  }

  let html = `
    <table border="1" cellpadding="6">
      <tr>
        <th>Play Date</th>
        <th>Created At</th>
        <th>Status</th>
        <th>Action</th>
      </tr>
  `;

  upcoming.forEach(t => {
    html += `
      <tr>
        <td><strong>${t.playDate || "-"}</strong></td>
        <td>${t.createdAt ? new Date(t.createdAt).toLocaleString() : "-"}</td>
        <td>${t.status}</td>
        <td>
          <button onclick="startPlayFromSavedTournament('${key}', ${t.tournamentId})">
            ▶ Start Play
          </button>
          <button class="danger" onclick="deleteSavedTournament('${key}', ${t.tournamentId})">
            🗑 Delete
          </button>
        </td>
      </tr>
    `;
  });

  html += `</table>`;

  list.innerHTML = html;
  sec.style.display = "block";
}

function deleteSavedTournament(key, tournamentId) {
  const groups = getGroupsStore();
  const group = groups[key];
  if (!group) return;

  const t = (group.tournaments || []).find(x => x.tournamentId === tournamentId);
  if (!t) return;

  const ok = confirm(`Delete saved schedule?\nPlay Date: ${t.playDate || "-"}\nStatus: ${t.status}`);
  if (!ok) return;

  group.tournaments = (group.tournaments || []).filter(x => x.tournamentId !== tournamentId);
  groups[key] = group;
  setGroupsStore(groups);

  alert("Saved schedule deleted ✅");

  showUpcomingTournaments(key);
  showGroupHistory(key);
  showTournamentStats();
}

function startPlayFromSavedTournament(key, tournamentId) {
  const groups = getGroupsStore();
  const group = groups[key];

  if (!group) {
    alert("Group not found.");
    return;
  }

  const t = (group.tournaments || []).find(x => x.tournamentId === tournamentId);
  if (!t) {
    alert("Tournament not found.");
    return;
  }

  if (!Array.isArray(t.scheduledMatches) || t.scheduledMatches.length === 0) {
    alert("No schedule found in this tournament.");
    return;
  }

  groupKey = key;
  groupDisplayName = group.groupName || key;
  groupPlayers = group.players || [];

  scheduledMatches = t.scheduledMatches;
  currentTournamentId = t.tournamentId;

  const playDateEl = document.getElementById("playDate");
  if (playDateEl && t.playDate) playDateEl.value = t.playDate;

  t.status = "IN_PROGRESS";
  groups[key] = group;
  setGroupsStore(groups);

  renderScheduleCardsFromIds();
  showStep(3);
  alert("Loaded saved schedule ✅ You can now click Let’s Play.");
}

function showGroupHistory(key) {
  const groups = getGroupsStore();
  const tournaments = (groups[key].tournaments || [])
    .filter(t => t.status === "COMPLETED")
    .slice()
    .reverse();

  const historyList = document.getElementById("historyList");
  historyList.innerHTML = "";

  if (tournaments.length === 0) {
    historyList.innerHTML = "<p>No tournament history found.</p>";
    return;
  }

  let tableHtml = `
    <table border="1" cellpadding="6">
      <tr>
        <th>Completed At</th>
        <th>Team A Wins</th>
        <th>Team B Wins</th>
        <th>Action</th>
      </tr>
  `;

  tournaments.forEach(t => {
    const matchResults = t.matchResults || [];

    let teamAWins = 0;
    let teamBWins = 0;

    matchResults.forEach(r => {
      if (r.winnerTeam === "A") teamAWins++;
      else if (r.winnerTeam === "B") teamBWins++;
    });

    tableHtml += `
      <tr>
        <td>${new Date(t.completedAt || t.createdAt || "").toLocaleString()}</td>
        <td>${teamAWins}</td>
        <td>${teamBWins}</td>
        <td>
          <button onclick="viewTournamentSummary('${key}', ${t.tournamentId})">
            📊 View Summary
          </button>
        </td>
      </tr>
    `;
  });

  tableHtml += `</table>`;
  tableHtml += `<div id="historySummary" style="margin-top:15px;"></div>`;

  historyList.innerHTML = tableHtml;
}

function showTournamentStats() {
  const tView = document.getElementById("tournamentStatsView");
  const pView = document.getElementById("playerStatsView");
  if (tView) tView.style.display = "block";
  if (pView) pView.style.display = "none";
}

function showPlayerStats() {
  const tView = document.getElementById("tournamentStatsView");
  const pView = document.getElementById("playerStatsView");
  if (tView) tView.style.display = "none";
  if (pView) pView.style.display = "block";
  renderPlayerStatsForGroup(groupKey);
}

function renderPlayerStatsForGroup(key) {
  const groups = getGroupsStore();
  const group = groups[key];

  const container = document.getElementById("playerStatsTable");
  if (!container) return;

  if (!group) {
    container.innerHTML = "<p>Group not found.</p>";
    return;
  }

  const players = group.players || [];
  const tournaments = (group.tournaments || []).filter(t => t.status === "COMPLETED");

  if (players.length === 0) {
    container.innerHTML = "<p>No players found in this group.</p>";
    return;
  }

  if (tournaments.length === 0) {
    container.innerHTML = "<p>No completed tournaments found for this group.</p>";
    return;
  }

  const stats = {};
  players.forEach(p => {
    stats[p.id] = { id: p.id, name: p.name, played: 0, won: 0 };
  });

  tournaments.forEach(t => {
    const matchResults = t.matchResults || [];
    matchResults.forEach(m => {
      (m.teamAIds || []).forEach(pid => { if (stats[pid]) stats[pid].played++; });
      (m.teamBIds || []).forEach(pid => { if (stats[pid]) stats[pid].played++; });

      const winners = m.winnerTeam === "A" ? (m.teamAIds || []) : (m.teamBIds || []);
      winners.forEach(pid => { if (stats[pid]) stats[pid].won++; });
    });
  });

  const rows = Object.values(stats).sort((a, b) => b.won - a.won);

  let html = `
    <table border="1" cellpadding="6">
      <tr>
        <th>Player Name</th>
        <th>Matches Played</th>
        <th>Matches Won</th>
        <th>Win %</th>
      </tr>
  `;

  rows.forEach(r => {
    const winPct = r.played > 0 ? ((r.won / r.played) * 100).toFixed(1) : "0.0";
    html += `
      <tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${r.played}</td>
        <td>${r.won}</td>
        <td>${winPct}%</td>
      </tr>
    `;
  });

  html += `</table>`;
  container.innerHTML = html;
}

function closeHistorySummary() {
  const summaryDiv = document.getElementById("historySummary");
  if (summaryDiv) summaryDiv.innerHTML = "";
}

function viewTournamentSummary(groupKey, tournamentId) {
  const groups = getGroupsStore();
  const group = groups[groupKey];

  if (!group) {
    alert("Group not found.");
    return;
  }

  const t = (group.tournaments || []).find(x => x.tournamentId === tournamentId);
  if (!t) {
    alert("Tournament not found.");
    return;
  }

  const results = (t.matchResults || []).slice().sort((a, b) => a.matchNo - b.matchNo);
  if (results.length === 0) {
    alert("No match results saved for this tournament.");
    return;
  }

  let teamAWins = 0;
  let teamBWins = 0;

  results.forEach(r => {
    if (r.winnerTeam === "A") teamAWins++;
    else if (r.winnerTeam === "B") teamBWins++;
  });

  let tournamentWinner = "Draw";
  if (teamAWins > teamBWins) tournamentWinner = "Team A";
  else if (teamBWins > teamAWins) tournamentWinner = "Team B";

  const playerWinCount = {};
  results.forEach(r => {
    const winners = r.winnerTeam === "A" ? (r.teamAIds || []) : (r.teamBIds || []);
    winners.forEach(pid => {
      playerWinCount[pid] = (playerWinCount[pid] || 0) + 1;
    });
  });

  const maxWins = Math.max(...Object.values(playerWinCount));
  const topPlayers = Object.keys(playerWinCount)
    .filter(pid => playerWinCount[pid] === maxWins)
    .map(pid => getPlayerNameById(pid));

  let matchTable = `
    <table border="1" cellpadding="6" style="margin-top:10px;">
      <tr>
        <th>Team A Players</th>
        <th>Team A Points</th>
        <th>Team B Players</th>
        <th>Team B Points</th>
      </tr>
  `;

  results.forEach(r => {
    const aNames = (r.teamAIds || []).map((id, i) => getPlayerNameById(id, r.teamASnapshot?.[i]));
    const bNames = (r.teamBIds || []).map((id, i) => getPlayerNameById(id, r.teamBSnapshot?.[i]));

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

  const summaryDiv = document.getElementById("historySummary");
  if (!summaryDiv) return;

  summaryDiv.innerHTML = `
    <div style="padding:12px; border:1px solid #ddd; border-radius:12px; background:white;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <h3 style="margin:0;">Final Result</h3>
        <button class="secondary" onclick="closeHistorySummary()">❌ Close</button>
      </div>

      <p style="margin-top:10px;"><strong>${tournamentWinner} won</strong></p>

      <h4>Overall Summary</h4>
      <table border="1" cellpadding="6">
        <tr>
          <th>Team A</th>
          <th>No. of matches won</th>
          <th>Team B</th>
          <th>No. of matches won</th>
        </tr>
        <tr>
          <td>Team A</td>
          <td>${teamAWins}</td>
          <td>Team B</td>
          <td>${teamBWins}</td>
        </tr>
      </table>

      <h4 style="margin-top:15px;">Match Summary</h4>
      ${matchTable}

      <h4 style="margin-top:15px;">Player of the Tournament</h4>
      <p><strong>${topPlayers.join(", ")}</strong> (${maxWins} wins)</p>
    </div>
  `;

  summaryDiv.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetGroupHistory() {
  const nameInput = document.getElementById("clubName").value;
  const display = (nameInput || "").trim();

  if (!display) {
    alert("Please enter a group name first.");
    return;
  }

  const key = normalizeGroupName(display);
  const groups = getGroupsStore();

  if (!groups[key]) {
    alert("Group not found.");
    return;
  }

  const ok = confirm(
    `Reset history for "${display}"?\nThis will delete all saved tournaments for this group.`
  );
  if (!ok) return;

  groups[key].tournaments = [];
  setGroupsStore(groups);

  const allResults = JSON.parse(localStorage.getItem(TEMP_RESULTS_KEY) || "[]");
  const remaining = allResults.filter(r => r.groupKey !== key);
  localStorage.setItem(TEMP_RESULTS_KEY, JSON.stringify(remaining));

  document.getElementById("historyMessage").textContent = "History cleared ✅";
  document.getElementById("historySection").style.display = "none";
  document.getElementById("historyList").innerHTML = "";
}

/***********************
 * RESET (Full reset)
 ***********************/
function resetAll() {
  document.getElementById("playerCount").value = "";
  document.getElementById("matchesPerPlayer").value = 1;
  document.getElementById("seedInput").value = "";
  document.getElementById("randomnessLevel").value = 30;

  document.getElementById("matchResults").innerHTML = "";
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
  document.getElementById("historyList").innerHTML = "";

  const upcomingSection = document.getElementById("upcomingSection");
  const upcomingList = document.getElementById("upcomingList");
  if (upcomingSection) upcomingSection.style.display = "none";
  if (upcomingList) upcomingList.innerHTML = "";

  const historySummary = document.getElementById("historySummary");
  if (historySummary) historySummary.innerHTML = "";

  const msg = document.getElementById("scheduleSaveMsg");
  if (msg) msg.textContent = "";

  const playDate = document.getElementById("playDate");
  if (playDate) playDate.value = "";

  groupKey = "";
  groupDisplayName = "";
  currentTournamentId = null;

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
 * INITIAL LOAD
 ***********************/
window.addEventListener("load", () => {
  const saved = localStorage.getItem("badmintonDarkMode");
  if (saved === "1") document.body.classList.add("dark");
  setGroupCodeUI({ showBox: false, codeText: "", enableGenerate: true });
  showStep(1);
});
