const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

// Haversine distance in km
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Search donors
router.get('/search', (req, res) => {
  try {
    const db = getDb();
    const { blood_group, lat, lng, radius = 50, city } = req.query;

    let query = `SELECT id, name, phone, blood_group, lat, lng, city, is_available, last_donation_date 
                 FROM users WHERE is_available = 1 AND (role = 'donor' OR role = 'both')`;
    const params = [];

    if (blood_group) {
      const compatible = getCompatibleDonors(blood_group);
      query += ` AND blood_group IN (${compatible.map(() => '?').join(',')})`;
      params.push(...compatible);
    }

    if (city) {
      query += ` AND LOWER(city) = LOWER(?)`;
      params.push(city);
    }

    let donors = db.prepare(query).all(...params);

    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const maxRadius = parseFloat(radius);

      donors = donors
        .filter(d => d.lat && d.lng)
        .map(d => ({
          ...d,
          distance: Math.round(haversine(userLat, userLng, d.lat, d.lng) * 10) / 10
        }))
        .filter(d => d.distance <= maxRadius)
        .sort((a, b) => a.distance - b.distance);
    }

    res.json({ donors, total: donors.length });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle availability
router.put('/availability', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { is_available } = req.body;
    db.prepare('UPDATE users SET is_available = ? WHERE id = ?').run(is_available ? 1 : 0, req.user.id);
    res.json({ is_available: !!is_available });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get donor stats
router.get('/stats', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const donations = db.prepare('SELECT COUNT(*) as count FROM donations WHERE donor_id = ? AND status = ?').get(req.user.id, 'completed');
    const offered = db.prepare('SELECT COUNT(*) as count FROM donations WHERE donor_id = ? AND status = ?').get(req.user.id, 'offered');
    const user = db.prepare('SELECT is_available, last_donation_date FROM users WHERE id = ?').get(req.user.id);

    res.json({
      total_donations: donations ? donations.count : 0,
      pending_offers: offered ? offered.count : 0,
      is_available: user ? !!user.is_available : false,
      last_donation: user ? user.last_donation_date : null
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

function getCompatibleDonors(recipientGroup) {
  const compatibility = {
    'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    'AB-': ['A-', 'B-', 'AB-', 'O-'],
    'A+': ['A+', 'A-', 'O+', 'O-'],
    'A-': ['A-', 'O-'],
    'B+': ['B+', 'B-', 'O+', 'O-'],
    'B-': ['B-', 'O-'],
    'O+': ['O+', 'O-'],
    'O-': ['O-']
  };
  return compatibility[recipientGroup] || [recipientGroup];
}

module.exports = router;
