const express = require('express');
const cors = require('cors');
const path = require('path');
const initSqlJs = require('sql.js');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Database setup
const dbDir = path.join(__dirname, 'data');
const dbPath = path.join(dbDir, 'diamond.db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

let db;

function saveDatabase() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
  const result = db.exec("SELECT last_insert_rowid()");
  return { lastInsertRowid: result[0]?.values[0][0] };
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

async function initDatabase() {
  const SQL = await initSqlJs();
  
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
    console.log('Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('Created new database');
  }

  db.run(`CREATE TABLE IF NOT EXISTS stones (id INTEGER PRIMARY KEY AUTOINCREMENT, carat REAL NOT NULL, shape TEXT NOT NULL, color TEXT NOT NULL, clarity TEXT NOT NULL, cut TEXT, certification TEXT, cert_number TEXT, asking_price REAL, cost_price REAL, source TEXT, supplier_id INTEGER, status TEXT DEFAULT 'Available', notes TEXT, date_added TEXT, date_updated TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, company TEXT, type TEXT NOT NULL, email TEXT, phone TEXT, location TEXT, preferences TEXT, notes TEXT, last_contact TEXT, date_added TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS deals (id INTEGER PRIMARY KEY AUTOINCREMENT, stone_id INTEGER, buyer_id INTEGER, status TEXT DEFAULT 'Pending', asking_price REAL, offered_price REAL, final_price REAL, commission REAL, commission_percent REAL DEFAULT 3.0, notes TEXT, date_started TEXT, date_closed TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS price_log (id INTEGER PRIMARY KEY AUTOINCREMENT, shape TEXT NOT NULL, carat_min REAL NOT NULL, carat_max REAL NOT NULL, color TEXT NOT NULL, clarity TEXT NOT NULL, price_per_carat REAL NOT NULL, source TEXT, notes TEXT, date_logged TEXT)`);
  
  saveDatabase();
  console.log('Database initialized');
}

// API ROUTES

// STONES
app.get('/api/stones', (req, res) => {
  try {
    const stones = all(`SELECT s.*, c.name as supplier_name FROM stones s LEFT JOIN contacts c ON s.supplier_id = c.id ORDER BY s.id DESC`);
    res.json(stones);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stones', (req, res) => {
  try {
    const { carat, shape, color, clarity, cut, certification, cert_number, asking_price, cost_price, source, supplier_id, status, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const result = run(`INSERT INTO stones (carat, shape, color, clarity, cut, certification, cert_number, asking_price, cost_price, source, supplier_id, status, notes, date_added, date_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
      [carat, shape, color, clarity, cut, certification, cert_number, asking_price, cost_price, source, supplier_id, status || 'Available', notes, today, today]);
    res.status(201).json(get('SELECT * FROM stones WHERE id = ?', [result.lastInsertRowid]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/stones/:id', (req, res) => {
  try {
    const { carat, shape, color, clarity, cut, certification, cert_number, asking_price, cost_price, source, supplier_id, status, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];
    run(`UPDATE stones SET carat=?, shape=?, color=?, clarity=?, cut=?, certification=?, cert_number=?, asking_price=?, cost_price=?, source=?, supplier_id=?, status=?, notes=?, date_updated=? WHERE id=?`,
      [carat, shape, color, clarity, cut, certification, cert_number, asking_price, cost_price, source, supplier_id, status, notes, today, req.params.id]);
    res.json(get('SELECT * FROM stones WHERE id = ?', [req.params.id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/stones/:id', (req, res) => {
  try { run('DELETE FROM stones WHERE id = ?', [req.params.id]); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// CONTACTS
app.get('/api/contacts', (req, res) => {
  try { res.json(all('SELECT * FROM contacts ORDER BY name')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/contacts', (req, res) => {
  try {
    const { name, company, type, email, phone, location, preferences, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const result = run(`INSERT INTO contacts (name, company, type, email, phone, location, preferences, notes, last_contact, date_added) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, company, type, email, phone, location, preferences, notes, today, today]);
    res.status(201).json(get('SELECT * FROM contacts WHERE id = ?', [result.lastInsertRowid]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/contacts/:id', (req, res) => {
  try {
    const { name, company, type, email, phone, location, preferences, notes } = req.body;
    run(`UPDATE contacts SET name=?, company=?, type=?, email=?, phone=?, location=?, preferences=?, notes=? WHERE id=?`,
      [name, company, type, email, phone, location, preferences, notes, req.params.id]);
    res.json(get('SELECT * FROM contacts WHERE id = ?', [req.params.id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/contacts/:id', (req, res) => {
  try { run('DELETE FROM contacts WHERE id = ?', [req.params.id]); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// DEALS
app.get('/api/deals', (req, res) => {
  try {
    res.json(all(`SELECT d.*, s.carat, s.shape, s.color, s.clarity, c.name as buyer_name, c.company as buyer_company FROM deals d LEFT JOIN stones s ON d.stone_id = s.id LEFT JOIN contacts c ON d.buyer_id = c.id ORDER BY d.id DESC`));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/deals', (req, res) => {
  try {
    const { stone_id, buyer_id, asking_price, offered_price, commission_percent, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const result = run(`INSERT INTO deals (stone_id, buyer_id, asking_price, offered_price, commission_percent, notes, date_started) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [stone_id, buyer_id, asking_price, offered_price, commission_percent || 3.0, notes, today]);
    run('UPDATE stones SET status = "Reserved" WHERE id = ?', [stone_id]);
    res.status(201).json(get('SELECT * FROM deals WHERE id = ?', [result.lastInsertRowid]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/deals/:id', (req, res) => {
  try {
    const { status, offered_price, final_price, commission, notes } = req.body;
    const deal = get('SELECT * FROM deals WHERE id = ?', [req.params.id]);
    let dateClosed = null;
    if (status === 'Completed' || status === 'Lost') {
      dateClosed = new Date().toISOString().split('T')[0];
      run('UPDATE stones SET status = ? WHERE id = ?', [status === 'Completed' ? 'Sold' : 'Available', deal.stone_id]);
    }
    let calc_commission = commission || (final_price ? final_price * (deal.commission_percent / 100) : null);
    run(`UPDATE deals SET status=?, offered_price=?, final_price=?, commission=?, notes=?, date_closed=? WHERE id=?`,
      [status, offered_price, final_price, calc_commission, notes, dateClosed, req.params.id]);
    res.json(get('SELECT * FROM deals WHERE id = ?', [req.params.id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/deals/:id', (req, res) => {
  try {
    const deal = get('SELECT stone_id FROM deals WHERE id = ?', [req.params.id]);
    if (deal) run('UPDATE stones SET status = "Available" WHERE id = ?', [deal.stone_id]);
    run('DELETE FROM deals WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PRICES
app.get('/api/prices', (req, res) => {
  try { res.json(all('SELECT * FROM price_log ORDER BY date_logged DESC, id DESC')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/prices', (req, res) => {
  try {
    const { shape, carat_min, carat_max, color, clarity, price_per_carat, source, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const result = run(`INSERT INTO price_log (shape, carat_min, carat_max, color, clarity, price_per_carat, source, notes, date_logged) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [shape, carat_min, carat_max || carat_min, color, clarity, price_per_carat, source, notes, today]);
    res.status(201).json(get('SELECT * FROM price_log WHERE id = ?', [result.lastInsertRowid]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// STATS
app.get('/api/stats', (req, res) => {
  try {
    const stats = {};
    const inv = all(`SELECT COUNT(*) as total_stones, SUM(CASE WHEN status='Available' THEN 1 ELSE 0 END) as available, SUM(CASE WHEN status='Reserved' THEN 1 ELSE 0 END) as reserved, SUM(CASE WHEN status='Sold' THEN 1 ELSE 0 END) as sold, SUM(CASE WHEN status='Available' THEN asking_price ELSE 0 END) as available_value FROM stones`);
    stats.inventory = inv[0] || {};
    const deals = all(`SELECT COUNT(*) as total_deals, SUM(CASE WHEN status IN ('Pending','Negotiating','Agreed') THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status='Completed' THEN final_price ELSE 0 END) as completed_value, SUM(CASE WHEN status='Completed' THEN commission ELSE 0 END) as total_commission FROM deals`);
    stats.deals = deals[0] || {};
    const contacts = all(`SELECT COUNT(*) as total, SUM(CASE WHEN type='Buyer' THEN 1 ELSE 0 END) as buyers, SUM(CASE WHEN type='Supplier' THEN 1 ELSE 0 END) as suppliers FROM contacts`);
    stats.contacts = contacts[0] || {};
    stats.recent_stones = all(`SELECT * FROM stones ORDER BY id DESC LIMIT 5`);
    stats.recent_deals = all(`SELECT d.*, s.carat, s.shape, s.color, s.clarity, c.name as buyer_name FROM deals d LEFT JOIN stones s ON d.stone_id = s.id LEFT JOIN contacts c ON d.buyer_id = c.id ORDER BY d.id DESC LIMIT 5`);
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CALCULATOR
app.post('/api/calculate', (req, res) => {
  const { cost_price, carat, target_margin, commission_percent = 3 } = req.body;
  const sell_price = cost_price * (1 + target_margin / 100);
  const profit = sell_price - cost_price;
  const commission = sell_price * (commission_percent / 100);
  const net_profit = profit - commission;
  res.json({
    cost_price, cost_per_carat: Math.round(cost_price / carat),
    sell_price: Math.round(sell_price), sell_per_carat: Math.round(sell_price / carat),
    profit: Math.round(profit), commission: Math.round(commission), net_profit: Math.round(net_profit),
    margin_percent: target_margin, net_margin_percent: ((net_profit / cost_price) * 100).toFixed(1)
  });
});

// Serve static files from React build
app.use(express.static(path.join(__dirname, 'public')));

// Handle React routing - send all other requests to React
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// START
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`\n💎 Diamond Intel Running on port ${PORT}\n`);
  });
}).catch(err => { console.error('Database error:', err); process.exit(1); });
