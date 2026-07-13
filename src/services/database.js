const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "../../database/kyata.db");
const db = new Database(dbPath);

// 1. Membuat tabel keuangan
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
  `
).run();

// 2. Membuat tabel tugas
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,          -- 'EEPIS', 'Organisasi', 'IOU', 'Personal'
    deadline TEXT,                   -- Bisa DATETIME, atau NULL jika statusnya 'appointed'
    status TEXT DEFAULT 'pending',   -- 'appointed', 'pending', 'in_progress', 'done'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
  `
).run();

// 3. Membuat tabel konfigurasi bot alarm finance
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS bot_config (
    chat_id TEXT PRIMARY KEY,
    remind_duid INTEGER DEFAULT 1,
    remind_type TEXT DEFAULT 'weekly', -- 'daily' atau 'weekly'
    remind_day TEXT DEFAULT '0',       -- Digunakan jika tipe 'weekly'
    remind_time TEXT DEFAULT '20:00'   -- Format HH:MM
  )
  `
).run();

// 4. Membuat tabel antrean pengingat tugas (Kyata Tasks Cron)
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS task_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    trigger_time TEXT NOT NULL, -- Format: YYYY-MM-DD HH:MM
    type TEXT NOT NULL,         -- 'h_minus_1_day', 'h_minus_1_hour', 'morning_briefing', 'at_deadline'
    status TEXT DEFAULT 'pending',
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )
  `
).run();

console.log("✅ Database SQLite Kyata berhasil diinisialisasi dengan aman!");

module.exports = db;