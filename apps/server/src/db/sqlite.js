'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

let db;
let stmt;

async function init() {
  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  db = new Database(config.dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      rating        INTEGER NOT NULL DEFAULT 1000,
      xp            INTEGER NOT NULL DEFAULT 0,
      wins          INTEGER NOT NULL DEFAULT 0,
      losses        INTEGER NOT NULL DEFAULT 0,
      draws         INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      best_streak   INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS achievements (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      achievement_key TEXT NOT NULL,
      earned_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, achievement_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS matches (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      player_x_id    INTEGER NOT NULL,
      player_o_id    INTEGER NOT NULL,
      winner         TEXT NOT NULL,
      x_rating_change INTEGER NOT NULL DEFAULT 0,
      o_rating_change INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (player_x_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (player_o_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC);
  `);

  stmt = {
    insertUser: db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)'),
    findByUsername: db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
    findById: db.prepare('SELECT * FROM users WHERE id = ?'),
    updateStats: db.prepare(`
      UPDATE users SET rating=@rating, xp=@xp, wins=@wins, losses=@losses,
        draws=@draws, current_streak=@current_streak, best_streak=@best_streak
      WHERE id=@id`),
    insertAchievement: db.prepare(
      'INSERT OR IGNORE INTO achievements (user_id, achievement_key) VALUES (?, ?)'
    ),
    achievementsForUser: db.prepare(
      'SELECT achievement_key, earned_at FROM achievements WHERE user_id = ? ORDER BY earned_at'
    ),
    insertMatch: db.prepare(`
      INSERT INTO matches (player_x_id, player_o_id, winner, x_rating_change, o_rating_change)
      VALUES (@player_x_id, @player_o_id, @winner, @x_rating_change, @o_rating_change)`),
    recentMatches: db.prepare(`
      SELECT m.*, ux.username AS x_name, uo.username AS o_name
      FROM matches m
      JOIN users ux ON ux.id = m.player_x_id
      JOIN users uo ON uo.id = m.player_o_id
      WHERE m.player_x_id = ? OR m.player_o_id = ?
      ORDER BY m.id DESC LIMIT 10`),
    leaderboard: db.prepare(`
      SELECT id, username, rating, xp, wins, losses, draws
      FROM users ORDER BY rating DESC, wins DESC LIMIT 20`),
  };
}

async function createUser(username, passwordHash) {
  const info = stmt.insertUser.run(username, passwordHash);
  return stmt.findById.get(info.lastInsertRowid);
}
async function getUserByUsername(username) { return stmt.findByUsername.get(username); }
async function getUserById(id) { return stmt.findById.get(id); }
async function getAchievementRows(userId) { return stmt.achievementsForUser.all(userId); }
async function addAchievement(userId, key) {
  return stmt.insertAchievement.run(userId, key).changes > 0;
}
async function updateUserStats(u) { stmt.updateStats.run(u); }
async function recordMatch(m) { stmt.insertMatch.run(m); }
async function getRecentMatches(userId) { return stmt.recentMatches.all(userId, userId); }
async function getLeaderboard() { return stmt.leaderboard.all(); }

// Synchronous better-sqlite3 transaction. Overlap is prevented by the caller's mutex.
async function withTransaction(fn) {
  db.exec('BEGIN');
  try {
    const tx = {
      getUserById: (id) => stmt.findById.get(id),
      updateUserStats: (u) => stmt.updateStats.run(u),
      recordMatch: (m) => stmt.insertMatch.run(m),
      addAchievement: (userId, key) => stmt.insertAchievement.run(userId, key).changes > 0,
    };
    const result = await fn(tx);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = {
  driverName: 'sqlite',
  init,
  createUser,
  getUserByUsername,
  getUserById,
  getAchievementRows,
  addAchievement,
  updateUserStats,
  recordMatch,
  getRecentMatches,
  getLeaderboard,
  withTransaction,
};
