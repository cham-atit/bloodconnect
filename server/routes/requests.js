const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../auth');
const { notifyMatchingDonors, sendToUser } = require('./notifications');

const router = express.Router();

// Create a blood/plasma request
router.post('/', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { blood_group, component, units_needed, urgency, hospital, hospital_address, lat, lng, city, contact_phone, notes } = req.body;

    if (!blood_group) {
      return res.status(400).json({ error: 'Blood group is required' });
    }

    const result = db.prepare(
      'INSERT INTO requests (requester_id, blood_group, component, units_needed, urgency, hospital, hospital_address, lat, lng, city, contact_phone, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      req.user.id,
      blood_group,
      component || 'whole_blood',
      units_needed || 1,
      urgency || 'normal',
      hospital || null,
      hospital_address || null,
      lat || null,
      lng || null,
      city || null,
      contact_phone || null,
      notes || null
    );

    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(result.lastInsertRowid);

    // Notify matching donors
    notifyMatchingDonors(request);

    res.status(201).json({ request });
  } catch (err) {
    console.error('Create request error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all active requests
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { status = 'active', blood_group, city } = req.query;
    let query = `SELECT r.*, u.name as requester_name, u.phone as requester_phone
                 FROM requests r JOIN users u ON r.requester_id = u.id WHERE 1=1`;
    const params = [];

    if (status) {
      query += ' AND r.status = ?';
      params.push(status);
    }
    if (blood_group) {
      query += ' AND r.blood_group = ?';
      params.push(blood_group);
    }
    if (city) {
      query += ' AND LOWER(r.city) = LOWER(?)';
      params.push(city);
    }

    query += ` ORDER BY CASE r.urgency WHEN 'critical' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, r.created_at DESC`;

    const requests = db.prepare(query).all(...params);
    res.json({ requests });
  } catch (err) {
    console.error('Get requests error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single request with responses
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const request = db.prepare(
      'SELECT r.*, u.name as requester_name, u.phone as requester_phone FROM requests r JOIN users u ON r.requester_id = u.id WHERE r.id = ?'
    ).get(req.params.id);

    if (!request) return res.status(404).json({ error: 'Request not found' });

    const responses = db.prepare(
      'SELECT d.*, u.name as donor_name, u.phone as donor_phone, u.blood_group as donor_blood_group, u.city as donor_city FROM donations d JOIN users u ON d.donor_id = u.id WHERE d.request_id = ? ORDER BY d.responded_at DESC'
    ).all(req.params.id);

    res.json({ request, responses });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Respond to a request
router.post('/:id/respond', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'active') return res.status(400).json({ error: 'Request is no longer active' });

    const existing = db.prepare('SELECT id FROM donations WHERE request_id = ? AND donor_id = ?').get(req.params.id, req.user.id);
    if (existing) return res.status(409).json({ error: 'You have already responded to this request' });

    const result = db.prepare(
      "INSERT INTO donations (request_id, donor_id, status) VALUES (?, ?, 'offered')"
    ).run(req.params.id, req.user.id);

    // Notify the requester
    const donor = db.prepare('SELECT name, blood_group, city FROM users WHERE id = ?').get(req.user.id);
    db.prepare(
      'INSERT INTO notifications (user_id, request_id, type, title, message) VALUES (?, ?, ?, ?, ?)'
    ).run(
      request.requester_id,
      request.id,
      'response',
      '🩸 Donor Found!',
      `${donor.name} (${donor.blood_group}) from ${donor.city || 'nearby'} has offered to donate for your ${request.blood_group} request.`
    );

    sendToUser(request.requester_id, {
      type: 'response',
      title: '🩸 Donor Found!',
      message: `${donor.name} (${donor.blood_group}) has offered to donate!`,
      request_id: request.id
    });

    res.status(201).json({ donation_id: result.lastInsertRowid, message: 'Response recorded successfully' });
  } catch (err) {
    console.error('Respond error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update request status
router.put('/:id/status', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.requester_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    const { status } = req.body;
    if (!['active', 'fulfilled', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    db.prepare('UPDATE requests SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ message: 'Status updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a request
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.requester_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    // First delete associated donations/responses
    db.prepare('DELETE FROM donations WHERE request_id = ?').run(req.params.id);
    // Delete associated notifications
    db.prepare('DELETE FROM notifications WHERE request_id = ?').run(req.params.id);
    // Delete the request
    db.prepare('DELETE FROM requests WHERE id = ?').run(req.params.id);
    
    res.json({ message: 'Request deleted successfully' });
  } catch (err) {
    console.error('Delete request error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// Get my requests
router.get('/my/list', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const requests = db.prepare(
      'SELECT r.*, (SELECT COUNT(*) FROM donations WHERE request_id = r.id) as response_count FROM requests r WHERE r.requester_id = ? ORDER BY r.created_at DESC'
    ).all(req.user.id);
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get my donations (as donor)
router.get('/my/donations', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const donations = db.prepare(
      `SELECT d.*, r.blood_group, r.component, r.urgency, r.hospital, r.city, r.status as request_status,
             u.name as requester_name
      FROM donations d 
      JOIN requests r ON d.request_id = r.id
      JOIN users u ON r.requester_id = u.id
      WHERE d.donor_id = ?
      ORDER BY d.responded_at DESC`
    ).all(req.user.id);
    res.json({ donations });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
