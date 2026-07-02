'use strict';

const DEFAULT_RATING = 1000;
const K_FACTOR = 32;

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/**
 * Computes new Elo ratings after a game.
 * @param {number} ratingA
 * @param {number} ratingB
 * @param {number} scoreA 1 = A wins, 0.5 = draw, 0 = A loses
 * @param {number} [k]
 */
function computeElo(ratingA, ratingB, scoreA, k = K_FACTOR) {
  const expectedA = expectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;
  const scoreB = 1 - scoreA;
  const newA = Math.round(ratingA + k * (scoreA - expectedA));
  const newB = Math.round(ratingB + k * (scoreB - expectedB));
  return {
    newA,
    newB,
    changeA: newA - ratingA,
    changeB: newB - ratingB,
  };
}

module.exports = { DEFAULT_RATING, K_FACTOR, expectedScore, computeElo };
