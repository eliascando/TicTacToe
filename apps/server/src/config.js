'use strict';

const crypto = require('crypto');
const path = require('path');

const isProd = process.env.NODE_ENV === 'production';

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProd) {
    // Fail fast in production: never run with an unknown/ephemeral secret.
    throw new Error('JWT_SECRET must be set in production.');
  }
  // Dev fallback: ephemeral secret (invalidates sessions on restart).
  jwtSecret = crypto.randomBytes(32).toString('hex');
  // eslint-disable-next-line no-console
  console.warn('[config] JWT_SECRET not set — using an ephemeral dev secret.');
}

const config = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieName: 'ttt_token',
  dbFile:
    process.env.DB_FILE || path.join(__dirname, '..', 'data', 'tictactoe.db'),
  webDir:
    process.env.WEB_DIR ||
    path.resolve(__dirname, '..', '..', 'web', 'public'),
  bcryptRounds: 12,
  // Scaling: when set, enables shared state across instances.
  databaseUrl: process.env.DATABASE_URL || null, // Postgres (shared DB)
  redisUrl: process.env.REDIS_URL || null, // Redis (adapter + queue/rooms)
  instanceId: process.env.INSTANCE_ID || `${process.pid}`,
};

module.exports = config;
