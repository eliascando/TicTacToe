const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const WINNING_COMBINATIONS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

/**
 * In-memory store of active rooms.
 * rooms[code] = {
 *   players: [{ id, name, symbol }],
 *   board: Array(9),
 *   turn: 'X' | 'O',
 *   status: 'waiting' | 'playing' | 'over',
 *   winner: 'X' | 'O' | 'draw' | null,
 *   winningLine: number[] | null,
 *   starter: 'X' | 'O',
 *   scores: { X, O, draws },
 *   rematchVotes: Set<socketId>,
 * }
 */
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function createEmptyBoard() {
  return Array(9).fill(null);
}

function evaluateBoard(board) {
  for (const line of WINNING_COMBINATIONS) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], winningLine: line };
    }
  }
  if (board.every((cell) => cell !== null)) {
    return { winner: 'draw', winningLine: null };
  }
  return { winner: null, winningLine: null };
}

function publicState(room) {
  return {
    players: room.players.map((p) => ({ name: p.name, symbol: p.symbol })),
    board: room.board,
    turn: room.turn,
    status: room.status,
    winner: room.winner,
    winningLine: room.winningLine,
    scores: room.scores,
  };
}

function broadcastState(code) {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit('stateUpdate', publicState(room));
}

io.on('connection', (socket) => {
  socket.data.roomCode = null;

  socket.on('createRoom', (payload, callback) => {
    const name = (payload && payload.name ? String(payload.name) : '').trim().slice(0, 20) || 'Jugador 1';
    const code = generateRoomCode();
    const room = {
      players: [{ id: socket.id, name, symbol: 'X' }],
      board: createEmptyBoard(),
      turn: 'X',
      status: 'waiting',
      winner: null,
      winningLine: null,
      starter: 'X',
      scores: { X: 0, O: 0, draws: 0 },
      rematchVotes: new Set(),
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    if (typeof callback === 'function') {
      callback({ ok: true, code, symbol: 'X', state: publicState(room) });
    }
  });

  socket.on('joinRoom', (payload, callback) => {
    const code = (payload && payload.code ? String(payload.code) : '').trim().toUpperCase();
    const name = (payload && payload.name ? String(payload.name) : '').trim().slice(0, 20) || 'Jugador 2';
    const room = rooms.get(code);
    if (!room) {
      if (typeof callback === 'function') callback({ ok: false, error: 'La sala no existe.' });
      return;
    }
    if (room.players.length >= 2) {
      if (typeof callback === 'function') callback({ ok: false, error: 'La sala está llena.' });
      return;
    }
    room.players.push({ id: socket.id, name, symbol: 'O' });
    room.status = 'playing';
    socket.join(code);
    socket.data.roomCode = code;
    if (typeof callback === 'function') {
      callback({ ok: true, code, symbol: 'O', state: publicState(room) });
    }
    broadcastState(code);
  });

  socket.on('makeMove', (payload) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.status !== 'playing') return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    const index = payload && Number.isInteger(payload.index) ? payload.index : -1;
    if (index < 0 || index > 8) return;
    if (player.symbol !== room.turn) return; // not your turn
    if (room.board[index] !== null) return; // cell taken

    room.board[index] = player.symbol;
    const { winner, winningLine } = evaluateBoard(room.board);
    if (winner) {
      room.status = 'over';
      room.winner = winner;
      room.winningLine = winningLine;
      if (winner === 'draw') {
        room.scores.draws += 1;
      } else {
        room.scores[winner] += 1;
      }
    } else {
      room.turn = room.turn === 'X' ? 'O' : 'X';
    }
    broadcastState(code);
  });

  socket.on('rematch', () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.status !== 'over' || room.players.length < 2) return;

    room.rematchVotes.add(socket.id);
    if (room.rematchVotes.size >= 2) {
      room.board = createEmptyBoard();
      room.starter = room.starter === 'X' ? 'O' : 'X';
      room.turn = room.starter;
      room.status = 'playing';
      room.winner = null;
      room.winningLine = null;
      room.rematchVotes.clear();
      broadcastState(code);
    } else {
      io.to(code).emit('rematchRequested', { by: socket.id });
    }
  });

  function leaveCurrentRoom() {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    socket.leave(code);
    socket.data.roomCode = null;
    if (!room) return;

    room.players = room.players.filter((p) => p.id !== socket.id);
    room.rematchVotes.delete(socket.id);
    if (room.players.length === 0) {
      rooms.delete(code);
      return;
    }
    room.status = 'waiting';
    room.board = createEmptyBoard();
    room.winner = null;
    room.winningLine = null;
    room.rematchVotes.clear();
    io.to(code).emit('opponentLeft');
    broadcastState(code);
  }

  socket.on('leaveRoom', leaveCurrentRoom);
  socket.on('disconnect', leaveCurrentRoom);
});

server.listen(PORT, () => {
  console.log(`Tres en Raya online escuchando en http://localhost:${PORT}`);
});
