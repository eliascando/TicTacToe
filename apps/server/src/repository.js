'use strict';

const db = require('./db');
const { levelFromXp } = require('@ttt/shared');

const stmt = {
  insertUser: db.prepare(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)'
  ),
  findByUsername: db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
  findById: db.prepare('SELECT * FROM users WHERE id = ?'),
  updateStats: db.prepare(`
    UPDATE users
    SET rating = @rating,
        xp = @xp,
        wins = @wins,
        losses = @losses,
        draws = @draws,
        current_streak = @current_streak,
        best_streak = @best_streak
    WHERE id = @id
  `),
  insertAchievement: db.prepare(
    'INSERT OR IGNORE INTO achievements (user_id, achievement_key) VALUES (?, ?)'
  ),
  achievementsForUser: db.prepare(
    'SELECT achievement_key, earned_at FROM achievements WHERE user_id = ? ORDER BY earned_at'
  ),
  insertMatch: db.prepare(`
    INSERT INTO matches (player_x_id, player_o_id, winner, x_rating_change, o_rating_change)
    VALUES (@player_x_id, @player_o_id, @winner, @x_rating_change, @o_rating_change)
  `),
  recentMatchesForUser: db.prepare(`
    SELECT m.*, ux.username AS x_name, uo.username AS o_name
    FROM matches m
    JOIN users ux ON ux.id = m.player_x_id
    JOIN users uo ON uo.id = m.player_o_id
    WHERE m.player_x_id = ? OR m.player_o_id = ?
    ORDER BY m.id DESC
    LIMIT 10
  `),
  leaderboard: db.prepare(`
    SELECT id, username, rating, xp, wins, losses, draws
    FROM users
    ORDER BY rating DESC, wins DESC
    LIMIT 20
  `),
};

function createUser(username, passwordHash) {
  const info = stmt.insertUser.run(username, passwordHash);
  return stmt.findById.get(info.lastInsertRowid);
}

function getUserByUsername(username) {
  return stmt.findByUsername.get(username);
}

function getUserById(id) {
  return stmt.findById.get(id);
}

function getAchievementKeys(userId) {
  return stmt.achievementsForUser.get
    ? stmt.achievementsForUser.all(userId).map((r) => r.achievement_key)
    : [];
}

function getAchievementRows(userId) {
  return stmt.achievementsForUser.all(userId);
}

function addAchievement(userId, key) {
  const info = stmt.insertAchievement.run(userId, key);
  return info.changes > 0;
}

function updateUserStats(user) {
  stmt.updateStats.run({
    id: user.id,
    rating: user.rating,
    xp: user.xp,
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
    current_streak: user.current_streak,
    best_streak: user.best_streak,
  });
}

function recordMatch(match) {
  stmt.insertMatch.run(match);
}

function getRecentMatches(userId) {
  return stmt.recentMatchesForUser.all(userId, userId);
}

function getLeaderboard() {
  return stmt.leaderboard.all();
}

/** Shapes a user row into a safe public profile (never includes password_hash). */
function toProfile(user) {
  const levelInfo = levelFromXp(user.xp);
  const games = user.wins + user.losses + user.draws;
  return {
    id: user.id,
    username: user.username,
    rating: user.rating,
    xp: user.xp,
    level: levelInfo.level,
    levelProgress: levelInfo,
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
    games,
    currentStreak: user.current_streak,
    bestStreak: user.best_streak,
  };
}

const runInTransaction = (fn) => db.transaction(fn);

module.exports = {
  createUser,
  getUserByUsername,
  getUserById,
  getAchievementKeys,
  getAchievementRows,
  addAchievement,
  updateUserStats,
  recordMatch,
  getRecentMatches,
  getLeaderboard,
  toProfile,
  runInTransaction,
};
