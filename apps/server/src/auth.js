'use strict';

const jwt = require('jsonwebtoken');
const config = require('./config');
const repo = require('./repository');

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

function setAuthCookie(res, token) {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie(config.cookieName, { path: '/' });
}

/** Express middleware: requires a valid auth cookie, attaches req.user. */
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[config.cookieName];
  if (!token) {
    return res.status(401).json({ error: 'No autenticado.' });
  }
  try {
    const payload = verifyToken(token);
    const user = repo.getUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Sesión inválida.' });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Sesión expirada o inválida.' });
  }
}

module.exports = {
  signToken,
  verifyToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
};
