/***********************
 * GLOBAL STATE
 ***********************/
let players = [];
let teamA = [];
let teamB = [];
let scheduledMatches = []; // ✅ store matches so "Let's Play" can use them

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

  document.getElementById("generateBtn").style.display = "inline-block";
}

/***********************
 * STEP 2: COLLECT PLAYERS
 ***********************/
function generateMatches() {
  players = [];
  teamA = [];
  teamB = [];
  scheduledMatches = [];

  const count = Number(document.getElementById("playerCount").value);

  for (let i = 0; i < count; i++) {
    const name = document.getElementById(`name${i}`).value.trim();
    const hand = document.getElementById(`hand${i}`).value;

    if (!name) {
      alert(`Please enter a name for Player ${i + 1}`);
      return;
    }

    players.push({ name, hand });
  }

  showTeamAssignment();
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
  document.getElementById("teamAssignmentSection").style.display = "block";
}

/***********************
 * STEP 4: VALIDATE TEAMS & SCHEDULE
 ***********************/
function generateMatchesFromTeams() {
  teamA = [];
  teamB = [];
  scheduledMatches = [];

  const matchesPerPlayer = Number(document.getElementById("matchesPerPlayer").value);
  if (!matchesPerPlayer || matchesPerPlayer < 1) {
    setMessage("Please enter a valid matches per player value.");
    return;
  }

  for (let i = 0; i < players.length; i++) {
    const selected = document.querySelector(`input[name="team${i}"]:checked`);
    if (!selected) {
      setMessage("Please assign every player to a team.");
      return;
    }
    if (selected.value === "A") teamA.push(players[i]);
    else teamB.push(players[i]);
  }

  if (teamA.length < 2 || teamB.length < 2) {
    setMessage("Each team must have at least 2 players for doubles.");
    return;
  }

  const totalPlayers = teamA.length + teamB.length;
  const totalMatchesNeeded = Math.ceil((totalPlayers * matchesPerPlayer) / 4);

  setMessage(
    `Teams confirmed ✔️ Team A: ${teamA.length} players, Team B: ${teamB.length} players.
Matches per player: ${matchesPerPlayer}. Total matches scheduled: ${totalMatchesNeeded}`
  );

  scheduleMatchesSmart(totalMatchesNeeded, matchesPerPlayer);

  // Hide play section until "Let's Play" clicked
  document.getElementById("playSection").style.display = "none";
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

  document.getElementById("matchSection").style.display = "block";
  renderStatsFromSchedule(targetMatchesPerPlayer);
}

/***********************
 * STATS FROM CURRENT SCHEDULE
 ***********************/
function renderStatsFromSchedule(targetMatchesPerPlayer) {
  const playedCount = {};
  [...teamA, ...teamB].forEach(p => (playedCount[p.name] = 0));

  scheduledMatches.forEach(m => {
    m.teamA.forEach(n => (playedCount[n] = (playedCount[n] || 0) + 1));
    m.teamB.forEach(n => (playedCount[n] = (playedCount[n] || 0) + 1));
  });

  const statsDiv = document.getElementById("playerStats");
  statsDiv.innerHTML = "";

  const allPlayers = [...teamA, ...teamB].map(p => p.name).sort();

  allPlayers.forEach(name => {
    const played = playedCount[name] || 0;
    statsDiv.innerHTML += `
      <div>
        <strong>${name}</strong> — Matches Played: ${played} / Target: ${targetMatchesPerPlayer}
      </div>
    `;
  });

  document.getElementById("statsSection").style.display = "block";
}

/***********************
 * LET'S PLAY UI + SAVE RESULTS
 ***********************/
function letsPlay() {

  alert("Let's Play clicked!");

  if (!scheduledMatches || scheduledMatches.length === 0) {
    alert("Please generate matches first.");
    return;
  }

  const grid = document.getElementById("playMatchesGrid");
  grid.innerHTML = "";

  scheduledMatches.forEach(match => {
    grid.innerHTML += `
      <div class="play-card" id="playCard${match.matchNo}">
        <div><strong>Match ${match.matchNo}</strong></div>

        <div id="teamABox${match.matchNo}">
          Team A: <span>${match.teamA[0]} + ${match.teamA[1]}</span>
        </div>

        <div class="play-row">
          <label>Score A:</label>
          <input class="score-input" type="number" id="scoreA${match.matchNo}" min="0">
        </div>

        <div id="teamBBox${match.matchNo}">
          Team B: <span>${match.teamB[0]} + ${match.teamB[1]}</span>
        </div>

        <div class="play-row">
          <label>Score B:</label>
          <input class="score-input" type="number" id="scoreB${match.matchNo}" min="0">
        </div>

        <div class="play-row">
          <button onclick="saveMatchResult(${match.matchNo})">Save</button>
          <span id="saveMsg${match.matchNo}"></span>
        </div>
      </div>
    `;
  });

  document.getElementById("playSection").style.display = "block";
}

function saveMatchResult(matchNo) {
  const scoreA = Number(document.getElementById(`scoreA${matchNo}`).value);
  const scoreB = Number(document.getElementById(`scoreB${matchNo}`).value);

  if (Number.isNaN(scoreA) || Number.isNaN(scoreB)) {
    alert("Please enter both scores.");
    return;
  }

  if (scoreA === scoreB) {
    alert("Draw is not allowed. Please enter a winning score.");
    return;
  }

  const match = scheduledMatches.find(m => m.matchNo === matchNo);
  if (!match) return;

  const winner = scoreA > scoreB ? "A" : "B";

  // Bold winning team
  const teamABox = document.getElementById(`teamABox${matchNo}`);
  const teamBBox = document.getElementById(`teamBBox${matchNo}`);

  teamABox.classList.remove("winner");
  teamBBox.classList.remove("winner");

  if (winner === "A") teamABox.classList.add("winner");
  else teamBBox.classList.add("winner");

  // Save result to LocalStorage
  const groupName = (document.getElementById("clubName").value || "").trim() || "Unknown Group";

  const resultObj = {
    groupName,
    matchNo,
    teamA: match.teamA,
    teamB: match.teamB,
    scoreA,
    scoreB,
    winnerTeam: winner,
    savedAt: new Date().toISOString()
  };

  storeMatchResult(resultObj);

  document.getElementById(`saveMsg${matchNo}`).textContent = "✅ Saved";
}

function storeMatchResult(resultObj) {
  const key = "badmintonMatchResults";
  const existing = JSON.parse(localStorage.getItem(key) || "[]");
  existing.push(resultObj);
  localStorage.setItem(key, JSON.stringify(existing));
}

/***********************
 * HELPER: MESSAGE DISPLAY
 ***********************/
function setMessage(text) {
  document.getElementById("teamAssignmentMessage").textContent = text;
}
