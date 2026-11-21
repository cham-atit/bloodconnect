const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'bloodconnect.db');

let db = null;

async function initDb() {
  const SQL = await initSqlJs();

  // Load existing db or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone TEXT NOT NULL,
      role TEXT DEFAULT 'donor',
      blood_group TEXT NOT NULL,
      lat REAL,
      lng REAL,
      city TEXT,
      is_available INTEGER DEFAULT 1,
      last_donation_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL,
      blood_group TEXT NOT NULL,
      component TEXT DEFAULT 'whole_blood',
      units_needed INTEGER DEFAULT 1,
      urgency TEXT DEFAULT 'normal',
      hospital TEXT,
      hospital_address TEXT,
      lat REAL,
      lng REAL,
      city TEXT,
      contact_phone TEXT,
      notes TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (requester_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS donations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      donor_id INTEGER NOT NULL,
      status TEXT DEFAULT 'offered',
      responded_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (request_id) REFERENCES requests(id),
      FOREIGN KEY (donor_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      request_id INTEGER,
      type TEXT DEFAULT 'info',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (request_id) REFERENCES requests(id)
    )
  `);

  // Create indexes (use IF NOT EXISTS via try-catch)
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_users_blood_group ON users(blood_group)',
    'CREATE INDEX IF NOT EXISTS idx_users_available ON users(is_available)',
    'CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status)',
    'CREATE INDEX IF NOT EXISTS idx_requests_blood_group ON requests(blood_group)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_donations_request ON donations(request_id)',
    'CREATE INDEX IF NOT EXISTS idx_donations_donor ON donations(donor_id)',
  ];
  indexes.forEach(sql => { try { db.run(sql); } catch (e) {} });

  // Seed demo donors if empty
  const result = db.exec('SELECT COUNT(*) as count FROM users');
  const count = result.length > 0 ? result[0].values[0][0] : 0;

  if (count === 0) {
    const demoUsers = [
      { name: 'Aarav Sharma', email: 'aarav@demo.com', phone: '+91-9876543210', blood_group: 'O+', lat: 28.6139, lng: 77.2090, city: 'New Delhi', role: 'donor' },
      { name: 'Priya Patel', email: 'priya@demo.com', phone: '+91-9876543211', blood_group: 'A+', lat: 28.6280, lng: 77.2190, city: 'New Delhi', role: 'donor' },
      { name: 'Rahul Kumar', email: 'rahul@demo.com', phone: '+91-9876543212', blood_group: 'B+', lat: 28.5355, lng: 77.3910, city: 'Noida', role: 'both' },
      { name: 'Sneha Reddy', email: 'sneha@demo.com', phone: '+91-9876543213', blood_group: 'AB+', lat: 28.4595, lng: 77.0266, city: 'Gurgaon', role: 'donor' },
      { name: 'Vikram Singh', email: 'vikram@demo.com', phone: '+91-9876543214', blood_group: 'O-', lat: 28.6508, lng: 77.2317, city: 'New Delhi', role: 'donor' },
      { name: 'Ananya Iyer', email: 'ananya@demo.com', phone: '+91-9876543215', blood_group: 'A-', lat: 19.0760, lng: 72.8777, city: 'Mumbai', role: 'both' },
      { name: 'Karthik Nair', email: 'karthik@demo.com', phone: '+91-9876543216', blood_group: 'B-', lat: 12.9716, lng: 77.5946, city: 'Bangalore', role: 'donor' },
      { name: 'Meera Joshi', email: 'meera@demo.com', phone: '+91-9876543217', blood_group: 'AB-', lat: 28.6100, lng: 77.2300, city: 'New Delhi', role: 'donor' },
      { name: 'Rohit Kadam', email: 'rohit@demo.com', phone: '+91-9876543220', blood_group: 'A+', lat: 18.5204, lng: 73.8567, city: 'Pune', role: 'donor' },
      { name: 'Pooja Reddy', email: 'pooja@demo.com', phone: '+91-9876543221', blood_group: 'B+', lat: 17.3850, lng: 78.4867, city: 'Hyderabad', role: 'both' },
      { name: 'Vivek Krishnan', email: 'vivek@demo.com', phone: '+91-9876543222', blood_group: 'O+', lat: 13.0827, lng: 80.2707, city: 'Chennai', role: 'donor' },
      { name: 'Aditi Bannerjee', email: 'aditi@demo.com', phone: '+91-9876543223', blood_group: 'AB+', lat: 22.5726, lng: 88.3639, city: 'Kolkata', role: 'both' },
      { name: 'Ravi Patel', email: 'ravi.p@demo.com', phone: '+91-9876543224', blood_group: 'O-', lat: 23.0225, lng: 72.5714, city: 'Ahmedabad', role: 'donor' },
      { name: 'Neha Sharma', email: 'neha.s@demo.com', phone: '+91-9876543225', blood_group: 'A-', lat: 26.9124, lng: 75.7873, city: 'Jaipur', role: 'donor' },
      { name: 'Amit Desai', email: 'amit.d@demo.com', phone: '+91-9876543226', blood_group: 'B-', lat: 21.1702, lng: 72.8311, city: 'Surat', role: 'both' },
      { name: 'Sana Khan', email: 'sana.k@demo.com', phone: '+91-9876543227', blood_group: 'O+', lat: 26.8467, lng: 80.9462, city: 'Lucknow', role: 'donor' },
      { name: 'Arjun Singh', email: 'arjun.s@demo.com', phone: '+91-9876543228', blood_group: 'B+', lat: 30.7333, lng: 76.7794, city: 'Chandigarh', role: 'donor' },
      { name: 'Kavita Mishra', email: 'kavita.m@demo.com', phone: '+91-9876543229', blood_group: 'A+', lat: 22.7196, lng: 75.8577, city: 'Indore', role: 'donor' }
    ];

    const hash = bcrypt.hashSync('demo1234', 10);
    const stmt = db.prepare(
      'INSERT INTO users (name, email, password_hash, phone, blood_group, lat, lng, city, role, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    );

    for (const u of demoUsers) {
      stmt.run([u.name, u.email, hash, u.phone, u.blood_group, u.lat, u.lng, u.city, u.role]);
    }
    stmt.free();
    console.log('✅ Seeded demo donors');
    saveDb();
  }

  return db;
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// Helper: wraps sql.js to be similar to better-sqlite3 API
function getDb() {
  return {
    prepare: (sql) => ({
      run: (...params) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        db.run(sql, flatParams);
        const lastInsertRowid = getLastInsertId();
        const changes = db.getRowsModified();
        saveDb();
        return { lastInsertRowid, changes };
      },
      get: (...params) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const stmt = db.prepare(sql);
        stmt.bind(flatParams);
        if (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          stmt.free();
          const row = {};
          cols.forEach((c, i) => row[c] = vals[i]);
          return row;
        }
        stmt.free();
        return undefined;
      },
      all: (...params) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const results = [];
        const stmt = db.prepare(sql);
        stmt.bind(flatParams);
        while (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          const row = {};
          cols.forEach((c, i) => row[c] = vals[i]);
          results.push(row);
        }
        stmt.free();
        return results;
      }
    }),
    exec: (sql) => db.run(sql)
  };
}

function getLastInsertId() {
  const result = db.exec('SELECT last_insert_rowid() as id');
  return result.length > 0 ? result[0].values[0][0] : 0;
}

module.exports = { initDb, getDb, saveDb };
