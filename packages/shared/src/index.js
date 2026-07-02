'use strict';

const board = require('./board');
const rating = require('./rating');
const progression = require('./progression');
const achievements = require('./achievements');

module.exports = {
  ...board,
  ...rating,
  ...progression,
  ...achievements,
};
