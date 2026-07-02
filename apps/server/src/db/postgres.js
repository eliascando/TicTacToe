'use strict';

const { Pool } = require('pg');
const config = require('../config');

let pool;

async function init() {
  pool = new Pool({ connectionString: config.databaseUrl, max: 10 });

  // Serialize schema creation across instances to avoid concurrent-DDL races.
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [727274]);
    await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      rating        INTEGER NOT NULL DEFAULT 1000,
      xp            INTEGER NOT NULL DEFAULT 0,
      wins          INTEGER NOT NULL DEFAULT 0,
      losses        INTEGER NOT NULL DEFAULT 0,
      draws         INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      best_streak   INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
    CREATE TABLE IF NOT EXISTS achievements (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_key TEXT NOT NULL,
      earned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, achievement_key)
    );
    CREATE TABLE IF NOT EXISTS matches (
      id             SERIAL PRIMARY KEY,
      player_x_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      player_o_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      winner         TEXT NOT NULL,
      x_rating_change INTEGER NOT NULL DEFAULT 0,
      o_rating_change INTEGER NOT NULL DEFAULT 0,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC);
  `);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [727274]);
    client.release();
  }
}

async function createUser(username, passwordHash) {
  const { rows } = await pool.query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING *',
    [username, passwordHash]
  );
  return rows[0];
}
async function getUserByUsername(username) {
  const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  return rows[0];
}
async function getUserById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0];
}
async function getAchievementRows(userId) {
  const { rows } = await pool.query(
    'SELECT achievement_key, earned_at FROM achievements WHERE user_id = $1 ORDER BY earned_at',
    [userId]
  );
  return rows;
}
async function addAchievement(userId, key) {
  const { rowCount } = await pool.query(
    `INSERT INTO achievements (user_id, achievement_key) VALUES ($1, $2)
     ON CONFLICT (user_id, achievement_key) DO NOTHING`,
    [userId, key]
  );
  return rowCount > 0;
}
async function updateUserStats(u) {
  await pool.query(
    `UPDATE users SET rating=$2, xp=$3, wins=$4, losses=$5, draws=$6,
       current_streak=$7, best_streak=$8 WHERE id=$1`,
    [u.id, u.rating, u.xp, u.wins, u.losses, u.draws, u.current_streak, u.best_streak]
  );
}
async function recordMatch(m) {
  await pool.query(
    `INSERT INTO matches (player_x_id, player_o_id, winner, x_rating_change, o_rating_change)
     VALUES ($1, $2, $3, $4, $5)`,
    [m.player_x_id, m.player_o_id, m.winner, m.x_rating_change, m.o_rating_change]
  );
}
async function getRecentMatches(userId) {
  const { rows } = await pool.query(
    `SELECT m.*, ux.username AS x_name, uo.username AS o_name
     FROM matches m
     JOIN users ux ON ux.id = m.player_x_id
     JOIN users uo ON uo.id = m.player_o_id
     WHERE m.player_x_id = $1 OR m.player_o_id = $1
     ORDER BY m.id DESC LIMIT 10`,
    [userId]
  );
  return rows;
}
async function getLeaderboard() {
  const { rows } = await pool.query(
    `SELECT id, username, rating, xp, wins, losses, draws
     FROM users ORDER BY rating DESC, wins DESC LIMIT 20`
  );
  return rows;
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx = {
      // Row-level lock prevents lost updates across instances.
      getUserById: async (id) => {
        const { rows } = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [id]);
        return rows[0];
      },
      updateUserStats: (u) =>
        client.query(
          `UPDATE users SET rating=$2, xp=$3, wins=$4, losses=$5, draws=$6,
             current_streak=$7, best_streak=$8 WHERE id=$1`,
          [u.id, u.rating, u.xp, u.wins, u.losses, u.draws, u.current_streak, u.best_streak]
        ),
      recordMatch: (m) =>
        client.query(
          `INSERT INTO matches (player_x_id, player_o_id, winner, x_rating_change, o_rating_change)
           VALUES ($1, $2, $3, $4, $5)`,
          [m.player_x_id, m.player_o_id, m.winner, m.x_rating_change, m.o_rating_change]
        ),
      addAchievement: async (userId, key) => {
        const { rowCount } = await client.query(
          `INSERT INTO achievements (user_id, achievement_key) VALUES ($1, $2)
           ON CONFLICT (user_id, achievement_key) DO NOTHING`,
          [userId, key]
        );
        return rowCount > 0;
      },
    };
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  driverName: 'postgres',
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
