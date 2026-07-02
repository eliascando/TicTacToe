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
  const updated = { ...user };
  updated.xp += xpForResult(outcome);
  if (outcome === 'win') {
    updated.wins += 1;
    updated.current_streak += 1;
    updated.best_streak = Math.max(updated.best_streak, updated.current_streak);
  } else if (outcome === 'loss') {
    updated.losses += 1;
    updated.current_streak = 0;
  } else {
    updated.draws += 1;
    updated.current_streak = 0;
  }
  return updated;
}

function statsForAchievements(user) {
  return {
    games: user.wins + user.losses + user.draws,
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
    bestStreak: user.best_streak,
    currentStreak: user.current_streak,
    rating: user.rating,
    xp: user.xp,
  };
}

function newAchievements(user) {
  const qualified = evaluateAchievements(statsForAchievements(user));
  const earned = [];
  for (const key of qualified) {
    if (repo.addAchievement(user.id, key)) {
      const def = ACHIEVEMENTS_BY_KEY[key];
      if (def) earned.push({ key: def.key, name: def.name, icon: def.icon, description: def.description });
    }
  }
  return earned;
}

/**
 * Persists a finished match: Elo, XP, streaks, achievements and history.
 * Runs atomically. Returns per-player result payloads.
 */
function finalizeMatch({ xUserId, oUserId, winner }) {
  const apply = repo.runInTransaction(() => {
    const xUser = repo.getUserById(xUserId);
    const oUser = repo.getUserById(oUserId);
    if (!xUser || !oUser) throw new Error('Jugador no encontrado');

    const scoreX = winner === 'draw' ? 0.5 : winner === 'X' ? 1 : 0;
    const { newA, newB, changeA, changeB } = computeElo(xUser.rating, oUser.rating, scoreX);

    let updatedX = applyOutcomeToUser(xUser, outcomeFor('X', winner));
    let updatedO = applyOutcomeToUser(oUser, outcomeFor('O', winner));
    updatedX.rating = newA;
    updatedO.rating = newB;

    repo.updateUserStats(updatedX);
    repo.updateUserStats(updatedO);

    repo.recordMatch({
      player_x_id: xUserId,
      player_o_id: oUserId,
      winner,
      x_rating_change: changeA,
      o_rating_change: changeB,
    });

    const xAchievements = newAchievements(updatedX);
    const oAchievements = newAchievements(updatedO);

    return {
      X: {
        profile: repo.toProfile(repo.getUserById(xUserId)),
        ratingChange: changeA,
        outcome: outcomeFor('X', winner),
        newAchievements: xAchievements,
      },
      O: {
        profile: repo.toProfile(repo.getUserById(oUserId)),
        ratingChange: changeB,
        outcome: outcomeFor('O', winner),
        newAchievements: oAchievements,
      },
    };
  });
  return apply();
}

module.exports = { finalizeMatch };
