const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../database/kyata.db');
const db = new Database(dbPath);

// Membuat tabel keuangan dengan kolom user_id agar multi-user aman jaya
db.prepare(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    tanggal TEXT DEFAULT (datetime('now', 'localtime')),
    jenis TEXT,
    nominal INTEGER,
    keterangan TEXT
  )
`).run();

// Membuat tabel tugas
db.prepare(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    judul_tugas TEXT,
    waktu_reminder TEXT,
    status TEXT DEFAULT 'Pending',
    tipe TEXT DEFAULT 'One-time'
  )
`).run();

console.log('✅ Database SQLite Kyata berhasil diinisialisasi!');

module.exports = db;