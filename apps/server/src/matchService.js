'use strict';

const repo = require('./repository');
const {
  computeElo,
  xpForResult,
  evaluateAchievements,
  ACHIEVEMENTS_BY_KEY,
} = require('@ttt/shared');

function outcomeFor(symbol, winner) {
  if (winner === 'draw') return 'draw';
  return winner === symbol ? 'win' : 'loss';
}

function applyOutcomeToUser(user, outcome) {
  const u = { ...user };
  u.xp += xpForResult(outcome);
  if (outcome === 'win') {
    u.wins += 1;
    u.current_streak += 1;
    u.best_streak = Math.max(u.best_streak, u.current_streak);
  } else if (outcome === 'loss') {
    u.losses += 1;
    u.current_streak = 0;
  } else {
    u.draws += 1;
    u.current_streak = 0;
  }
  return u;
}

function statsForAchievements(u) {
  return {
    games: u.wins + u.losses + u.draws,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws,
    bestStreak: u.best_streak,
    currentStreak: u.current_streak,
    rating: u.rating,
    xp: u.xp,
  };
}

async function grantNewAchievements(tx, user) {
  const qualified = evaluateAchievements(statsForAchievements(user));
  const earned = [];
  for (const key of qualified) {
    // eslint-disable-next-line no-await-in-loop
    if (await tx.addAchievement(user.id, key)) {
      const def = ACHIEVEMENTS_BY_KEY[key];
      if (def) earned.push({ key: def.key, name: def.name, icon: def.icon, description: def.description });
    }
  }
  return earned;
}

async function doFinalize({ xUserId, oUserId, winner }) {
  return repo.withTransaction(async (tx) => {
    const xUser = await tx.getUserById(xUserId);
    const oUser = await tx.getUserById(oUserId);
    if (!xUser || !oUser) throw new Error('Jugador no encontrado');

    const scoreX = winner === 'draw' ? 0.5 : winner === 'X' ? 1 : 0;
    const { newA, newB, changeA, changeB } = computeElo(xUser.rating, oUser.rating, scoreX);

    const updatedX = applyOutcomeToUser(xUser, outcomeFor('X', winner));
    const updatedO = applyOutcomeToUser(oUser, outcomeFor('O', winner));
    updatedX.rating = newA;
    updatedO.rating = newB;

    await tx.updateUserStats(updatedX);
    await tx.updateUserStats(updatedO);
    await tx.recordMatch({
      player_x_id: xUserId,
      player_o_id: oUserId,
      winner,
      x_rating_change: changeA,
      o_rating_change: changeB,
    });

    const xAch = await grantNewAchievements(tx, updatedX);
    const oAch = await grantNewAchievements(tx, updatedO);

    return {
      X: { profile: repo.toProfile(updatedX), ratingChange: changeA, outcome: outcomeFor('X', winner), newAchievements: xAch },
      O: { profile: repo.toProfile(updatedO), ratingChange: changeB, outcome: outcomeFor('O', winner), newAchievements: oAch },
    };
  });
}

// Serialize finalizations within this instance so overlapping transactions
// never interleave (important for the synchronous SQLite driver).
let lock = Promise.resolve();
function finalizeMatch(args) {
  const run = () => doFinalize(args);
  const result = lock.then(run, run);
  lock = result.then(() => {}, () => {});
  return result;
}

module.exports = { finalizeMatch };
