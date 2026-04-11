require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');

async function startServer() {
  // Initialize database
  await initDb();

  const app = express();
  const PORT = process.env.PORT || 3000;

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // API Routes
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/donors', require('./routes/donors'));
  app.use('/api/requests', require('./routes/requests'));
  app.use('/api/notifications', require('./routes/notifications'));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`\n🩸 BloodConnect Server running at http://localhost:${PORT}\n`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
