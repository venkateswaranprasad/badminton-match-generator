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

function computePlayerStatsFromResults() {
  const stats = {};

  const results = JSON.parse(localStorage.getItem(TEMP_RESULTS_KEY) || "[]")
    .filter(r => r.groupKey === groupKey);

  results.forEach(r => {
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


/***********************
 * WIZARD STATE
 ***********************/
let currentStep = 1;
let addPlayerMode = false;
let currentTournamentId = null;

/***********************
 * STORAGE KEYS (local cache)
 ***********************/
const GROUPS_KEY = "badmintonGroups";
const TEMP_RESULTS_KEY = "badmintonMatchResults";

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

  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`step${i}`);
    if (el) el.style.display = i === stepNo ? "block" : "none";
  }

  const stepText = document.getElementById("currentStepText");
  if (stepText) stepText.textContent = stepNo;

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

async function fetchTournamentFromCloud(groupCode, tournamentId) {
  requireFirebaseReady();
  const { doc, getDoc } = window.fs;

  const ref = doc(
    window.firebaseDb,
    "groups",
    groupCode,
    "tournaments",
    String(tournamentId)
  );

  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
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

async function showUpcomingTournamentsFromCloud() {
  if (!groupCodeActive) return;

  const section = document.getElementById("upcomingSection");
  const listEl = document.getElementById("upcomingList");

  listEl.innerHTML = "";
  section.style.display = "block";

  try {
    const tournaments = await fetchTournamentsFromCloud(groupCodeActive);

    if (!tournaments.length) {
      listEl.innerHTML = "<p>No tournaments found.</p>";
      return;
    }

    tournaments
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .forEach(t => {
        const status = t.status || "SCHEDULED";
        const playDate = t.playDate || "(no date)";

        const canResume =
          status === "SCHEDULED" || status === "IN_PROGRESS";

        listEl.innerHTML += `
          <div class="schedule-card">
            <strong>${playDate}</strong>
            <div>Status: <b>${status}</b></div>

            ${
              canResume
                ? `<button onclick="startPlayFromSavedTournament(
                      '${groupCodeActive}',
                      ${t.tournamentId}
                   )">▶ Resume Play</button>`
                : `<span style="opacity:0.6;">Completed</span>`
            }
          </div>
        `;
      });
  } catch (err) {
    console.error(err);
    listEl.innerHTML = "<p>Error loading tournaments.</p>";
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
    groupDisplayName = cloudGroup.groupName || "(Unnamed Group)";
    groupKey = normalizeGroupName(groupDisplayName);
    groupPlayers = cloudGroup.players || [];

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
    panel.innerHTML += `
      <div style="padding:6px 0; border-bottom:1px solid #eee;">
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

  scheduledMatches.forEach(match => {
    const a1 = getPlayerNameById(match.teamAIds[0], match.teamASnapshot?.[0]);
    const a2 = getPlayerNameById(match.teamAIds[1], match.teamASnapshot?.[1]);
    const b1 = getPlayerNameById(match.teamBIds[0], match.teamBSnapshot?.[0]);
    const b2 = getPlayerNameById(match.teamBIds[1], match.teamBSnapshot?.[1]);

    resultsDiv.innerHTML += `
      <div class="schedule-card">
        <strong>Match ${match.matchNo}</strong>
        <div><span class="badge badge-a">A</span> ${escapeHtml(a1)} + ${escapeHtml(a2)}</div>
        <div><span class="badge badge-b">B</span> ${escapeHtml(b1)} + ${escapeHtml(b2)}</div>
      </div>
    `;
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
function saveSchedule() {
  const msgEl = document.getElementById("scheduleSaveMsg");
  if (msgEl) msgEl.textContent = "";

  if (!groupCodeActive) {
  alert("Group Code not set. Please Fetch or Generate a Group Code first.");
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
  groups[groupKey] = groups[groupKey] || { groupKey, groupName: groupDisplayName, tournaments: [], players: groupPlayers };
  groups[groupKey].players = groupPlayers;
  groups[groupKey].tournaments = groups[groupKey].tournaments || [];
  groups[groupKey].tournaments.push(tournamentRecord);

  setGroupsStore(groups);

  currentTournamentId = tournamentRecord.tournamentId;

  if (msgEl) {
    msgEl.textContent = `✅ Schedule saved for ${playDate}`;
    msgEl.style.color = "green";
  }

  alert("Schedule saved ✅");

  const homeBtn = document.getElementById("homeBtnStep3");
  if (homeBtn) homeBtn.disabled = false;

  saveScheduleToCloud(tournamentRecord);
}

async function saveScheduleToCloud(tournament) {
  try {
    
    requireFirebaseReady();
    if (!groupCodeActive) {
      console.error("❌ groupCodeActive missing. Cloud save aborted.");
      return;
    }
    
    const db = window.firebaseDb;
    const { doc, setDoc, serverTimestamp } = window.fs;

    const ref = doc(
      db,
      "groups",
      groupCodeActive,
      "tournaments",
      String(tournament.tournamentId)
    );

    await setDoc(ref, {
      ...tournament,
      groupCode: groupCodeActive,
      cloudSavedAt: serverTimestamp()
    });

    // ✅ ALSO attach tournament reference to group document
    const groupRef = doc(db, "groups", groupCodeActive);

    await setDoc(
      groupRef,
      {
        tournaments: [
          {
            tournamentId: String(tournament.tournamentId),
            playDate: tournament.playDate,
            status: tournament.status,
            createdAt: tournament.createdAt
          }
        ]
      },
      { merge: true }
    );

    console.log("☁️ Schedule saved to cloud at:", ref.path);
    alert("☁️ Tournament saved to Cloud successfully!");

  } catch (err) {
    console.error("❌ Cloud save failed (schedule)", err);
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
}

function storeTempMatchResult(resultObj) {
  const existing = JSON.parse(localStorage.getItem(TEMP_RESULTS_KEY) || "[]");

  const filtered = existing.filter(
    r => !(r.groupKey === resultObj.groupKey && r.matchNo === resultObj.matchNo)
  );

  filtered.push(resultObj);
  localStorage.setItem(TEMP_RESULTS_KEY, JSON.stringify(filtered));
}

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
  saveMatchResultToCloud(resultObj);

}

async function saveMatchResultToCloud(result) {
  try {
    const { updateDoc, arrayUnion } = window.fs;
    const ref = getTournamentRef(groupCodeActive, currentTournamentId);

    await updateDoc(ref, {
      matchResults: arrayUnion(result)
    });

    console.log("☁️ Match result saved");
  } catch (err) {
    console.error("❌ Failed to save match result", err);
  }
}

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

  const playerWinCount = {};
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

function saveResults() {
  alert("✅ For now results are saved in local storage only. Cloud saving is next step.");
  concludeTournamentInCloud();
  resetAll();
}

async function concludeTournamentInCloud() {
  try {
    const ref = getTournamentRef(groupCodeActive, currentTournamentId);
    const { updateDoc, serverTimestamp } = window.fs;

    const playerStats = computePlayerStatsFromResults();

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

async function startPlayFromSavedTournament(groupCode, tournamentId) {
  try {
    const ref = getTournamentRef(groupCodeActive, currentTournamentId);
    const { getDoc } = window.fs;

    const snap = await getDoc(ref);
    if (!snap.exists()) {
      alert("Tournament not found.");
      return;
    }

    const t = snap.data();

    // restore state
    currentTournamentId = t.tournamentId;
    scheduledMatches = t.scheduledMatches || [];
    groupKey = normalizeGroupName(groupDisplayName);

    // restore teams & availability
    availableTodayMap = {};
    teamMap = {};

    (t.availablePlayerIds || []).forEach(pid => {
      availableTodayMap[pid] = true;
    });

    (t.teamAIds || []).forEach(pid => (teamMap[pid] = "A"));
    (t.teamBIds || []).forEach(pid => (teamMap[pid] = "B"));

    renderScheduleCardsFromIds();
    letsPlay();

    showStep(4);
  } catch (err) {
    console.error(err);
    alert("Failed to resume tournament.");
  }
}


/***********************
 * RESET
 ***********************/
function resetGroupHistory() {
  alert("Reset Group History: this feature is still local-only in this version.");
}

function resetAll() {
  document.getElementById("playerCount").value = "";
  document.getElementById("matchesPerPlayer").value = 1;
  document.getElementById("seedInput").value = "";
  document.getElementById("randomnessLevel").value = 30;

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

window.startAddPlayer = startAddPlayer;
window.cancelAddPlayer = cancelAddPlayer;
window.saveNewPlayer = saveNewPlayer;

window.toggleManagePlayers = toggleManagePlayers;
window.saveEditedPlayer = saveEditedPlayer;
window.deletePlayer = deletePlayer;

window.toggleAvailability = toggleAvailability;
window.setTeam = setTeam;

window.goNextFromPlayersTeams = goNextFromPlayersTeams;
window.startPlayFromSavedTournament = startPlayFromSavedTournament;

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
