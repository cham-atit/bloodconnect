const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

// SSE connections store
const sseClients = new Map();

// Send SSE to a specific user
function sendToUser(userId, data) {
  const clients = sseClients.get(userId);
  if (clients) {
    clients.forEach(res => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  }
}

// Notify matching donors when a new request is created
function notifyMatchingDonors(request) {
  const db = getDb();
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

  const compatibleGroups = compatibility[request.blood_group] || [request.blood_group];
  const placeholders = compatibleGroups.map(() => '?').join(',');

  const donors = db.prepare(`
    SELECT id, name FROM users 
    WHERE is_available = 1 
    AND (role = 'donor' OR role = 'both')
    AND blood_group IN (${placeholders})
    AND id != ?
  `).all(...compatibleGroups, request.requester_id);

  const urgencyEmoji = request.urgency === 'critical' ? '🚨' : request.urgency === 'urgent' ? '⚠️' : 'ℹ️';
  const componentLabel = {
    'whole_blood': 'Blood',
    'plasma': 'Plasma',
    'platelets': 'Platelets',
    'rbc': 'Red Blood Cells'
  }[request.component] || 'Blood';

  for (const donor of donors) {
    const title = `${urgencyEmoji} ${request.urgency.toUpperCase()} ${componentLabel} Request`;
    const message = `${request.blood_group} ${componentLabel} needed${request.hospital ? ' at ' + request.hospital : ''}${request.city ? ' in ' + request.city : ''}. ${request.units_needed} unit(s) required.`;

    db.prepare(
      'INSERT INTO notifications (user_id, request_id, type, title, message) VALUES (?, ?, ?, ?, ?)'
    ).run(donor.id, request.id, request.urgency === 'critical' ? 'emergency' : 'match', title, message);

    sendToUser(donor.id, {
      type: request.urgency === 'critical' ? 'emergency' : 'match',
      title,
      message,
      request_id: request.id
    });
  }

  return donors.length;
}

// SSE stream endpoint
router.get('/stream', (req, res) => {
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'bloodconnect_super_secret_key_2024';
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to notifications' })}\n\n`);

  const userId = req.user.id;
  if (!sseClients.has(userId)) {
    sseClients.set(userId, new Set());
  }
  sseClients.get(userId).add(res);

  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    const clients = sseClients.get(userId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) sseClients.delete(userId);
    }
  });
});

// Get all notifications
router.get('/', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const notifications = db.prepare(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(req.user.id);

    const unread = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id);

    res.json({ notifications, unread_count: unread ? unread.count : 0 });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark notification as read
router.put('/:id/read', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark all as read
router.put('/read-all', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
module.exports.notifyMatchingDonors = notifyMatchingDonors;
module.exports.sendToUser = sendToUser;
