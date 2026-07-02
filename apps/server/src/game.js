'use strict';

const cookie = require('cookie');
const crypto = require('crypto');
const config = require('./config');
const auth = require('./auth');
const repo = require('./repository');
const { store } = require('./store');
const { finalizeMatch } = require('./matchService');
const { createEmptyBoard, evaluateBoard, isValidMove } = require('@ttt/shared');

function publicMatchState(room) {
  return { board: room.board, turn: room.turn, status: room.status };
}

function opponentInfo(room, symbol) {
  const other = symbol === 'X' ? 'O' : 'X';
  const p = room.players[other];
  return { name: p.name, rating: p.rating, symbol: other };
}

function symbolForSocket(room, socketId) {
  if (room.players.X.socketId === socketId) return 'X';
  if (room.players.O.socketId === socketId) return 'O';
  return null;
}

async function startMatch(io, a, b) {
  const roomId = crypto.randomUUID();
  const [x, o] = Math.random() < 0.5 ? [a, b] : [b, a];
  const room = {
    id: roomId,
    board: createEmptyBoard(),
    turn: 'X',
    status: 'playing',
    players: {
      X: { userId: x.userId, socketId: x.socketId, name: x.name, rating: x.rating },
      O: { userId: o.userId, socketId: o.socketId, name: o.name, rating: o.rating },
    },
  };
  await store.createRoom(room);
  await store.mapSocket(x.socketId, roomId);
  await store.mapSocket(o.socketId, roomId);

  for (const symbol of ['X', 'O']) {
    const p = room.players[symbol];
    // Emit to the socket's own room; the adapter routes it to whichever instance hosts it.
    io.to(p.socketId).emit('match:found', {
      roomId,
      you: { symbol, name: p.name, rating: p.rating },
      opponent: opponentInfo(room, symbol),
      state: publicMatchState(room),
    });
  }
}

async function tryMatch(io) {
  // Loop while atomic pairing keeps returning matches.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const pair = await store.popMatchablePair();
    if (!pair) break;
    // eslint-disable-next-line no-await-in-loop
    await startMatch(io, pair[0], pair[1]);
  }
}

async function finishMatch(io, room, winner, { forfeit = false } = {}) {
  if (room.status === 'over') return;
  room.status = 'over';
  await store.saveRoom(room);

  let results = null;
  try {
    results = await finalizeMatch({
      xUserId: room.players.X.userId,
      oUserId: room.players.O.userId,
      winner,
    });
  } catch (err) {
    console.error('[game] finalizeMatch failed:', err.message);
  }

  const { line } = evaluateBoard(room.board);
  for (const symbol of ['X', 'O']) {
    const p = room.players[symbol];
    io.to(p.socketId).emit('match:over', {
      board: room.board,
      winner,
      line,
      forfeit,
      result: results ? results[symbol] : null,
    });
    await store.unmapSocket(p.socketId);
  }
  await store.deleteRoom(room.id);
}

async function handleLeave(io, socket) {
  const roomId = await store.getRoomIdForSocket(socket.id);
  if (!roomId) return;
  await store.withRoomLock(roomId, async () => {
    const room = await store.getRoom(roomId);
    if (!room || room.status !== 'playing') {
      await store.unmapSocket(socket.id);
      return;
    }
    const leaver = symbolForSocket(room, socket.id);
    if (!leaver) return;
    const winner = leaver === 'X' ? 'O' : 'X';
    await finishMatch(io, room, winner, { forfeit: true });
  });
}

function registerGame(io) {
  // Authenticate every socket via the httpOnly auth cookie.
  io.use(async (socket, next) => {
    try {
      const cookies = cookie.parse(socket.handshake.headers.cookie || '');
      const token = cookies[config.cookieName];
      if (!token) return next(new Error('No autenticado'));
      const payload = auth.verifyToken(token);
      const user = await repo.getUserById(payload.sub);
      if (!user) return next(new Error('Sesión inválida'));
      socket.data.userId = user.id;
      socket.data.username = user.username;
      return next();
    } catch {
      return next(new Error('No autorizado'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('queue:join', async () => {
      const inRoom = await store.getRoomIdForSocket(socket.id);
      if (inRoom) return;
      const user = await repo.getUserById(socket.data.userId);
      if (!user) return;
      await store.enqueue({
        userId: user.id,
        socketId: socket.id,
        name: user.username,
        rating: user.rating,
        joinedAt: Date.now(),
      });
      socket.emit('queue:waiting');
      await tryMatch(io);
    });

    socket.on('queue:leave', async () => {
      await store.removeFromQueue(socket.data.userId);
      socket.emit('queue:left');
    });

    socket.on('match:move', async (payload) => {
      const roomId = await store.getRoomIdForSocket(socket.id);
      if (!roomId) return;
      await store.withRoomLock(roomId, async () => {
        const room = await store.getRoom(roomId);
        if (!room || room.status !== 'playing') return;
        const symbol = symbolForSocket(room, socket.id);
        if (!symbol || symbol !== room.turn) return;
        const index = payload && Number.isInteger(payload.index) ? payload.index : -1;
        if (!isValidMove(room.board, index)) return;

        room.board[index] = symbol;
        const { winner } = evaluateBoard(room.board);
        if (winner) {
          await store.saveRoom(room);
          io.to(room.players.X.socketId).emit('match:update', publicMatchState(room));
          io.to(room.players.O.socketId).emit('match:update', publicMatchState(room));
          await finishMatch(io, room, winner);
        } else {
          room.turn = room.turn === 'X' ? 'O' : 'X';
          await store.saveRoom(room);
          io.to(room.players.X.socketId).emit('match:update', publicMatchState(room));
          io.to(room.players.O.socketId).emit('match:update', publicMatchState(room));
        }
      });
    });

    socket.on('match:leave', async () => {
      await handleLeave(io, socket);
    });

    socket.on('disconnect', async () => {
      await store.removeFromQueue(socket.data.userId);
      await handleLeave(io, socket);
    });
  });

  // Periodic sweep so waiting players match as their rating window widens.
  setInterval(() => { tryMatch(io).catch(() => {}); }, 1000).unref();
}

module.exports = { registerGame };
