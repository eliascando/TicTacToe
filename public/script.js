const socket = io();

// ---- DOM references ----
const lobby = document.getElementById('lobby');
const game = document.getElementById('game');
const playerNameInput = document.getElementById('playerName');
const createBtn = document.getElementById('createBtn');
const joinCodeInput = document.getElementById('joinCode');
const joinBtn = document.getElementById('joinBtn');
const lobbyError = document.getElementById('lobbyError');

const roomCodeEl = document.getElementById('roomCode');
const copyCodeBtn = document.getElementById('copyCode');
const leaveBtn = document.getElementById('leaveBtn');
const statusEl = document.getElementById('status');
const boardEl = document.getElementById('board');
const cells = Array.from(document.querySelectorAll('.cell'));
const rematchBtn = document.getElementById('rematchBtn');
const connStatus = document.getElementById('connStatus');

const playerXEl = document.getElementById('playerX');
const playerOEl = document.getElementById('playerO');

// ---- Client state ----
let mySymbol = null;
let currentCode = null;
let latestState = null;

// ---- Helpers ----
function showView(view) {
  lobby.classList.toggle('hidden', view !== 'lobby');
  game.classList.toggle('hidden', view !== 'game');
}

function setError(msg) {
  lobbyError.textContent = msg || '';
}

function enterRoom(code, symbol, state) {
  currentCode = code;
  mySymbol = symbol;
  roomCodeEl.textContent = code;
  showView('game');
  render(state);
}

function render(state) {
  latestState = state;
  const { board, turn, status, winner, winningLine, players, scores } = state;

  // Board cells
  cells.forEach((cell, i) => {
    const value = board[i];
    cell.textContent = value || '';
    cell.classList.toggle('x', value === 'X');
    cell.classList.toggle('o', value === 'O');
    cell.classList.remove('win');
    const myTurn = status === 'playing' && turn === mySymbol;
    cell.disabled = !myTurn || value !== null;
  });

  if (winningLine) {
    winningLine.forEach((i) => cells[i].classList.add('win'));
  }

  // Players / scores
  const px = players.find((p) => p.symbol === 'X');
  const po = players.find((p) => p.symbol === 'O');
  playerXEl.querySelector('.player__name').textContent = px ? px.name : 'Esperando…';
  playerOEl.querySelector('.player__name').textContent = po ? po.name : 'Esperando…';
  playerXEl.querySelector('.player__score').textContent = scores.X;
  playerOEl.querySelector('.player__score').textContent = scores.O;

  playerXEl.classList.toggle('player--active', status === 'playing' && turn === 'X');
  playerOEl.classList.toggle('player--active', status === 'playing' && turn === 'O');

  // Status text + rematch button
  rematchBtn.classList.add('hidden');
  if (status === 'waiting') {
    statusEl.textContent = 'Esperando al oponente… Comparte el código de sala.';
  } else if (status === 'playing') {
    statusEl.textContent = turn === mySymbol ? 'Es tu turno' : 'Turno del oponente…';
  } else if (status === 'over') {
    if (winner === 'draw') {
      statusEl.textContent = '¡Empate!';
    } else {
      const winnerPlayer = players.find((p) => p.symbol === winner);
      const name = winnerPlayer ? winnerPlayer.name : winner;
      statusEl.textContent = winner === mySymbol ? `¡Ganaste! 🎉` : `${name} ganó`;
    }
    if (players.length === 2) {
      rematchBtn.classList.remove('hidden');
      rematchBtn.textContent = 'Revancha';
      rematchBtn.disabled = false;
    }
  }
}

// ---- Lobby actions ----
createBtn.addEventListener('click', () => {
  setError('');
  createBtn.disabled = true;
  socket.emit('createRoom', { name: playerNameInput.value }, (res) => {
    createBtn.disabled = false;
    if (!res || !res.ok) {
      setError((res && res.error) || 'No se pudo crear la sala.');
      return;
    }
    enterRoom(res.code, res.symbol, res.state);
  });
});

joinBtn.addEventListener('click', () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) {
    setError('Ingresa un código de sala.');
    return;
  }
  setError('');
  joinBtn.disabled = true;
  socket.emit('joinRoom', { code, name: playerNameInput.value }, (res) => {
    joinBtn.disabled = false;
    if (!res || !res.ok) {
      setError((res && res.error) || 'No se pudo unir a la sala.');
      return;
    }
    enterRoom(res.code, res.symbol, res.state);
  });
});

joinCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});

// ---- Game actions ----
cells.forEach((cell) => {
  cell.addEventListener('click', () => {
    const index = Number(cell.dataset.index);
    if (!latestState || latestState.status !== 'playing') return;
    if (latestState.turn !== mySymbol) return;
    if (latestState.board[index] !== null) return;
    socket.emit('makeMove', { index });
  });
});

rematchBtn.addEventListener('click', () => {
  rematchBtn.disabled = true;
  rematchBtn.textContent = 'Esperando revancha…';
  socket.emit('rematch');
});

leaveBtn.addEventListener('click', () => {
  socket.emit('leaveRoom');
  currentCode = null;
  mySymbol = null;
  latestState = null;
  showView('lobby');
  setError('');
});

copyCodeBtn.addEventListener('click', async () => {
  if (!currentCode) return;
  try {
    await navigator.clipboard.writeText(currentCode);
    const original = roomCodeEl.textContent;
    roomCodeEl.textContent = '¡Copiado!';
    setTimeout(() => {
      roomCodeEl.textContent = original;
    }, 1000);
  } catch (_) {
    /* clipboard not available */
  }
});

// ---- Socket lifecycle ----
socket.on('connect', () => {
  connStatus.textContent = 'Conectado';
  connStatus.classList.remove('conn--off');
  connStatus.classList.add('conn--on');
});

socket.on('disconnect', () => {
  connStatus.textContent = 'Desconectado';
  connStatus.classList.remove('conn--on');
  connStatus.classList.add('conn--off');
});

socket.on('stateUpdate', (state) => {
  render(state);
});

socket.on('opponentLeft', () => {
  statusEl.textContent = 'El oponente salió de la sala.';
});
