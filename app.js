/***********************
 * GLOBAL STATE
 ***********************/
let players = [];
let teamA = [];
let teamB = [];

/***********************
 * SEED + RANDOM HELPERS
 ***********************/
function hashSeedToInt(seedStr) {
  // Simple deterministic string hash to 32-bit integer
  let h = 2166136261; // FNV-like basis
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  // Deterministic PRNG generator
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getRng() {
  const seedInputEl = document.getElementById("seedInput");
  const seedStr = seedInputEl ? seedInputEl.value.trim() : "";

  if (!seedStr) {
    // No seed => truly random each time
    return Math.random;
  }

  const seedInt = hashSeedToInt(seedStr);
  return mulberry32(seedInt);
}

function getRandomnessLevel() {
  const el = document.getElementById("randomnessLevel");
  if (!el) return 30;

  let val = Number(el.value);
  if (Number.isNaN(val)) val = 30;
  if (val < 0) val = 0;
  if (val > 100) val = 100;
  return val;
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

    if (selected.value === "A") {
      teamA.push(players[i]);
    } else {
      teamB.push(players[i]);
    }
  }

  if (teamA.length < 2 || teamB.length < 2) {
    setMessage("Each team must have at least 2 players for doubles.");
    return;
  }

  const totalPlayers = teamA.length + teamB.length;
  const totalMatchesNeeded = Math.ceil((totalPlayers * matchesPerPlayer) / 4);

  const seedStr = (document.getElementById("seedInput")?.value || "").trim();
  const randomnessLevel = getRandomnessLevel();

  setMessage(
    `Teams confirmed ✔️ Team A: ${teamA.length} players, Team B: ${teamB.length} players.
Matches per player: ${matchesPerPlayer}. Total matches scheduled: ${totalMatchesNeeded}.
Seed: ${seedStr ? seedStr : "None"} | Randomness: ${randomnessLevel}`
  );

  scheduleMatchesSmart(totalMatchesNeeded, matchesPerPlayer);
}

/***********************
 * RE-GENERATE (keeps teams)
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

  const seedStr = (document.getElementById("seedInput")?.value || "").trim();
  const randomnessLevel = getRandomnessLevel();

  setMessage(
    `Matches re-generated ✔️
Seed: ${seedStr ? seedStr : "None"} | Randomness: ${randomnessLevel}`
  );
}

/***********************
 * RESET EVERYTHING
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
  document.getElementById("generateBtn").style.display = "none";

  document.getElementById("teamAssignmentContainer").innerHTML = "";
  document.getElementById("teamAssignmentMessage").textContent = "";
  document.getElementById("teamAssignmentSection").style.display = "none";

  document.getElementById("matchResults").innerHTML = "";
  document.getElementById("matchSection").style.display = "none";

  document.getElementById("playerStats").innerHTML = "";
  document.getElementById("statsSection").style.display = "none";

  players = [];
  teamA = [];
  teamB = [];
}

/***********************
 * SMART MATCH SCHEDULING
 * - Balance playtime
 * - Reduce repeated pairs (best effort)
 * - Randomness + seed support
 ***********************/
function scheduleMatchesSmart(matchCount, targetMatchesPerPlayer) {
  const resultsDiv = document.getElementById("matchResults");
  resultsDiv.innerHTML = "";

  const rng = getRng();
  const randomnessLevel = getRandomnessLevel(); // 0..100

  // ✅ Shuffle team order slightly (more shuffle at higher randomness)
  // If randomnessLevel is 0, keep teams in order as much as possible.
  const teamAShuffled = [...teamA];
  const teamBShuffled = [...teamB];

  if (randomnessLevel > 0) {
    // Shuffle intensity based on randomness
    // We'll do 1 to 3 shuffles depending on level
    const shuffleTimes = 1 + Math.floor((randomnessLevel / 100) * 2);
    for (let i = 0; i < shuffleTimes; i++) {
      shuffleArray(teamAShuffled, rng);
      shuffleArray(teamBShuffled, rng);
    }
  }

  // Init play count maps
  const playedCount = {};
  [...teamAShuffled, ...teamBShuffled].forEach(p => {
    playedCount[p.name] = 0;
  });

  // Track pair repeats inside each team
  const pairCountA = {};
  const pairCountB = {};

  function pairKey(n1, n2) {
    return [n1, n2].sort().join("|");
  }

  function getPairCount(pairMap, n1, n2) {
    const key = pairKey(n1, n2);
    return pairMap[key] || 0;
  }

  function incPairCount(pairMap, n1, n2) {
    const key = pairKey(n1, n2);
    pairMap[key] = (pairMap[key] || 0) + 1;
  }

  // Choose 2 players from a team:
  // - mostly choose least played (balance)
  // - with randomness, allow more variety using shuffle/tie breaks
  function chooseTwo(team, pairMap) {
    const pool = [...team];

    // Add randomness: shuffle pool before sorting
    // Higher randomness => more shuffle impact
    if (randomnessLevel > 0) {
      shuffleArray(pool, rng);
    }

    // Sort by least matches played (always)
    pool.sort((p1, p2) => playedCount[p1.name] - playedCount[p2.name]);

    let bestPair = null;
    let bestScore = Infinity;

    // How many top candidates to check:
    // randomness 0 => small tight subset
    // randomness 100 => larger subset, more variety
    const limit = Math.min(pool.length, 2 + Math.floor((randomnessLevel / 100) * 6));
    const repeatPenalty = 2 + Math.floor(((100 - randomnessLevel) / 100) * 6);
    // When randomness is low, repeat penalty is higher (avoid repeats strongly)
    // When randomness is high, repeat penalty is lower (allow more randomness)

    for (let i = 0; i < limit; i++) {
      for (let j = i + 1; j < limit; j++) {
        const p1 = pool[i];
        const p2 = pool[j];

        const repeat = getPairCount(pairMap, p1.name, p2.name);

        // Score: prioritize fairness (played count)
        // Repeat penalty changes with randomness
        const score =
          playedCount[p1.name] +
          playedCount[p2.name] +
          repeat * repeatPenalty;

        // Tiny randomness tie-break so it doesn't always pick the same score
        const jitter = (randomnessLevel / 100) * rng() * 0.5;
        const finalScore = score + jitter;

        if (finalScore < bestScore) {
          bestScore = finalScore;
          bestPair = [p1, p2];
        }
      }
    }

    if (!bestPair) {
      bestPair = [pool[0], pool[1]];
    }

    return bestPair;
  }

  const scheduledMatches = [];

  for (let m = 1; m <= matchCount; m++) {
    const [a1, a2] = chooseTwo(teamAShuffled, pairCountA);
    const [b1, b2] = chooseTwo(teamBShuffled, pairCountB);

    // Update match play counts
    playedCount[a1.name]++;
    playedCount[a2.name]++;
    playedCount[b1.name]++;
    playedCount[b2.name]++;

    // Update pair counts
    incPairCount(pairCountA, a1.name, a2.name);
    incPairCount(pairCountB, b1.name, b2.name);

    scheduledMatches.push({
      matchNo: m,
      teamA: [a1.name, a2.name],
      teamB: [b1.name, b2.name]
    });
  }

  // Render matches
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
  renderStats(playedCount, targetMatchesPerPlayer);
}

/***********************
 * PLAYER STATS DISPLAY
 ***********************/
function renderStats(playedCount, targetMatchesPerPlayer) {
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
 * HELPER: MESSAGE DISPLAY
 ***********************/
function setMessage(text) {
  document.getElementById("teamAssignmentMessage").textContent = text;
}
