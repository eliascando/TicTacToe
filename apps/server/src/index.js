'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const config = require('./config');
const { router } = require('./routes');
const { registerGame } = require('./game');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Security headers with a CSP tailored to a same-origin app (no external assets).
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

// Broad rate limit as a safety net across the API.
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use('/api', router);
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve the built web client (single-service deployment).
app.use(express.static(config.webDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(config.webDir, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server);
registerGame(io);

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Tres en Raya online escuchando en http://localhost:${config.port}`);
});

module.exports = { app, server };
