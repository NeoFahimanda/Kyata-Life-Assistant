const db = require("./database");

function parseReminderTimes(value, fallbackTime, ownerId) {
  try {
    const times = JSON.parse(value);
    if (
      Array.isArray(times) &&
      times.length >= 1 &&
      times.length <= 5 &&
      times.every((time) => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) &&
      new Set(times).size === times.length
    ) {
      return times;
    }
  } catch (error) {
    console.error(`[ACCOUNTS] Invalid task reminder schedule for ${ownerId}:`, error);
    return [fallbackTime];
  }

  console.error(`[ACCOUNTS] Invalid task reminder schedule for ${ownerId}`);
  return [fallbackTime];
}

function getOrCreate(phone) {
  db.prepare(`
    INSERT INTO accounts (phone, task_user_id, task_reminder_times)
    VALUES (?, ?, '["07:00","13:00","19:00"]')
    ON CONFLICT(phone) DO NOTHING
  `).run(phone, `${phone}@c.us`);
  return getProfile(phone);
}

function getProfile(phone) {
  const profile = db.prepare(`
    SELECT phone, display_name AS name,
      task_reminder_enabled AS taskReminderEnabled,
      task_reminder_time AS taskReminderTime,
      task_reminder_times AS taskReminderTimesJson
    FROM accounts WHERE phone = ?
  `).get(phone) || null;
  if (!profile) return null;

  profile.taskReminderTimes = parseReminderTimes(
    profile.taskReminderTimesJson,
    profile.taskReminderTime,
    phone,
  );
  delete profile.taskReminderTimesJson;
  return profile;
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

function updateProfile(phone, { name, taskReminderEnabled, taskReminderTimes }) {
  const times = [...new Set(taskReminderTimes)].sort();
  return db.prepare(`
    UPDATE accounts SET display_name = ?, task_reminder_enabled = ?,
      task_reminder_time = ?, task_reminder_times = ?, updated_at = CURRENT_TIMESTAMP
    WHERE phone = ?
  `).run(name, taskReminderEnabled ? 1 : 0, times[0], JSON.stringify(times), phone);
}

function getTaskReminderSettings(taskUserId) {
  const preferences = db.prepare(`
    SELECT task_reminder_enabled AS enabled,
      task_reminder_time AS time,
      task_reminder_times AS timesJson
    FROM accounts WHERE task_user_id = ?
  `).get(taskUserId);
  if (!preferences) return null;

  preferences.times = parseReminderTimes(
    preferences.timesJson,
    preferences.time,
    taskUserId,
  );
  delete preferences.timesJson;
  return preferences;
}

module.exports = { getOrCreate, getProfile, getDisplayName, getPhoneForAliases, updateProfile, getTaskReminderSettings };