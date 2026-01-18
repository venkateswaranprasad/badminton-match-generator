/***********************
 * WIZARD STATE
 ***********************/
let currentStep = 1;

function showStep(stepNo) {
  currentStep = stepNo;

  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`step${i}`);
    if (el) el.style.display = i === stepNo ? "block" : "none";
  }

  const stepText = document.getElementById("currentStepText");
  if (stepText) stepText.textContent = stepNo;
}

function goBack() {
  if (currentStep > 1) showStep(currentStep - 1);
}

/***********************
 * GLOBAL STATE
 ***********************/
let players = [];
let teamA = [];
let teamB = [];
let scheduledMatches = []; // Used by Step 4 & Step 5

/***********************
 * SEED + RANDOM HELPERS
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
 * STEP 1 -> STEP 2
 * Setup "Next"
 ***********************/
function goNextFromSetup() {
  // This will validate and build the player rows
  createPlayerInputs();

  // If rows were created, move to Step 2
  const playerCount = Number(document.getElementById("playerCount").value);
  if (playerCount && playerCount > 0) {
    showStep(2);
  }
}

/***********************
 * STEP 1: CREATE PLAYER INPUTS
 ***********************/
function createPlayerInputs() {
  const count = Number(document.getElementById("playerCount").value);
  const section = document.getElementById("playersSection");

  const matchesPerPlayer = Number(document.getElementById("matchesPerPlayer").value);

  if (!count || count < 1) {
    alert("Please enter a valid number of players.");
    return;
  }

  if (!matchesPerPlayer || matchesPerPlayer < 1) {
    alert("Please enter a valid matches per player value.");
    return;
  }

  section.innerHTML = "";
  players = [];

  for (let i = 0; i < count; i++) {
    section.innerHTML += `
      <div class="player-row">
        Player ${i + 1}:
        <input type="text" id="name${i}" placeholder="Name">
        <select id="hand${i}">
          <option value="Right">Right</option>
          <option value="Left">Left</option>
        </select>
      </div>
    `;
  }
}

/***********************
 * STEP 2 -> STEP 3
 * Players "Next"
 ***********************/
function goNextFromPlayers() {
  // Collect players and build Team assignment UI
  if (!generateMatches()) return;
  showStep(3);
}

/***********************
 * STEP 2: COLLECT PLAYERS
 * Returns true/false for wizard flow
 ***********************/
function generateMatches() {
  players = [];
  teamA = [];
  teamB = [];
  scheduledMatches = [];

  const count = Number(document.getElementById("playerCount").value);

  const seenNames = new Set();

  for (let i = 0; i < count; i++) {
    const name = document.getElementById(`name${i}`).value.trim();
    const hand = document.getElementById(`hand${i}`).value;

    if (!name) {
      alert(`Please enter a name for Player ${i + 1}`);
      return false;
    }

    const lower = name.toLowerCase();
    if (seenNames.has(lower)) {
      alert(`Duplicate player name found: "${name}". Please use unique names.`);
      return false;
    }
    seenNames.add(lower);

    players.push({ name, hand });
  }

  showTeamAssignment();
  return true;
}

/***********************
 * STEP 3: TEAM ASSIGNMENT UI
 ***********************/
function showTeamAssignment() {
  const container = document.getElementById("teamAssignmentContainer");
  container.innerHTML = "";

  players.forEach((player, index) => {
    container.innerHTML += `
      <div>
        <strong>${player.name}</strong> (${player.hand})
        <label>
          <input type="radio" name="team${index}" value="A"> Team A
        </label>
        <label>
          <input type="radio" name="team${index}" value="B"> Team B
        </label>
      </div>
    `;
  });

  document.getElementById("teamAssignmentMessage").textContent = "";
}

/***********************
 * STEP 3 -> STEP 4
 * Teams "Generate Schedule"
 ***********************/
function goNextFromTeams() {
  if (!generateMatchesFromTeams()) return;
  showStep(4);
}

/***********************
 * STEP 4: VALIDATE TEAMS & SCHEDULE
 * Return true/false for wizard flow
 ***********************/
function generateMatchesFromTeams() {
  teamA = [];
  teamB = [];
  scheduledMatches = [];

  const matchesPerPlayer = Number(document.getElementById("matchesPerPlayer").value);
  if (!matchesPerPlayer || matchesPerPlayer < 1) {
    setMessage("Please enter a valid matches per player value.");
    return false;
  }

  for (let i = 0; i < players.length; i++) {
    const selected = document.querySelector(`input[name="team${i}"]:checked`);
    if (!selected) {
      setMessage("Please assign every player to a team.");
      return false;
    }
    if (selected.value === "A") teamA.push(players[i]);
    else teamB.push(players[i]);
  }

  if (teamA.length < 2 || teamB.length < 2) {
    setMessage("Each team must have at least 2 players for doubles.");
    return false;
  }

  const totalPlayers = teamA.length + teamB.length;
  const totalMatchesNeeded = Math.ceil((totalPlayers * matchesPerPlayer) / 4);

  setMessage(
    `Teams confirmed ✔️ Team A: ${teamA.length} players, Team B: ${teamB.length} players.
Matches per player: ${matchesPerPlayer}. Total matches scheduled: ${totalMatchesNeeded}`
  );

  scheduleMatchesSmart(totalMatchesNeeded, matchesPerPlayer);
  return true;
}

/***********************
 * RE-GENERATE (Step 4)
 ***********************/
function regenerateMatches() {
  const matchesPerPlayer = Number(document.getElementById("matchesPerPlayer").value);

  if (!matchesPerPlayer || matchesPerPlayer < 1) {
    setMessage("Please enter a valid matches per player value.");
    return;
  }

  if (teamA.length < 2 || teamB.length < 2) {
    setMessage("Please ensure both Team A and Team B have at least 2 players.");
    return;
  }

  const totalPlayers = teamA.length + teamB.length;
  const totalMatchesNeeded = Math.ceil((totalPlayers * matchesPerPlayer) / 4);

  scheduleMatchesSmart(totalMatchesNeeded, matchesPerPlayer);
  setMessage("Schedule re-generated ✔️");
}

/***********************
 * STEP 4 -> STEP 5
 * Schedule "Let's Play"
 ***********************/
function goNextFromSchedule() {
  letsPlay();
  showStep(5);
}

/***********************
 * SMART MATCH SCHEDULING
 ***********************/
function scheduleMatchesSmart(matchCount, targetMatchesPerPlayer) {
  const resultsDiv = document.getElementById("matchResults");
  resultsDiv.innerHTML = "";

  const rng = getRng();
  const randomnessLevel = getRandomnessLevel();

  const teamAShuffled = [...teamA];
  const teamBShuffled = [...teamB];

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

  // Render schedule on Step 4
  scheduledMatches.forEach(match => {
    resultsDiv.innerHTML += `
      <div>
        <strong>Match ${match.matchNo}</strong><br>
        Team A: ${match.teamA[0]} + ${match.teamA[1]}<br>
        Team B: ${match.teamB[0]} + ${match.teamB[1]}
      </div>
      <hr>
    `;
  });
}

/***********************
 * STEP 5: LET'S PLAY UI
 ***********************/
function letsPlay() {
  if (!scheduledMatches || scheduledMatches.length === 0) {
    alert("Please generate matches first.");
    return;
  }

  // Hide final summary until concluded
  const finalSection = document.getElementById("finalSummarySection");
  if (finalSection) finalSection.style.display = "none";

  const grid = document.getElementById("playMatchesGrid");
  grid.innerHTML = "";

  scheduledMatches.forEach(match => {
    grid.innerHTML += `
      <div class="play-card" id="playCard${match.matchNo}">
        <div><strong>Match ${match.matchNo}</strong></div>

        <div>
          Team A: <span>${match.teamA[0]} + ${match.teamA[1]}</span>
        </div>

        <div class="play-row">
          <label>Score A:</label>
          <input class="score-input" type="number" id="scoreA${match.matchNo}" min="0">
        </div>

        <div>
          Team B: <span>${match.teamB[0]} + ${match.teamB[1]}</span>
        </div>

        <div class="play-row">
          <label>Score B:</label>
          <input class="score-input" type="number" id="scoreB${match.matchNo}" min="0">
        </div>

        <div class="play-row">
          <button onclick="saveMatchResult(${match.matchNo})">Save</button>
          <span id="saveMsg${match.matchNo}" style="margin-left:10px;"></span>
        </div>
      </div>
    `;
  });
}

/***********************
 * SAVE MATCH RESULT
 ***********************/
function saveMatchResult(matchNo) {
  const scoreAEl = document.getElementById(`scoreA${matchNo}`);
  const scoreBEl = document.getElementById(`scoreB${matchNo}`);

  const scoreA = Number(scoreAEl.value);
  const scoreB = Number(scoreBEl.value);

  if (scoreAEl.value === "" || scoreBEl.value === "") {
    alert("Please enter both scores.");
    return;
  }

  if (Number.isNaN(scoreA) || Number.isNaN(scoreB)) {
    alert("Please enter valid numeric scores.");
    return;
  }

  if (scoreA === scoreB) {
    alert("Draw is not allowed. Please enter a winning score.");
    return;
  }

  const match = scheduledMatches.find(m => m.matchNo === matchNo);
  if (!match) {
    alert("Match not found.");
    return;
  }

  const winnerTeam = scoreA > scoreB ? "A" : "B";

  const msgEl = document.getElementById(`saveMsg${matchNo}`);
  msgEl.textContent = `Saved ✅ Team ${winnerTeam} won`;
  msgEl.style.fontWeight = "bold";

  const groupName =
    (document.getElementById("clubName").value || "").trim() || "Unknown Group";

  const resultObj = {
    groupName,
    matchNo,
    teamA: match.teamA,
    teamB: match.teamB,
    scoreA,
    scoreB,
    winnerTeam,
    savedAt: new Date().toISOString()
  };

  storeMatchResult(resultObj);
}

function storeMatchResult(resultObj) {
  const key = "badmintonMatchResults";
  const existing = JSON.parse(localStorage.getItem(key) || "[]");

  // Replace old record for same group + matchNo if exists
  const filtered = existing.filter(
    r => !(r.groupName === resultObj.groupName && r.matchNo === resultObj.matchNo)
  );

  filtered.push(resultObj);
  localStorage.setItem(key, JSON.stringify(filtered));
}

/***********************
 * CONCLUDE PLAY
 ***********************/
function concludePlay() {
  const groupName =
    (document.getElementById("clubName").value || "").trim() || "Unknown Group";

  const allResults = JSON.parse(localStorage.getItem("badmintonMatchResults") || "[]");
  const groupResults = allResults
    .filter(r => r.groupName === groupName)
    .sort((a, b) => a.matchNo - b.matchNo);

  if (groupResults.length === 0) {
    alert("No match results found to conclude. Please save scores first.");
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

  const playerWinCount = {};
  groupResults.forEach(r => {
    const winningPlayers = r.winnerTeam === "A" ? r.teamA : r.teamB;
    winningPlayers.forEach(p => {
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
 * SAVE RESULTS BY GROUP
 ***********************/
function saveResults() {
  const groupName = (document.getElementById("clubName").value || "").trim();
  if (!groupName) {
    alert("Please enter a Group Name.");
    return;
  }

  const matchesPerPlayer = Number(document.getElementById("matchesPerPlayer").value);

  const allResults = JSON.parse(localStorage.getItem("badmintonMatchResults") || "[]");
  const groupResults = allResults
    .filter(r => r.groupName === groupName)
    .sort((a, b) => a.matchNo - b.matchNo);

  if (groupResults.length === 0) {
    alert("No saved match results found. Please save scores first.");
    return;
  }

  const tournamentRecord = {
    tournamentId: Date.now(),
    savedAt: new Date().toISOString(),
    matchesPerPlayer,
    teamA: teamA.map(p => p.name),
    teamB: teamB.map(p => p.name),
    scheduledMatches,
    matchResults: groupResults
  };

  const key = "badmintonGroups";
  const groups = JSON.parse(localStorage.getItem(key) || "{}");

  if (!groups[groupName]) {
    groups[groupName] = {
      groupName,
      tournaments: []
    };
  }

  groups[groupName].tournaments.push(tournamentRecord);
  localStorage.setItem(key, JSON.stringify(groups));

disableAllButtons();

setTimeout(() => {
  alert("Results saved ✅ Starting a new tournament.");
  resetAll();
  enableAllButtons();
}, 300);

}

/***********************
 * FETCH GROUP HISTORY (Step 1)
 ***********************/
function checkGroupHistory() {
  const groupName = (document.getElementById("clubName").value || "").trim();

  if (!groupName) {
    document.getElementById("historyMessage").textContent =
      "Please enter a group name to fetch history.";
    return;
  }

  const groups = JSON.parse(localStorage.getItem("badmintonGroups") || "{}");

  if (!groups[groupName] || groups[groupName].tournaments.length === 0) {
    document.getElementById("historyMessage").textContent =
      "No history found for this group.";
    document.getElementById("historySection").style.display = "none";
    return;
  }

  document.getElementById("historyMessage").textContent =
    `Found ${groups[groupName].tournaments.length} saved tournament(s).`;

  showGroupHistory(groupName);
}

function showGroupHistory(groupName) {
  const groups = JSON.parse(localStorage.getItem("badmintonGroups") || "{}");
  const tournaments = groups[groupName].tournaments || [];

  const historyList = document.getElementById("historyList");
  historyList.innerHTML = "";

  tournaments.slice().reverse().forEach(t => {
    historyList.innerHTML += `
      <div style="border:1px solid #ddd; padding:10px; margin:10px 0;">
        <strong>Date:</strong> ${new Date(t.savedAt).toLocaleString()}<br>
        <strong>Matches per player:</strong> ${t.matchesPerPlayer}<br>
        <strong>Team A:</strong> ${t.teamA.join(", ")}<br>
        <strong>Team B:</strong> ${t.teamB.join(", ")}<br>
      </div>
    `;
  });

  document.getElementById("historySection").style.display = "block";
}

/***********************
 * RESET
 ***********************/
function resetAll() {
  document.getElementById("clubName").value = "";
  document.getElementById("playerCount").value = "";
  document.getElementById("matchesPerPlayer").value = 1;

  const seedInputEl = document.getElementById("seedInput");
  if (seedInputEl) seedInputEl.value = "";

  const randomEl = document.getElementById("randomnessLevel");
  if (randomEl) randomEl.value = 30;

  document.getElementById("playersSection").innerHTML = "";
  document.getElementById("teamAssignmentContainer").innerHTML = "";
  document.getElementById("teamAssignmentMessage").textContent = "";

  document.getElementById("matchResults").innerHTML = "";
  document.getElementById("playMatchesGrid").innerHTML = "";

  document.getElementById("historyMessage").textContent = "";
  document.getElementById("historySection").style.display = "none";
  document.getElementById("historyList").innerHTML = "";

  const finalSection = document.getElementById("finalSummarySection");
  if (finalSection) finalSection.style.display = "none";

  players = [];
  teamA = [];
  teamB = [];
  scheduledMatches = [];

  showStep(1);
}

function disableAllButtons() {
  document.querySelectorAll("button").forEach(btn => {
    btn.disabled = true;
  });
}

function enableAllButtons() {
  document.querySelectorAll("button").forEach(btn => {
    btn.disabled = false;
  });
}


/***********************
 * HELPER: MESSAGE DISPLAY
 ***********************/
function setMessage(text) {
  document.getElementById("teamAssignmentMessage").textContent = text;
}

/***********************
 * INITIAL LOAD
 ***********************/
window.addEventListener("load", () => {
  showStep(1);
});
