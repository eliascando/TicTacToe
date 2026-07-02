'use strict';

const WINNING_COMBINATIONS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function createEmptyBoard() {
  return Array(9).fill(null);
}

/**
 * Evaluates a 9-cell board.
 * @returns {{ winner: 'X'|'O'|'draw'|null, line: number[]|null }}
 */
function evaluateBoard(cells) {
  for (const line of WINNING_COMBINATIONS) {
    const [a, b, c] = line;
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) {
      return { winner: cells[a], line };
    }
  }
  if (cells.every((cell) => cell !== null)) {
    return { winner: 'draw', line: null };
  }
  return { winner: null, line: null };
}

function isValidMove(cells, index) {
  return Number.isInteger(index) && index >= 0 && index < 9 && cells[index] === null;
}

module.exports = { WINNING_COMBINATIONS, createEmptyBoard, evaluateBoard, isValidMove };
