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
