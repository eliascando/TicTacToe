'use strict';

const config = require('./config');
const { levelFromXp } = require('@ttt/shared');

// Select the storage driver. Postgres enables a shared DB across instances
// (horizontal scaling); SQLite is the zero-config default for development.
const driver = config.databaseUrl
  ? require('./db/postgres')
  : require('./db/sqlite');

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

module.exports = { ...driver, toProfile };
