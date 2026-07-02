'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

const db = new Database(config.dbFile);
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
  CREATE INDEX IF NOT EXISTS idx_matches_players ON matches(player_x_id, player_o_id);
`);

module.exports = db;
