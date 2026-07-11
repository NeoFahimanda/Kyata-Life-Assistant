const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "../../database/kyata.db");
const db = new Database(dbPath);

// Membuat tabel keuangan dengan kolom user_id agar multi-user aman jaya
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    tanggal TEXT DEFAULT (datetime('now', 'localtime')),
    jenis TEXT,
    nominal INTEGER,
    keterangan TEXT
  )
`,
).run();

// Membuat tabel tugas
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,          -- 'EEPIS', 'Organisasi', 'IOU', 'Personal'
    deadline TEXT,                   -- Bisa DATETIME, atau NULL jika statusnya 'appointed'
    status TEXT DEFAULT 'pending',   -- 'appointed', 'pending', 'in_progress', 'done'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`,
).run();

// Tambahkan ini di src/services/database.js setelah tabel tasks

db.prepare(
  `
CREATE TABLE IF NOT EXISTS bot_config (
    chat_id TEXT PRIMARY KEY,
    remind_duid INTEGER DEFAULT 1,
    remind_type TEXT DEFAULT 'weekly', -- 'daily' atau 'weekly'
    remind_day TEXT DEFAULT '0',       -- Digunakan jika tipe 'weekly'
    remind_time TEXT DEFAULT '20:00'   -- Format HH:MM
)
`,
).run();

console.log("✅ Database SQLite Kyata berhasil diinisialisasi!");

module.exports = db;
