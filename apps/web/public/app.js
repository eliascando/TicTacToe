'use strict';

// ---------- State ----------
let socket = null;
let currentUser = null;
let mySymbol = null;
let matchState = null;
let achievementsCatalog = [];

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const screens = {
  loading: $('loading'),
  auth: $('auth'),
  main: $('main'),
};
const views = { home: $('home'), match: $('match') };

// ---------- API ----------
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de red');
  return data;
}

// ---------- Navigation ----------
function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
}
function showView(name) {
  Object.entries(views).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
}

// ---------- Auth ----------
let authMode = 'login';
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    authMode = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    $('authSubmit').textContent = authMode === 'login' ? 'Entrar' : 'Crear cuenta';
    $('authError').textContent = '';
  });
});

$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('authError').textContent = '';
  const username = $('username').value.trim();
  const password = $('password').value;
  const submit = $('authSubmit');
  submit.disabled = true;
  try {
    const { user } = await api(`/auth/${authMode === 'login' ? 'login' : 'register'}`, {
      method: 'POST',
      body: { username, password },
    });
    await onAuthenticated(user);
  } catch (err) {
    $('authError').textContent = err.message;
  } finally {
    submit.disabled = false;
  }
});

$('logoutBtn').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  if (socket) { socket.disconnect(); socket = null; }
  currentUser = null;
  showScreen('auth');
});

// ---------- Post-auth ----------
async function onAuthenticated(user) {
  currentUser = user;
  connectSocket();
  await Promise.all([loadCatalog(), refreshProfile()]);
  showScreen('main');
  showView('home');
}

async function loadCatalog() {
  try {
    const { catalog } = await api('/achievements');
    achievementsCatalog = catalog;
  } catch { achievementsCatalog = []; }
}

async function refreshProfile() {
  const [{ user }, { leaderboard }] = await Promise.all([
    api('/me'),
    api('/leaderboard'),
  ]);
  currentUser = user;
  renderProfile(user);
  renderAchievements(user);
  renderLeaderboard(leaderboard);
  renderHistory(user);
}

// ---------- Rendering ----------
function renderProfile(u) {
  $('navUsername').textContent = u.username;
  $('navLevel').textContent = `Nv ${u.level}`;
  $('navRating').textContent = u.rating;
  $('avatar').textContent = u.username.charAt(0).toUpperCase();
  $('profileName').textContent = u.username;
  $('profileLevel').textContent = `Nivel ${u.level}`;
  $('profileXp').textContent = `${u.levelProgress.xpIntoLevel} / ${u.levelProgress.xpForNextLevel} XP`;
  $('xpFill').style.width = `${Math.round(u.levelProgress.progress * 100)}%`;
  $('statRating').textContent = u.rating;
  $('statWins').textContent = u.wins;
  $('statLosses').textContent = u.losses;
  $('statDraws').textContent = u.draws;
  $('statStreak').textContent = u.currentStreak;
}

function renderAchievements(u) {
  const earned = new Set((u.achievements || []).map((a) => a.achievement_key));
  $('achievements').innerHTML = achievementsCatalog
    .map((a) => `
      <div class="ach ${earned.has(a.key) ? '' : 'ach--locked'}" title="${a.description}">
        <span class="ach__icon">${a.icon}</span>
        <span class="ach__name">${a.name}</span>
      </div>`)
    .join('');
}

function renderLeaderboard(list) {
  $('leaderboard').innerHTML = list
    .map((p, i) => `
      <li>
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-name ${p.username.toLowerCase() === currentUser.username.toLowerCase() ? 'me' : ''}">${escapeHtml(p.username)}</span>
        <span class="lb-rating">${p.rating}</span>
      </li>`)
    .join('') || '<li class="muted">Sin jugadores todavía</li>';
}

function renderHistory(u) {
  const me = u.username.toLowerCase();
  const items = (u.recentMatches || []).map((m) => {
    const iAmX = m.xName.toLowerCase() === me;
    const oppName = iAmX ? m.oName : m.xName;
    const delta = iAmX ? m.xRatingChange : m.oRatingChange;
    let outcome = 'draw';
    if (m.winner !== 'draw') outcome = (m.winner === 'X') === iAmX ? 'win' : 'loss';
    const label = outcome === 'win' ? 'Victoria' : outcome === 'loss' ? 'Derrota' : 'Empate';
    const sign = delta > 0 ? `+${delta}` : `${delta}`;
    return `<li>
      <span>vs <strong>${escapeHtml(oppName)}</strong></span>
      <span><span class="pill pill--${outcome}">${label}</span> <span class="muted">${sign}</span></span>
    </li>`;
  });
  $('history').innerHTML = items.join('') || '<li class="muted">Aún no jugaste partidas</li>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Matchmaking ----------
$('playBtn').addEventListener('click', () => {
  if (!socket) return;
  socket.emit('queue:join');
  $('playBtn').classList.add('hidden');
  $('searching').classList.remove('hidden');
});
$('cancelSearch').addEventListener('click', () => {
  if (socket) socket.emit('queue:leave');
  $('searching').classList.add('hidden');
  $('playBtn').classList.remove('hidden');
});

// ---------- Match view ----------
const cells = Array.from(document.querySelectorAll('.cell'));
cells.forEach((cell) => {
  cell.addEventListener('click', () => {
    const index = Number(cell.dataset.index);
    if (!matchState || matchState.status !== 'playing') return;
    if (matchState.turn !== mySymbol) return;
    if (matchState.board[index] !== null) return;
    socket.emit('match:move', { index });
  });
});

$('leaveMatch').addEventListener('click', () => {
  if (socket) socket.emit('match:leave');
});

function enterMatch(payload) {
  mySymbol = payload.you.symbol;
  $('youSymbol').textContent = payload.you.symbol;
  $('youName').textContent = payload.you.name;
  $('youRating').textContent = payload.you.rating;
  $('oppSymbol').textContent = payload.opponent.symbol;
  $('oppName').textContent = payload.opponent.name;
  $('oppRating').textContent = payload.opponent.rating;
  $('searching').classList.add('hidden');
  $('playBtn').classList.remove('hidden');
  hideOverlay();
  showView('match');
  renderBoard(payload.state, null);
}

function renderBoard(state, line) {
  matchState = state;
  const { board, turn, status } = state;
  cells.forEach((cell, i) => {
    const v = board[i];
    cell.textContent = v || '';
    cell.classList.toggle('x', v === 'X');
    cell.classList.toggle('o', v === 'O');
    cell.classList.toggle('win', Array.isArray(line) && line.includes(i));
    const myTurn = status === 'playing' && turn === mySymbol;
    cell.disabled = !myTurn || v !== null;
  });

  const youIsX = mySymbol === 'X';
  document.querySelector('.vs-player--you').classList.toggle('active', status === 'playing' && ((turn === 'X') === youIsX));
  document.querySelector('.vs-player--opp').classList.toggle('active', status === 'playing' && ((turn === 'X') !== youIsX));

  if (status === 'playing') {
    $('matchStatus').textContent = turn === mySymbol ? 'Es tu turno' : 'Turno del rival…';
  }
}

// ---------- Overlay ----------
function showResult(data) {
  const r = data.result;
  const outcome = r ? r.outcome : (data.winner === 'draw' ? 'draw' : (data.winner === mySymbol ? 'win' : 'loss'));
  let title = 'Empate';
  if (outcome === 'win') title = data.forfeit ? '¡Ganaste! (rival abandonó)' : '¡Victoria! 🎉';
  else if (outcome === 'loss') title = 'Derrota';
  $('overlayTitle').textContent = title;

  if (r) {
    const sign = r.ratingChange > 0 ? `+${r.ratingChange}` : `${r.ratingChange}`;
    const cls = r.ratingChange > 0 ? 'up' : r.ratingChange < 0 ? 'down' : '';
    $('overlayRating').innerHTML = `Ranking: <span class="${cls}">${sign}</span> → ${r.profile.rating} · Nivel ${r.profile.level}`;
    currentUser = r.profile;
  } else {
    $('overlayRating').textContent = '';
  }

  const newAch = (r && r.newAchievements) || [];
  $('overlayAchievements').innerHTML = newAch
    .map((a) => `<div class="ach-toast"><span class="big">${a.icon}</span><div><strong>¡Logro desbloqueado!</strong><small>${a.name} — ${a.description}</small></div></div>`)
    .join('');

  $('overlay').classList.remove('hidden');
}
function hideOverlay() { $('overlay').classList.add('hidden'); }

$('againBtn').addEventListener('click', async () => {
  hideOverlay();
  showView('home');
  await refreshProfile();
  socket.emit('queue:join');
  $('playBtn').classList.add('hidden');
  $('searching').classList.remove('hidden');
});
$('homeBtn').addEventListener('click', async () => {
  hideOverlay();
  showView('home');
  await refreshProfile();
});

// ---------- Socket ----------
function connectSocket() {
  if (socket) return;
  socket = io({ withCredentials: true });

  socket.on('connect_error', (err) => {
    console.warn('socket error:', err.message);
  });
  socket.on('queue:waiting', () => {
    $('matchStatus').textContent = '';
  });
  socket.on('match:found', (payload) => enterMatch(payload));
  socket.on('match:update', (state) => renderBoard(state, null));
  socket.on('match:over', (data) => {
    renderBoard({ board: data.board, turn: null, status: 'over' }, data.line);
    setTimeout(() => showResult(data), 700);
  });
}

// ---------- Boot ----------
(async function boot() {
  try {
    const { user } = await api('/me');
    await onAuthenticated(user);
  } catch {
    showScreen('auth');
  }
})();
