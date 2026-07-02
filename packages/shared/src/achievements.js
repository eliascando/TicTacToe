'use strict';

const { levelFromXp } = require('./progression');

/**
 * Achievement catalog. Each has a predicate over a player's aggregate stats.
 * stats: { games, wins, losses, draws, bestStreak, currentStreak, rating, xp }
 */
const ACHIEVEMENTS = [
  {
    key: 'first_game',
    name: 'Bienvenido',
    description: 'Juega tu primera partida.',
    icon: '🎮',
    check: (s) => s.games >= 1,
  },
  {
    key: 'first_win',
    name: 'Primera victoria',
    description: 'Gana tu primera partida.',
    icon: '🥇',
    check: (s) => s.wins >= 1,
  },
  {
    key: 'hat_trick',
    name: 'Racha imparable',
    description: 'Gana 3 partidas seguidas.',
    icon: '🔥',
    check: (s) => s.bestStreak >= 3,
  },
  {
    key: 'veteran',
    name: 'Veterano',
    description: 'Juega 10 partidas.',
    icon: '🎖️',
    check: (s) => s.games >= 10,
  },
  {
    key: 'champion',
    name: 'Campeón',
    description: 'Consigue 10 victorias.',
    icon: '🏆',
    check: (s) => s.wins >= 10,
  },
  {
    key: 'unstoppable',
    name: 'Leyenda',
    description: 'Logra una racha de 5 victorias.',
    icon: '💎',
    check: (s) => s.bestStreak >= 5,
  },
  {
    key: 'rising_star',
    name: 'Estrella en ascenso',
    description: 'Alcanza el nivel 5.',
    icon: '⭐',
    check: (s) => levelFromXp(s.xp).level >= 5,
  },
  {
    key: 'strategist',
    name: 'Estratega',
    description: 'Supera los 1200 puntos de ranking.',
    icon: '🧠',
    check: (s) => s.rating >= 1200,
  },
];

const ACHIEVEMENTS_BY_KEY = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, a]));

/**
 * Returns the achievement keys a player qualifies for given their stats.
 */
function evaluateAchievements(stats) {
  return ACHIEVEMENTS.filter((a) => {
    try {
      return a.check(stats);
    } catch {
      return false;
    }
  }).map((a) => a.key);
}

function publicCatalog() {
  return ACHIEVEMENTS.map(({ key, name, description, icon }) => ({ key, name, description, icon }));
}

module.exports = {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_KEY,
  evaluateAchievements,
  publicCatalog,
};
