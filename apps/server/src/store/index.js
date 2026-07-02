'use strict';

const config = require('../config');

// Redis-backed store enables horizontal scaling across instances; the in-memory
// store is the zero-config default for single-instance development.
const store = config.redisUrl ? require('./redis') : require('./memory');

async function initStore() {
  if (typeof store.init === 'function') await store.init();
  return store;
}

module.exports = { store, initStore };
