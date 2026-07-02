'use strict';

// Single-instance store. Keeps the matchmaking queue, live rooms and the
// socket→room index in process memory. Used when REDIS_URL is not set.

const queue = new Map(); // userId -> { userId, socketId, rating, joinedAt }
const rooms = new Map(); // roomId -> room
const socketRoom = new Map(); // socketId -> roomId

function acceptableDelta(waitMs) {
  return 100 + Math.floor(waitMs / 1000) * 100;
}

async function enqueue(entry) {
  queue.set(entry.userId, entry);
}

async function removeFromQueue(userId) {
  queue.delete(userId);
}

async function popMatchablePair() {
  const entries = [...queue.values()].sort((a, b) => a.rating - b.rating);
  const now = Date.now();
  for (let i = 0; i < entries.length - 1; i += 1) {
    const a = entries[i];
    const b = entries[i + 1];
    if (a.userId === b.userId) continue;
    const delta = Math.max(acceptableDelta(now - a.joinedAt), acceptableDelta(now - b.joinedAt));
    if (Math.abs(a.rating - b.rating) <= delta) {
      queue.delete(a.userId);
      queue.delete(b.userId);
      return [a, b];
    }
  }
  return null;
}

async function createRoom(room) { rooms.set(room.id, room); }
async function getRoom(roomId) { return rooms.get(roomId) || null; }
async function saveRoom(room) { rooms.set(room.id, room); }
async function deleteRoom(roomId) { rooms.delete(roomId); }

async function mapSocket(socketId, roomId) { socketRoom.set(socketId, roomId); }
async function getRoomIdForSocket(socketId) { return socketRoom.get(socketId) || null; }
async function unmapSocket(socketId) { socketRoom.delete(socketId); }

// No cross-process contention in a single instance: run directly.
async function withRoomLock(roomId, fn) { return fn(); }

async function close() {}

module.exports = {
  storeName: 'memory',
  enqueue,
  removeFromQueue,
  popMatchablePair,
  createRoom,
  getRoom,
  saveRoom,
  deleteRoom,
  mapSocket,
  getRoomIdForSocket,
  unmapSocket,
  withRoomLock,
  close,
};
