/***********************
 * WIZARD STATE
 ***********************/
let currentStep = 1;
let addPlayerMode = false;

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

/***********************
 * STORAGE KEYS
 ***********************/
const GROUPS_KEY = "badmintonGroups"; // group profile + tournaments
const TEMP_RESULTS_KEY = "badmintonMatchResults"; // per-match saves for current/any group

/***********************
 * GLOBAL STATE (Current tournament)
 ***********************/
let groupKey = ""; // normalized group key (lowercase)
let groupDisplayName = ""; // original display input
let groupPlayers = []; // master list for group [{id,name,hand}...]

let manageMode = false;

// Availability & team assignment for TODAY (tournament)
let availableTodayMap = {}; // {playerId: true/false}
let teamMap = {}; // {playerId: "A" | "B"}

// Scheduled matches for tournament
let scheduledMatches = []; // [{matchNo, teamA:[name,name], teamB:[name,name]}]

/***********************
 * UTILITIES
 ***********************/
function normalizeGroupName(name) {
  return (name || "").trim().toLowerCase();
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

  // Load group if exists
  const groups = getGroupsStore();
  const existingGroup = groups[groupKey];

  if (existingGroup) {
    // Existing group: use stored players
    groupPlayers = existingGroup.players || [];
    if (groupPlayers.length < 4) {
      alert("This group has less than 4 players. Please add more players.");
    }
  } else {
    // New group: create players from fixed rows count (playerCount)
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

    // Create group in storage now (empty names will be filled in Step 2)
    groups[groupKey] = {
      groupKey,
      groupName: groupDisplayName,
      players: groupPlayers,
      tournaments: []
    };
    setGroupsStore(groups);
  }

  // Default: everyone available today ✅
  availableTodayMap = {};
  teamMap = {};
  groupPlayers.forEach(p => {
    availableTodayMap[p.id] = true;
    teamMap[p.id] = ""; // not assigned yet
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

  // Keep groupPlayers synced
  groupPlayers = storedPlayers;

  groupPlayers.forEach((p, idx) => {
    const nameLocked = isExistingGroup && p.name && !manageMode; // lock existing player display
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

function escapeHtml(text) {
  return (text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toggleManagePlayers() {
  if (addPlayerMode) return; // ✅ block manage while adding

  manageMode = !manageMode;
  const btn = document.getElementById("managePlayersBtn");
  btn.textContent = manageMode ? "Done" : "🛠️ Manage Players";
  renderPlayersPanel();
}

/***********************
 * Add new player row (group profile)
 ***********************/
function addNewPlayerRow() {
  const groups = getGroupsStore();
  const group = groups[groupKey];

  if (!group) {
    alert("Group not found. Please go back and enter group name again.");
    return;
  }

  const newPlayer = {
    id: uid(),
    name: "",
    hand: "Right"
  };

  group.players.push(newPlayer);
  groups[groupKey] = group;
  setGroupsStore(groups);

  // Update local state
  groupPlayers = group.players;

  // Default: available today checked
  availableTodayMap[newPlayer.id] = true;
  teamMap[newPlayer.id] = "";

  renderPlayersPanel();
  renderTeamAssignmentPanel();
}

/***********************
 * Save edits to a player (Policy A)
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

  // Check duplicates within group (case-insensitive)
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

  // Sync local
  groupPlayers = group.players;

  renderPlayersPanel();
  updateManageButtonState();
  renderTeamAssignmentPanel();
}

function startAddPlayer() {
  addPlayerMode = true;

  // Show add player panel
  const panel = document.getElementById("addPlayerPanel");
  if (panel) panel.style.display = "block";

  // Clear inputs
  const n = document.getElementById("newPlayerName");
  const h = document.getElementById("newPlayerHand");
  if (n) n.value = "";
  if (h) h.value = "Right";

  // Disable Manage button while adding
  const manageBtn = document.getElementById("managePlayersBtn");
  if (manageBtn) manageBtn.disabled = true;

  // Disable Add button while adding (avoid duplicates)
  const addBtn = document.getElementById("addPlayerBtn");
  if (addBtn) addBtn.disabled = true;

  // Turn off manage mode if it was on
  manageMode = false;
  const btn = document.getElementById("managePlayersBtn");
  if (btn) btn.textContent = "🛠️ Manage Players";

  renderPlayersPanel();
  updateManageButtonState();
}

function cancelAddPlayer() {
  addPlayerMode = false;

  // Hide add player panel
  const panel = document.getElementById("addPlayerPanel");
  if (panel) panel.style.display = "none";

  // Enable buttons back
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

  // Duplicate check within group
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

  const newPlayer = {
    id: uid(),
    name,
    hand
  };

  group.players.push(newPlayer);
  groups[groupKey] = group;
  setGroupsStore(groups);

  // Sync local state
  groupPlayers = group.players;
  availableTodayMap[newPlayer.id] = true; // default checked
  teamMap[newPlayer.id] = "";

  // Exit add player mode
  cancelAddPlayer();

  // Refresh UI panels
  renderPlayersPanel();
  updateManageButtonState();
  renderTeamAssignmentPanel();
}

function updateManageButtonState() {
  const manageBtn = document.getElementById("managePlayersBtn");
  if (!manageBtn) return;

  // Disable when adding player
  if (addPlayerMode) {
    manageBtn.disabled = true;
    return;
  }

  // Disable manage if any player is unnamed (new group setup unfinished)
  const hasUnnamed = groupPlayers.some(p => !p.name);
  manageBtn.disabled = hasUnnamed;
}


/***********************
 * Delete player (Policy A)
 ***********************/
function deletePlayer(playerId) {
  const p = groupPlayers.find(x => x.id === playerId);
  if (!p) return;

  const confirmDel = confirm(
    `Delete "${p.name}" from group profile?\nThis will NOT change past history.`
  );
  if (!confirmDel) return;

  const groups = getGroupsStore();
  const group = groups[groupKey];
  if (!group) return;

  group.players = group.players.filter(x => x.id !== playerId);
  groups[groupKey] = group;
  setGroupsStore(groups);

  // Sync local
  groupPlayers = group.players;

  delete availableTodayMap[playerId];
  delete teamMap[playerId];

  renderPlayersPanel();
  renderTeamAssignmentPanel();
}

/***********************
 * STEP 2 UI: Team Assignment Panel (Right)
 * Only AVAILABLE players shown
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

  // If making unavailable, clear team selection
  if (!isAvailable) {
    teamMap[playerId] = "";
  }

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
 * STEP 2 -> STEP 3 (Generate schedule)
 ***********************/
function goNextFromPlayersTeams() {
  document.getElementById("teamAssignmentMessage").textContent = "";

  // Validate player names for new players
  // Ensure all players (especially new) have names
  for (const p of groupPlayers) {
    const nameEl = document.getElementById(`pname_${p.id}`);
    const handEl = document.getElementById(`phand_${p.id}`);

    // If input exists, take latest typed values
    if (nameEl && handEl) {
      p.name = (nameEl.value || "").trim();
      p.hand = handEl.value;
    }

    // If player exists but is unnamed, force name
    if (!p.name) {
      alert("Please enter names for all players in the group list.");
      return;
    }
  }

  // Save updated players to group profile
  const groups = getGroupsStore();
  const group = groups[groupKey];
  if (!group) {
    alert("Group not found. Please go back to Setup.");
    return;
  }

  // Check duplicates in group
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

  // Validate available today
  const availablePlayers = groupPlayers.filter(p => availableTodayMap[p.id]);

  if (availablePlayers.length < 4) {
    alert("At least 4 available players are required for doubles.");
    return;
  }

  // Validate team assignment for available players
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

  showStep(3);
}

/***********************
 * STEP 3: schedule + regenerate
 ***********************/
function scheduleMatchesSmart(teamAPlayers, teamBPlayers, matchCount) {
  const resultsDiv = document.getElementById("matchResults");
  resultsDiv.innerHTML = "";

  const rng = getRng();
  const randomnessLevel = getRandomnessLevel();

  const teamAShuffled = [...teamAPlayers];
  const teamBShuffled = [...teamBPlayers];

  if (randomnessLevel > 0) {
    const shuffleTimes = 1 + Math.floor((randomnessLevel / 100) * 2);
    for (let i = 0; i < shuffleTimes; i++) {
      shuffleArray(teamAShuffled, rng);
      shuffleArray(teamBShuffled, rng);
    }
  }

  const playedCount = {};
  [...teamAShuffled, ...teamBShuffled].forEach(p => (playedCount[p.name] = 0));

  const pairCountA = {};
  const pairCountB = {};

  function pairKey(n1, n2) {
    return [n1, n2].sort().join("|");
  }
  function getPairCount(map, n1, n2) {
    return map[pairKey(n1, n2)] || 0;
  }
  function incPairCount(map, n1, n2) {
    const k = pairKey(n1, n2);
    map[k] = (map[k] || 0) + 1;
  }

  function chooseTwo(team, pairMap) {
    const pool = [...team];
    if (randomnessLevel > 0) shuffleArray(pool, rng);

    pool.sort((p1, p2) => playedCount[p1.name] - playedCount[p2.name]);

    let bestPair = null;
    let bestScore = Infinity;

    const limit = Math.min(pool.length, 2 + Math.floor((randomnessLevel / 100) * 6));
    const repeatPenalty = 2 + Math.floor(((100 - randomnessLevel) / 100) * 6);

    for (let i = 0; i < limit; i++) {
      for (let j = i + 1; j < limit; j++) {
        const p1 = pool[i];
        const p2 = pool[j];
        const repeat = getPairCount(pairMap, p1.name, p2.name);

        const score =
          playedCount[p1.name] + playedCount[p2.name] + repeat * repeatPenalty;

        const jitter = (randomnessLevel / 100) * rng() * 0.5;
        const finalScore = score + jitter;

        if (finalScore < bestScore) {
          bestScore = finalScore;
          bestPair = [p1, p2];
        }
      }
    }

    if (!bestPair) bestPair = [pool[0], pool[1]];
    return bestPair;
  }

  scheduledMatches = [];

  for (let m = 1; m <= matchCount; m++) {
    const [a1, a2] = chooseTwo(teamAShuffled, pairCountA);
    const [b1, b2] = chooseTwo(teamBShuffled, pairCountB);

    playedCount[a1.name]++;
    playedCount[a2.name]++;
    playedCount[b1.name]++;
    playedCount[b2.name]++;

    incPairCount(pairCountA, a1.name, a2.name);
    incPairCount(pairCountB, b1.name, b2.name);

    scheduledMatches.push({
      matchNo: m,
      teamA: [a1.name, a2.name],
      teamB: [b1.name, b2.name]
    });
  }

scheduledMatches.forEach(match => {
  resultsDiv.innerHTML += `
    <div class="schedule-card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>Match ${match.matchNo}</strong>
        <span>
          <span class="badge badge-a">Team A</span>
          <span class="vs">VS</span>
          <span class="badge badge-b">Team B</span>
        </span>
      </div>

      <div style="margin-top:10px;">
        <div><span class="badge badge-a">A</span> ${escapeHtml(match.teamA[0])} + ${escapeHtml(match.teamA[1])}</div>
        <div style="margin-top:6px;"><span class="badge badge-b">B</span> ${escapeHtml(match.teamB[0])} + ${escapeHtml(match.teamB[1])}</div>
      </div>
    </div>
  `;
});

  // Clear any previous final section
  const finalSection = document.getElementById("finalSummarySection");
  if (finalSection) finalSection.style.display = "none";

  // Clear play grid (so it regenerates fresh when user goes Next)
  document.getElementById("playMatchesGrid").innerHTML = "";
}

function regenerateMatches() {
  // Build current available players + teams again from maps
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
  letsPlay();
  showStep(4);
}

/***********************
 * STEP 4: Let’s Play (score entry)
 ***********************/
function letsPlay() {
  if (!scheduledMatches || scheduledMatches.length === 0) {
    alert("No scheduled matches found.");
    return;
  }

  const grid = document.getElementById("playMatchesGrid");
  grid.innerHTML = "";

  scheduledMatches.forEach(match => {
    grid.innerHTML += `
      <div style="border:1px solid #ddd; padding:12px; border-radius:8px; margin-bottom:10px;">
        <div><strong>Match ${match.matchNo}</strong></div>

        <div style="margin-top:6px;">
          Team A: ${escapeHtml(match.teamA.join(" + "))}
        </div>

        <div style="margin-top:6px;">
          Team B: ${escapeHtml(match.teamB.join(" + "))}
        </div>

        <div style="margin-top:10px; display:flex; gap:10px; align-items:center;">
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

  // Hide final summary until concluded
  document.getElementById("finalSummarySection").style.display = "none";
}

/***********************
 * Save per-match result (temporary store)
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
    teamA: match.teamA,
    teamB: match.teamB,
    scoreA,
    scoreB,
    winnerTeam,
    savedAt: new Date().toISOString()
  };

  storeTempMatchResult(resultObj);
}

function storeTempMatchResult(resultObj) {
  const existing = JSON.parse(localStorage.getItem(TEMP_RESULTS_KEY) || "[]");

  // Replace old record for same groupKey + matchNo
  const filtered = existing.filter(
    r => !(r.groupKey === resultObj.groupKey && r.matchNo === resultObj.matchNo)
  );

  filtered.push(resultObj);
  localStorage.setItem(TEMP_RESULTS_KEY, JSON.stringify(filtered));
}

/***********************
 * Conclude Play -> Build Final Summary
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
    matchTable += `
      <tr>
        <td>${r.teamA.join(" | ")}</td>
        <td>${r.scoreA}</td>
        <td>${r.teamB.join(" | ")}</td>
        <td>${r.scoreB}</td>
      </tr>
    `;
  });

  matchTable += `</table>`;
  document.getElementById("matchSummary").innerHTML = matchTable;

  // Player of tournament (max match wins)
  const playerWinCount = {};

  groupResults.forEach(r => {
    const winners = r.winnerTeam === "A" ? r.teamA : r.teamB;
    winners.forEach(p => {
      playerWinCount[p] = (playerWinCount[p] || 0) + 1;
    });
  });

  const maxWins = Math.max(...Object.values(playerWinCount));
  const topPlayers = Object.keys(playerWinCount).filter(p => playerWinCount[p] === maxWins);

  document.getElementById("playerOfTournament").innerHTML =
    `Player of the tournament: <strong>${topPlayers.join(", ")}</strong> (${maxWins} wins)`;

  document.getElementById("finalSummarySection").style.display = "block";
}

/***********************
 * Save Results -> Save Tournament under Group + Reset today selections
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

  const availablePlayers = groupPlayers.filter(p => availableTodayMap[p.id]);
  const teamA = availablePlayers.filter(p => teamMap[p.id] === "A").map(p => p.name);
  const teamB = availablePlayers.filter(p => teamMap[p.id] === "B").map(p => p.name);

  const tournamentRecord = {
    tournamentId: Date.now(),
    savedAt: new Date().toISOString(),
    matchesPerPlayer: getMatchesPerPlayer(),
    availablePlayers: availablePlayers.map(p => p.name),
    teamA,
    teamB,
    scheduledMatches,
    matchResults: groupResults
  };

  const groups = getGroupsStore();
  const group = groups[groupKey];

  if (!group) {
    alert("Group not found. Please restart.");
    return;
  }

  group.tournaments = group.tournaments || [];
  group.tournaments.push(tournamentRecord);

  groups[groupKey] = group;
  setGroupsStore(groups);

  // Remove temp match results for this group so next tournament starts clean
  const remaining = allResults.filter(r => r.groupKey !== groupKey);
  localStorage.setItem(TEMP_RESULTS_KEY, JSON.stringify(remaining));

  alert("Results saved ✅ Starting a new tournament for this group.");

  // Reset today selections (Option 1)
  resetAll();
}

/***********************
 * Fetch / Reset Group History (Step 1)
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

    // Keep new group setup visible
    document.getElementById("newGroupSetup").style.display = "block";
    return;
  }

  document.getElementById("historyMessage").textContent =
    `Found ${(groups[key].tournaments || []).length} saved tournament(s).`;

  // Existing group -> hide new group count field
  document.getElementById("newGroupSetup").style.display = "none";

  showGroupHistory(key);
  // Default view = Tournament Stats
  showTournamentStats();

}

function showGroupHistory(key) {
  const groups = getGroupsStore();
  const tournaments = (groups[key].tournaments || []).slice().reverse();

  const historyList = document.getElementById("historyList");
  historyList.innerHTML = "";

  if (tournaments.length === 0) {
    historyList.innerHTML = "<p>No tournament history found.</p>";
    document.getElementById("historySection").style.display = "block";
    return;
  }

  let tableHtml = `
    <table border="1" cellpadding="6">
      <tr>
        <th>Date</th>
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
        <td>${new Date(t.savedAt).toLocaleString()}</td>
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

  // ✅ Dedicated summary area (prevents stacking)
  tableHtml += `
    <div id="historySummary" style="margin-top:15px;"></div>
  `;

  historyList.innerHTML = tableHtml;
  document.getElementById("historySection").style.display = "block";
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

  // Render stats for current fetched group
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
  const tournaments = group.tournaments || [];

  if (players.length === 0) {
    container.innerHTML = "<p>No players found in this group.</p>";
    return;
  }

  if (tournaments.length === 0) {
    container.innerHTML = "<p>No completed tournaments found for this group.</p>";
    return;
  }

  // Stats map by player name (Policy A: use player names as stored in group profile)
  const stats = {};
  players.forEach(p => {
    stats[p.name] = {
      name: p.name,
      played: 0,
      won: 0
    };
  });

  // Count from completed tournaments only
  tournaments.forEach(t => {
    const matchResults = t.matchResults || [];
    matchResults.forEach(m => {
      // Team A players
      (m.teamA || []).forEach(playerName => {
        if (stats[playerName]) stats[playerName].played++;
      });

      // Team B players
      (m.teamB || []).forEach(playerName => {
        if (stats[playerName]) stats[playerName].played++;
      });

      // Winners
      const winners = m.winnerTeam === "A" ? (m.teamA || []) : (m.teamB || []);
      winners.forEach(playerName => {
        if (stats[playerName]) stats[playerName].won++;
      });
    });
  });

  // Build table
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
        <td>${r.name}</td>
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

  // ✅ Count wins by team
  let teamAWins = 0;
  let teamBWins = 0;

  results.forEach(r => {
    if (r.winnerTeam === "A") teamAWins++;
    else if (r.winnerTeam === "B") teamBWins++;
  });

  let tournamentWinner = "Draw";
  if (teamAWins > teamBWins) tournamentWinner = "Team A";
  else if (teamBWins > teamAWins) tournamentWinner = "Team B";

  // ✅ Player of tournament
  const playerWinCount = {};
  results.forEach(r => {
    const winners = r.winnerTeam === "A" ? r.teamA : r.teamB;
    winners.forEach(p => {
      playerWinCount[p] = (playerWinCount[p] || 0) + 1;
    });
  });

  const maxWins = Math.max(...Object.values(playerWinCount));
  const topPlayers = Object.keys(playerWinCount).filter(p => playerWinCount[p] === maxWins);

  // ✅ Match table
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
    matchTable += `
      <tr>
        <td>${r.teamA.join(" | ")}</td>
        <td>${r.scoreA}</td>
        <td>${r.teamB.join(" | ")}</td>
        <td>${r.scoreB}</td>
      </tr>
    `;
  });

  matchTable += `</table>`;

  // ✅ Render into dedicated summary section (NO stacking)
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

  // ✅ scroll to summary smoothly
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

  // Clear tournaments
  groups[key].tournaments = [];
  setGroupsStore(groups);

  // Clear temp results for this group as well
  const allResults = JSON.parse(localStorage.getItem(TEMP_RESULTS_KEY) || "[]");
  const remaining = allResults.filter(r => r.groupKey !== key);
  localStorage.setItem(TEMP_RESULTS_KEY, JSON.stringify(remaining));

  document.getElementById("historyMessage").textContent = "History cleared ✅";
  document.getElementById("historySection").style.display = "none";
  document.getElementById("historyList").innerHTML = "";
}

/***********************
 * RESET (Full reset to Step 1)
 ***********************/
function resetAll() {
  // UI inputs
  document.getElementById("playerCount").value = "";
  document.getElementById("matchesPerPlayer").value = 1;
  document.getElementById("seedInput").value = "";
  document.getElementById("randomnessLevel").value = 30;

  document.getElementById("matchResults").innerHTML = "";
  document.getElementById("playMatchesGrid").innerHTML = "";

  document.getElementById("teamAssignmentMessage").textContent = "";

  // Hide final summary
  document.getElementById("finalSummarySection").style.display = "none";

  // Reset state (Option 1: new tournament fresh)
  manageMode = false;
  availableTodayMap = {};
  teamMap = {};
  scheduledMatches = [];

  // Keep group name in input for convenience OR clear it?
  // We'll clear it to match "landing page appear" request.
  document.getElementById("clubName").value = "";

  // History area cleared
  document.getElementById("historyMessage").textContent = "";
  document.getElementById("historySection").style.display = "none";
  document.getElementById("historyList").innerHTML = "";

  // Show new group setup by default
  document.getElementById("newGroupSetup").style.display = "block";

  showStep(1);
}

function toggleDarkMode() {
  document.body.classList.toggle("dark");
  // Save preference
  const isDark = document.body.classList.contains("dark");
  localStorage.setItem("badmintonDarkMode", isDark ? "1" : "0");
}

/***********************
 * INITIAL LOAD
 ***********************/
window.addEventListener("load", () => {
  const saved = localStorage.getItem("badmintonDarkMode");
  if (saved === "1") document.body.classList.add("dark");
  showStep(1);
});
