const db = require("./database");

function getOrCreate(phone) {
  db.prepare(`
    INSERT INTO accounts (phone, task_user_id)
    VALUES (?, ?)
    ON CONFLICT(phone) DO NOTHING
  `).run(phone, `${phone}@c.us`);
  return getProfile(phone);
}

function getProfile(phone) {
  return db.prepare(`
    SELECT phone, display_name AS name,
      task_reminder_enabled AS taskReminderEnabled,
      task_reminder_time AS taskReminderTime
    FROM accounts WHERE phone = ?
  `).get(phone) || null;
}

function getDisplayName(phone) {
  return getProfile(phone)?.name?.trim() || null;
}

function getPhoneForAliases(aliases = []) {
  const uniqueAliases = [...new Set(aliases.filter((alias) => typeof alias === "string" && alias))];
  if (uniqueAliases.length === 0) return null;
  const placeholders = uniqueAliases.map(() => "?").join(", ");
  const result = db.prepare(`
    SELECT phone FROM task_user_aliases WHERE alias IN (${placeholders}) LIMIT 1
  `).get(...uniqueAliases);
  return result?.phone || null;
}

function updateProfile(phone, { name, taskReminderEnabled, taskReminderTime }) {
  return db.prepare(`
    UPDATE accounts SET display_name = ?, task_reminder_enabled = ?,
      task_reminder_time = ?, updated_at = CURRENT_TIMESTAMP
    WHERE phone = ?
  `).run(name, taskReminderEnabled ? 1 : 0, taskReminderTime, phone);
}

function getTaskReminderSettings(taskUserId) {
  return db.prepare(`
    SELECT task_reminder_enabled AS enabled, task_reminder_time AS time
    FROM accounts WHERE task_user_id = ?
  `).get(taskUserId) || null;
}

module.exports = { getOrCreate, getProfile, getDisplayName, getPhoneForAliases, updateProfile, getTaskReminderSettings };