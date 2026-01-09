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

  if (!count || count < 1) {
    alert("Please enter a valid number of players.");
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
 * SHOW TEAM ASSIGNMENT
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
 * STEP 4: VALIDATE TEAMS
 * CALCULATE + SCHEDULE MATCHES
 ***********************/
function generateMatchesFromTeams() {
  teamA = [];
  teamB = [];

  for (let i = 0; i < players.length; i++) {
    const selected = document.querySelector(
      `input[name="team${i}"]:checked`
    );

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

  const minMatches = Math.max(
    Math.ceil(teamA.length / 2),
    Math.ceil(teamB.length / 2)
  );

  setMessage(
    `Teams confirmed ✔️ Team A: ${teamA.length} players, 
     Team B: ${teamB.length} players. 
     Minimum matches possible: ${minMatches}`
  );

  scheduleMatches(minMatches);
}

/***********************
 * STEP 5: SIMPLE MATCH SCHEDULING
 ***********************/
function scheduleMatches(matchCount) {
  const resultsDiv = document.getElementById("matchResults");
  resultsDiv.innerHTML = "";

  let aIndex = 0;
  let bIndex = 0;

  for (let i = 0; i < matchCount; i++) {
    const a1 = teamA[aIndex % teamA.length];
    const a2 = teamA[(aIndex + 1) % teamA.length];

    const b1 = teamB[bIndex % teamB.length];
    const b2 = teamB[(bIndex + 1) % teamB.length];

    resultsDiv.innerHTML += `
      <div>
        <strong>Match ${i + 1}</strong><br>
        Team A: ${a1.name} + ${a2.name}<br>
        Team B: ${b1.name} + ${b2.name}
      </div>
      <hr>
    `;

    aIndex += 2;
    bIndex += 2;
  }

  document.getElementById("matchSection").style.display = "block";
}

/***********************
 * HELPER: MESSAGE DISPLAY
 ***********************/
function setMessage(text) {
  document.getElementById("teamAssignmentMessage").textContent = text;
}
