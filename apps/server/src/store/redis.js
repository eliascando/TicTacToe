'use strict';

const crypto = require('crypto');
const { createClient } = require('redis');
const config = require('../config');

// Shared store backed by Redis. Enables horizontal scaling: matchmaking queue,
// room state and the socket→room index are visible to every instance.

let client;

const ENTRIES = 'mm:entries'; // hash userId -> JSON entry
const ZSET = 'mm:zset'; // sorted set member=userId score=rating
const MM_LOCK = 'mm:lock';
const roomKey = (id) => `room:${id}`;
const sockKey = (id) => `sock:${id}`;
const roomLockKey = (id) => `lock:room:${id}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function acceptableDelta(waitMs) {
  return 100 + Math.floor(waitMs / 1000) * 100;
}

async function init() {
  client = createClient({ url: config.redisUrl });
  client.on('error', (e) => console.error('[redis] client error:', e.message));
  await client.connect();
}

async function acquireLock(key, ttlMs) {
  const token = crypto.randomUUID();
  const ok = await client.set(key, token, { NX: true, PX: ttlMs });
  return ok ? token : null;
}

const RELEASE_LUA = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
async function releaseLock(key, token) {
  try {
    await client.eval(RELEASE_LUA, { keys: [key], arguments: [token] });
  } catch { /* ignore */ }
}

async function enqueue(entry) {
  await client.hSet(ENTRIES, String(entry.userId), JSON.stringify(entry));
  await client.zAdd(ZSET, [{ score: entry.rating, value: String(entry.userId) }]);
}

async function removeFromQueue(userId) {
  await client.hDel(ENTRIES, String(userId));
  await client.zRem(ZSET, String(userId));
}

async function popMatchablePair() {
  const token = await acquireLock(MM_LOCK, 3000);
  if (!token) return null;
  try {
    const ids = await client.zRange(ZSET, 0, -1); // ascending by rating
    const entries = [];
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      const raw = await client.hGet(ENTRIES, id);
      if (raw) entries.push(JSON.parse(raw));
      // eslint-disable-next-line no-await-in-loop
      else await client.zRem(ZSET, id); // drop stale members
    }
    entries.sort((a, b) => a.rating - b.rating);
    const now = Date.now();
    for (let i = 0; i < entries.length - 1; i += 1) {
      const a = entries[i];
      const b = entries[i + 1];
      if (a.userId === b.userId) continue;
      const delta = Math.max(acceptableDelta(now - a.joinedAt), acceptableDelta(now - b.joinedAt));
      if (Math.abs(a.rating - b.rating) <= delta) {
        await client.hDel(ENTRIES, String(a.userId), String(b.userId));
        await client.zRem(ZSET, String(a.userId), String(b.userId));
        return [a, b];
      }
    }
    return null;
  } finally {
    await releaseLock(MM_LOCK, token);
  }
}

async function createRoom(room) {
  await client.set(roomKey(room.id), JSON.stringify(room));
}
async function getRoom(roomId) {
  const raw = await client.get(roomKey(roomId));
  return raw ? JSON.parse(raw) : null;
}
async function saveRoom(room) {
  await client.set(roomKey(room.id), JSON.stringify(room));
}
async function deleteRoom(roomId) {
  await client.del(roomKey(roomId));
}

async function mapSocket(socketId, roomId) {
  await client.set(sockKey(socketId), roomId, { EX: 3600 });
}
async function getRoomIdForSocket(socketId) {
  return client.get(sockKey(socketId));
}
async function unmapSocket(socketId) {
  await client.del(sockKey(socketId));
}

async function withRoomLock(roomId, fn) {
  const key = roomLockKey(roomId);
  let token = null;
  for (let i = 0; i < 100 && !token; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    token = await acquireLock(key, 5000);
    // eslint-disable-next-line no-await-in-loop
    if (!token) await sleep(20);
  }
  if (!token) throw new Error(`No se pudo obtener el lock de la sala ${roomId}`);
  try {
    return await fn();
  } finally {
    await releaseLock(key, token);
  }
}

async function close() {
  if (client) await client.quit();
}

module.exports = {
  storeName: 'redis',
  init,
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
