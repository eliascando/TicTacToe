'use strict';

const XP_PER_WIN = 30;
const XP_PER_DRAW = 15;
const XP_PER_LOSS = 5;
const XP_PER_LEVEL = 100;

function xpForResult(result) {
  if (result === 'win') return XP_PER_WIN;
  if (result === 'draw') return XP_PER_DRAW;
  return XP_PER_LOSS;
}

/**
 * Derives level and in-level progress from total XP.
 * Level 1 starts at 0 XP; each level requires XP_PER_LEVEL more.
 */
function levelFromXp(totalXp) {
  const xp = Math.max(0, Math.floor(totalXp) || 0);
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = xp % XP_PER_LEVEL;
  return {
    level,
    xpIntoLevel,
    xpForNextLevel: XP_PER_LEVEL,
    progress: xpIntoLevel / XP_PER_LEVEL,
  };
}

module.exports = {
  XP_PER_WIN,
  XP_PER_DRAW,
  XP_PER_LOSS,
  XP_PER_LEVEL,
  xpForResult,
  levelFromXp,
};
