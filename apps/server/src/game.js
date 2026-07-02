'use strict';

const cookie = require('cookie');
const crypto = require('crypto');
const config = require('./config');
const auth = require('./auth');
const repo = require('./repository');
const { finalizeMatch } = require('./matchService');
const { createEmptyBoard, evaluateBoard, isValidMove } = require('@ttt/shared');

// userId -> { socket, userId, name, rating, joinedAt }
const queue = new Map();
// roomId -> room
const rooms = new Map();

function acceptableDelta(waitMs) {
  return 100 + Math.floor(waitMs / 1000) * 100;
}

function publicMatchState(room) {
  return {
    board: room.board,
    turn: room.turn,
    status: room.status,
  };
}

function opponentInfo(room, symbol) {
  const other = symbol === 'X' ? 'O' : 'X';
  const p = room.players[other];
  return { name: p.name, rating: p.rating, symbol: other };
}

function startMatch(a, b) {
  const roomId = crypto.randomUUID();
  const [xEntry, oEntry] = Math.random() < 0.5 ? [a, b] : [b, a];

  const room = {
    id: roomId,
    board: createEmptyBoard(),
    turn: 'X',
    status: 'playing',
    players: {
      X: { socket: xEntry.socket, userId: xEntry.userId, name: xEntry.name, rating: xEntry.rating },
      O: { socket: oEntry.socket, userId: oEntry.userId, name: oEntry.name, rating: oEntry.rating },
    },
  };
  rooms.set(roomId, room);

  for (const symbol of ['X', 'O']) {
    const p = room.players[symbol];
    p.socket.data.roomId = roomId;
    p.socket.join(roomId);
    p.socket.emit('match:found', {
      roomId,
      you: { symbol, name: p.name, rating: p.rating },
      opponent: opponentInfo(room, symbol),
      state: publicMatchState(room),
    });
  }
}

function tryMatch() {
  const entries = [...queue.values()].sort((x, y) => x.rating - y.rating);
  for (let i = 0; i < entries.length - 1; i += 1) {
    const a = entries[i];
    const b = entries[i + 1];
    if (a.userId === b.userId) continue;
    const now = Date.now();
    const delta = Math.max(acceptableDelta(now - a.joinedAt), acceptableDelta(now - b.joinedAt));
    if (Math.abs(a.rating - b.rating) <= delta) {
      queue.delete(a.userId);
      queue.delete(b.userId);
      startMatch(a, b);
      tryMatch();
      return;
    }
  }
}

function finishMatch(room, winner, { forfeit = false } = {}) {
  if (room.status === 'over') return;
  room.status = 'over';

  let results = null;
  try {
    results = finalizeMatch({
      xUserId: room.players.X.userId,
      oUserId: room.players.O.userId,
      winner,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[game] finalizeMatch failed:', err.message);
  }

  const evaluation = evaluateBoard(room.board);
  for (const symbol of ['X', 'O']) {
    const p = room.players[symbol];
    if (!p.socket.connected) continue;
    p.socket.emit('match:over', {
      board: room.board,
      winner,
      line: evaluation.line,
      forfeit,
      result: results ? results[symbol] : null,
    });
    p.socket.data.roomId = null;
    p.socket.leave(room.id);
  }
  rooms.delete(room.id);
}

function handleLeave(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) {
    socket.data.roomId = null;
    return;
  }
  if (room.status === 'playing') {
    const leaverSymbol = room.players.X.socket.id === socket.id ? 'X' : 'O';
    const winner = leaverSymbol === 'X' ? 'O' : 'X';
    finishMatch(room, winner, { forfeit: true });
  }
}

function registerGame(io) {
  // Authenticate every socket via the httpOnly auth cookie.
  io.use((socket, next) => {
    try {
      const header = socket.handshake.headers.cookie || '';
      const cookies = cookie.parse(header);
      const token = cookies[config.cookieName];
      if (!token) return next(new Error('No autenticado'));
      const payload = auth.verifyToken(token);
      const user = repo.getUserById(payload.sub);
      if (!user) return next(new Error('Sesión inválida'));
      socket.data.userId = user.id;
      socket.data.username = user.username;
      socket.data.roomId = null;
      return next();
    } catch {
      return next(new Error('No autorizado'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('queue:join', () => {
      if (socket.data.roomId) return;
      const user = repo.getUserById(socket.data.userId);
      if (!user) return;
      // Replace any stale entry for this user (e.g. reconnect).
      queue.set(user.id, {
        socket,
        userId: user.id,
        name: user.username,
        rating: user.rating,
        joinedAt: Date.now(),
      });
      socket.emit('queue:waiting');
      tryMatch();
    });

    socket.on('queue:leave', () => {
      queue.delete(socket.data.userId);
      socket.emit('queue:left');
    });

    socket.on('match:move', (payload) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || room.status !== 'playing') return;
      const symbol = room.players.X.socket.id === socket.id ? 'X'
        : room.players.O.socket.id === socket.id ? 'O' : null;
      if (!symbol || symbol !== room.turn) return;

      const index = payload && Number.isInteger(payload.index) ? payload.index : -1;
      if (!isValidMove(room.board, index)) return;

      room.board[index] = symbol;
      const { winner } = evaluateBoard(room.board);
      if (winner) {
        io.to(room.id).emit('match:update', publicMatchState(room));
        finishMatch(room, winner);
      } else {
        room.turn = room.turn === 'X' ? 'O' : 'X';
        io.to(room.id).emit('match:update', publicMatchState(room));
      }
    });

    socket.on('match:leave', () => {
      handleLeave(socket);
    });

    socket.on('disconnect', () => {
      queue.delete(socket.data.userId);
      handleLeave(socket);
    });
  });

  // Periodic sweep so waiting players match as their rating window widens.
  setInterval(tryMatch, 1000).unref();
}

module.exports = { registerGame };
