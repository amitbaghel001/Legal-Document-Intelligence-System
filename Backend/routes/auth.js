import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { validateAuthPayload, validateRegisterPayload } from '../middleware/validators.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { auditTrail } from '../middleware/auditTrail.js';

const router = express.Router();
const authLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 35 });

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, type: 'access', tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id, type: 'refresh', tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_TTL || '30d' }
  );
};

const buildAuthResponse = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  token: generateToken(user),
  refreshToken: generateRefreshToken(user)
});

// Register
router.post('/register', authLimiter, validateRegisterPayload, auditTrail('REGISTER', 'USER'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create user
    const user = await User.create({ name, email, password, role });

    res.status(201).json(buildAuthResponse(user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
router.post('/login', authLimiter, validateAuthPayload, auditTrail('LOGIN', 'USER'), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json(buildAuthResponse(user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Refresh access token
router.post('/refresh', authLimiter, async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken || req.headers['x-refresh-token'];
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token type' });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    res.json({
      token: generateToken(user),
      refreshToken: generateRefreshToken(user)
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// Logout all sessions
router.post('/logout-all', protect, auditTrail('LOGOUT_ALL', 'USER'), async (req, res) => {
  try {
    req.user.tokenVersion += 1;
    await req.user.save();
    res.json({ success: true, message: 'All sessions logged out' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user
router.get('/me', protect, async (req, res) => {
  res.json(req.user);
});

export default router;
