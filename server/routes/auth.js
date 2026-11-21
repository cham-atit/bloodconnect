const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { generateToken, authMiddleware } = require('../auth');

const router = express.Router();

// Register
router.post('/register', (req, res) => {
  try {
    const db = getDb();
    const { name, email, password, phone, blood_group, role, lat, lng, city } = req.body;

    if (!name || !email || !password || !phone || !blood_group) {
      return res.status(400).json({ error: 'Missing required fields: name, email, password, phone, blood_group' });
    }

    const validGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    if (!validGroups.includes(blood_group)) {
      return res.status(400).json({ error: 'Invalid blood group' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (name, email, password_hash, phone, blood_group, role, lat, lng, city) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(name, email, password_hash, phone, blood_group, role || 'both', lat || null, lng || null, city || null);

    const user = db.prepare('SELECT id, name, email, phone, blood_group, role, lat, lng, city, is_available, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = generateToken(user);

    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', (req, res) => {
  try {
    const db = getDb();
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { password_hash, ...safeUser } = user;
    const token = generateToken(safeUser);

    res.json({ user: safeUser, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user
router.get('/me', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id, name, email, phone, blood_group, role, lat, lng, city, is_available, last_donation_date, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile
router.put('/profile', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { name, phone, blood_group, lat, lng, city } = req.body;
    db.prepare(
      'UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), blood_group = COALESCE(?, blood_group), lat = COALESCE(?, lat), lng = COALESCE(?, lng), city = COALESCE(?, city) WHERE id = ?'
    ).run(name, phone, blood_group, lat, lng, city, req.user.id);

    const user = db.prepare('SELECT id, name, email, phone, blood_group, role, lat, lng, city, is_available, created_at FROM users WHERE id = ?').get(req.user.id);
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
