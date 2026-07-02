'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const repo = require('./repository');
const auth = require('./auth');
const { publicCatalog } = require('@ttt/shared');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Inténtalo más tarde.' },
});

const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'El usuario debe tener al menos 3 caracteres.')
    .max(20, 'El usuario no puede superar 20 caracteres.')
    .regex(/^[a-zA-Z0-9_]+$/, 'Solo se permiten letras, números y guion bajo.'),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres.')
    .max(100, 'La contraseña es demasiado larga.'),
});

function buildFullProfile(user) {
  const profile = repo.toProfile(user);
  profile.achievements = repo.getAchievementRows(user.id);
  profile.recentMatches = repo.getRecentMatches(user.id).map((m) => ({
    id: m.id,
    xName: m.x_name,
    oName: m.o_name,
    winner: m.winner,
    xRatingChange: m.x_rating_change,
    oRatingChange: m.o_rating_change,
    createdAt: m.created_at,
  }));
  return profile;
}

router.post('/auth/register', authLimiter, (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { username, password } = parsed.data;

  if (repo.getUserByUsername(username)) {
    return res.status(409).json({ error: 'Ese nombre de usuario ya existe.' });
  }

  const passwordHash = bcrypt.hashSync(password, config.bcryptRounds);
  const user = repo.createUser(username, passwordHash);
  const token = auth.signToken(user);
  auth.setAuthCookie(res, token);
  return res.status(201).json({ user: buildFullProfile(user) });
});

router.post('/auth/login', authLimiter, (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Usuario o contraseña inválidos.' });
  }
  const { username, password } = parsed.data;

  const user = repo.getUserByUsername(username);
  // Always run a comparison to reduce user-enumeration timing differences.
  const hash = user ? user.password_hash : '$2a$12$'.padEnd(60, '.');
  const ok = bcrypt.compareSync(password, hash);
  if (!user || !ok) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  const token = auth.signToken(user);
  auth.setAuthCookie(res, token);
  return res.json({ user: buildFullProfile(user) });
});

router.post('/auth/logout', (req, res) => {
  auth.clearAuthCookie(res);
  return res.json({ ok: true });
});

router.get('/me', auth.requireAuth, (req, res) => {
  return res.json({ user: buildFullProfile(req.user) });
});

router.get('/leaderboard', (req, res) => {
  return res.json({ leaderboard: repo.getLeaderboard() });
});

router.get('/achievements', (req, res) => {
  return res.json({ catalog: publicCatalog() });
});

module.exports = { router, buildFullProfile };
