/***********************
 * GLOBAL STATE
 ***********************/
let players = [];
let teamA = [];
let teamB = [];

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

  // Total match slots required: totalPlayers * matchesPerPlayer
  // Each match uses 4 players total.
  const totalMatchesNeeded = Math.ceil((totalPlayers * matchesPerPlayer) / 4);

  setMessage(
    `Teams confirmed ✔️ Team A: ${teamA.length} players, Team B: ${teamB.length} players.
Matches per player: ${matchesPerPlayer}. Total matches scheduled: ${totalMatchesNeeded}`
  );

  scheduleMatchesSmart(totalMatchesNeeded, matchesPerPlayer);
}

/***********************
 * SMART MATCH SCHEDULING
 * - Balance playtime
 * - Reduce repeated pairs (best effort)
 * - Track stats live
 ***********************/
function scheduleMatchesSmart(matchCount, targetMatchesPerPlayer) {
  const resultsDiv = document.getElementById("matchResults");
  resultsDiv.innerHTML = "";

  // Init play count maps
  const playedCount = {};
  [...teamA, ...teamB].forEach(p => {
    playedCount[p.name] = 0;
  });

  // Track pair repeats inside each team
  // key format: "A|B" sorted
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

  // Choose 2 players from a team with least matches played,
  // and minimize pair repeats as tie-breaker
  function chooseTwo(team, pairMap) {
    // Sort players by least matches played
    const sorted = [...team].sort((p1, p2) => playedCount[p1.name] - playedCount[p2.name]);

    // Try first few combinations from least-played list
    // This keeps it simple & fast.
    let bestPair = null;
    let bestScore = Infinity;

    const limit = Math.min(sorted.length, 6); // only check a small top set

    for (let i = 0; i < limit; i++) {
      for (let j = i + 1; j < limit; j++) {
        const p1 = sorted[i];
        const p2 = sorted[j];

        // score = total matches played + repeat penalty
        const repeat = getPairCount(pairMap, p1.name, p2.name);
        const score =
          playedCount[p1.name] +
          playedCount[p2.name] +
          repeat * 5; // repeat penalty weight

        if (score < bestScore) {
          bestScore = score;
          bestPair = [p1, p2];
        }
      }
    }

    // Fallback (should not happen)
    if (!bestPair) {
      bestPair = [sorted[0], sorted[1]];
    }

    return bestPair;
  }

  const scheduledMatches = [];

  for (let m = 1; m <= matchCount; m++) {
    const [a1, a2] = chooseTwo(teamA, pairCountA);
    const [b1, b2] = chooseTwo(teamB, pairCountB);

    // Update counts
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

  // Render player stats
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
