let players = [];

function createPlayerInputs() {
  const count = document.getElementById("playerCount").value;
  const section = document.getElementById("playersSection");
  section.innerHTML = "";
  players = [];

  for (let i = 0; i < count; i++) {
    section.innerHTML += `
      <div class="player-row">
        Player ${i + 1}:
        <input type="text" placeholder="Name" id="name${i}">
        <select id="hand${i}">
          <option value="Right">Right</option>
          <option value="Left">Left</option>
        </select>
      </div>
    `;
  }

  document.getElementById("generateBtn").style.display = "block";
}

function generateMatches() {
  players = [];
  const count = document.getElementById("playerCount").value;

  for (let i = 0; i < count; i++) {
    players.push({
      name: document.getElementById(`name${i}`).value,
      hand: document.getElementById(`hand${i}`).value
    });
  }

  alert("Players saved! Next step: Team selection (Phase 2)");
}

function generateMatches() {
  players = [];
  const count = document.getElementById("playerCount").value;

  for (let i = 0; i < count; i++) {
    players.push({
      name: document.getElementById(`name${i}`).value,
      hand: document.getElementById(`hand${i}`).value
    });
  }

  setupTeamSelection();
}

function setupTeamSelection() {
  const selects = ["teamA1", "teamA2", "teamB1", "teamB2"];

  selects.forEach(id => {
    const select = document.getElementById(id);
    select.innerHTML = "<option value=''>-- Select Player --</option>";

    players.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
  });

  document.getElementById("teamSection").style.display = "block";
}

function validateTeams() {
  const selected = [
    teamA1.value, teamA2.value,
    teamB1.value, teamB2.value
  ];

  if (selected.includes("")) {
    teamMessage.textContent = "Please select all 4 players.";
    return;
  }

  const uniquePlayers = new Set(selected);
  if (uniquePlayers.size !== 4) {
    teamMessage.textContent = "A player cannot be selected more than once.";
    return;
  }

  teamMessage.textContent = "Teams are valid! Ready to calculate matches.";
}

