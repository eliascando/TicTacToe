'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  evaluateBoard,
  isValidMove,
  computeElo,
  levelFromXp,
  evaluateAchievements,
} = require('./index');

test('evaluateBoard detects a row win', () => {
  const result = evaluateBoard(['X', 'X', 'X', null, 'O', 'O', null, null, null]);
  assert.strictEqual(result.winner, 'X');
  assert.deepStrictEqual(result.line, [0, 1, 2]);
});

test('evaluateBoard detects a draw', () => {
  const result = evaluateBoard(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']);
  assert.strictEqual(result.winner, 'draw');
});

test('evaluateBoard returns null when ongoing', () => {
  const result = evaluateBoard(['X', null, null, null, null, null, null, null, null]);
  assert.strictEqual(result.winner, null);
});

test('isValidMove rejects taken and out-of-range cells', () => {
  const cells = ['X', null, null, null, null, null, null, null, null];
  assert.strictEqual(isValidMove(cells, 0), false);
  assert.strictEqual(isValidMove(cells, 1), true);
  assert.strictEqual(isValidMove(cells, 9), false);
  assert.strictEqual(isValidMove(cells, -1), false);
});

test('computeElo is symmetric and zero-sum-ish for equal ratings', () => {
  const { newA, newB, changeA, changeB } = computeElo(1000, 1000, 1);
  assert.strictEqual(newA, 1016);
  assert.strictEqual(newB, 984);
  assert.strictEqual(changeA, 16);
  assert.strictEqual(changeB, -16);
});

test('levelFromXp computes level and progress', () => {
  assert.strictEqual(levelFromXp(0).level, 1);
  assert.strictEqual(levelFromXp(150).level, 2);
  assert.strictEqual(levelFromXp(150).xpIntoLevel, 50);
});

test('evaluateAchievements awards based on stats', () => {
  const keys = evaluateAchievements({
    games: 10,
    wins: 10,
    losses: 0,
    draws: 0,
    bestStreak: 5,
    currentStreak: 5,
    rating: 1300,
    xp: 500,
  });
  assert.ok(keys.includes('first_game'));
  assert.ok(keys.includes('champion'));
  assert.ok(keys.includes('unstoppable'));
  assert.ok(keys.includes('rising_star'));
  assert.ok(keys.includes('strategist'));
});
