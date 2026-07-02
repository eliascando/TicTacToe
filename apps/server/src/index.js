'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const config = require('./config');
const repo = require('./repository');
const { initStore } = require('./store');
const { router } = require('./routes');
const { registerGame } = require('./game');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  })
);

app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());

app.use(
  '/api',
  rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false })
);

app.use('/api', router);
app.get('/api/health', (req, res) => res.json({ ok: true, instance: config.instanceId }));

app.use(express.static(config.webDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(config.webDir, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server);

async function start() {
  await repo.init();
  await initStore();

  // Horizontal scaling: share Socket.IO broadcasts across instances via Redis.
  if (config.redisUrl) {
    const { createClient } = require('redis');
    const { createAdapter } = require('@socket.io/redis-adapter');
    const pubClient = createClient({ url: config.redisUrl });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[scale] Socket.IO Redis adapter activo');
  }

  registerGame(io);

  server.listen(config.port, () => {
    const mode = config.redisUrl ? 'escalable (Redis)' : 'single-instance';
    const db = config.databaseUrl ? 'Postgres' : 'SQLite';
    console.log(
      `Tres en Raya online [${mode}, ${db}] escuchando en http://localhost:${config.port} (instancia ${config.instanceId})`
    );
  });
}

start().catch((err) => {
  console.error('Fallo al iniciar el servidor:', err);
  process.exit(1);
});

module.exports = { app, server };
