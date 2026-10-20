const db = require('../../services/database');

function formatDateTime(date) {
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeTaskStatus(status) {
  const text = String(status || 'pending').trim().toLowerCase();
  if (text === 'progress') return 'in_progress';
  if (['pending', 'in_progress', 'appointed', 'done'].includes(text)) return text;
  return 'pending';
}

const tasksRepository = {
  /**
   * Menambahkan tugas baru dan mendaftarkan antrean notifikasi berbasis user_id
   */
  addTask: async (userId, title, category, deadline = null, status = 'pending', creatorId = null, creatorName = null) => {
    const finalStatus = normalizeTaskStatus(status);
    const finalDeadline = deadline && String(deadline).trim() ? String(deadline).trim() : null;
    const safeTitle = String(title || '').trim();
    const safeCategory = String(category || 'Personal').trim() || 'Personal';

    const queryTask = `
      INSERT INTO tasks (user_id, title, category, deadline, status, creator_id, creator_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const stmtTask = db.prepare(queryTask);
    const infoTask = stmtTask.run(userId, safeTitle, safeCategory, finalDeadline, finalStatus, creatorId, creatorName);
    const taskId = infoTask.lastInsertRowid;

    if (finalDeadline) {
      try {
        const deadlineDate = new Date(finalDeadline.replace(' ', 'T') + ':00');
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));

        const remindersToSchedule = [
          {
            time: new Date(deadlineDate.getTime() - 24 * 60 * 60 * 1000),
            type: 'h_minus_1_day'
          },
          {
            time: new Date(deadlineDate.getTime() - 60 * 60 * 1000),
            type: 'h_minus_1_hour'
          },
          {
            time: (() => {
              const b = new Date(deadlineDate);
              b.setHours(7, 0, 0, 0);
              return b;
            })(),
            type: 'morning_briefing'
          },
          {
            time: deadlineDate,
            type: 'at_deadline'
          }
        ];

        const queryReminder = `
          INSERT INTO task_reminders (task_id, trigger_time, type, status)
          VALUES (?, ?, ?, 'pending')
        `;
        const stmtReminder = db.prepare(queryReminder);

        remindersToSchedule.forEach((rem) => {
          if (rem.time >= now) {
            stmtReminder.run(taskId, formatDateTime(rem.time), rem.type);
          }
        });
      } catch (err) {
        console.error("⚠️ [CRON TASKS] Gagal menghitung antrean reminder:", err);
      }
    }

    return { id: taskId, title: safeTitle, category: safeCategory, deadline: finalDeadline, status: finalStatus, creatorId, creatorName };
  },

  getTaskById: async (id, userId = null) => {
    const query = userId
      ? `SELECT id, title, category, deadline, status, creator_name FROM tasks WHERE id = ? AND user_id = ?`
      : `SELECT id, title, category, deadline, status, creator_name FROM tasks WHERE id = ?`;
    const params = userId ? [id, userId] : [id];
    return db.prepare(query).get(...params);
  },

  migrateUserId: async (oldUserId, newUserId) => {
    if (!oldUserId || !newUserId || oldUserId === newUserId) return;
    db.prepare('UPDATE tasks SET user_id = ? WHERE user_id = ?').run(newUserId, oldUserId);
  },

  linkPhoneAliases: async (phone, aliases = []) => {
    const uniqueAliases = [...new Set(aliases.filter((alias) => typeof alias === 'string' && alias))];
    const linkAlias = db.prepare(`
      INSERT INTO task_user_aliases (alias, phone) VALUES (?, ?)
      ON CONFLICT(alias) DO UPDATE SET phone = excluded.phone
    `);
    for (const alias of uniqueAliases) linkAlias.run(alias, phone);
  },

  getPhoneForAliases: async (aliases = []) => {
    const uniqueAliases = [...new Set(aliases.filter((alias) => typeof alias === 'string' && alias))];
    if (uniqueAliases.length === 0) return null;
    const placeholders = uniqueAliases.map(() => '?').join(', ');
    const result = db.prepare(`
      SELECT phone FROM task_user_aliases WHERE alias IN (${placeholders}) LIMIT 1
    `).get(...uniqueAliases);
    return result?.phone || null;
  },

  migratePhoneOwner: async (phone, aliases = []) => {
    const canonicalUserId = `${phone}@c.us`;
    const legacyPhones = [phone];
    if (phone.startsWith('62')) legacyPhones.push(`0${phone.slice(2)}`);

    const migrate = db.prepare('UPDATE tasks SET user_id = ? WHERE user_id = ?');
    let migrated = 0;
    for (const legacyPhone of legacyPhones) {
      for (const legacyUserId of [legacyPhone, `${legacyPhone}@c.us`]) {
        if (legacyUserId !== canonicalUserId) migrated += migrate.run(canonicalUserId, legacyUserId).changes;
      }
    }

    const migrateAlias = db.prepare(`
      UPDATE tasks SET user_id = ?
      WHERE user_id = ? AND user_id NOT LIKE '%@g.us'
    `);
    for (const alias of new Set(aliases)) {
      if (alias && alias !== canonicalUserId) {
        migrated += migrateAlias.run(canonicalUserId, alias).changes;
      }
    }
    return migrated;
  },

  getTasksByFilter: async (userId, filters = {}) => {
    const conditions = ['user_id = ?'];
    const params = [userId];

    if (filters.category) {
      conditions.push('LOWER(category) = LOWER(?)');
      params.push(String(filters.category).trim());
    }

    if (filters.status) {
      conditions.push('LOWER(status) = LOWER(?)');
      params.push(normalizeTaskStatus(filters.status));
    }

    const query = `
      SELECT id, title, category, deadline, status, creator_name
      FROM tasks
      WHERE ${conditions.join(' AND ')}
      ORDER BY 
        CASE 
          WHEN status = 'in_progress' THEN 0
          WHEN status = 'pending' THEN 1
          WHEN status = 'appointed' THEN 2
          WHEN status = 'done' THEN 3
          ELSE 4
        END ASC,
        CASE WHEN deadline IS NULL THEN 1 ELSE 0 END,
        deadline ASC
    `;

    return db.prepare(query).all(...params);
  },

  /**
   * Mengambil tugas aktif spesifik milik user/chat tertentu
   */
  getActiveTasks: async (userId, limit = null) => {
    const query = `
      SELECT id, title, category, deadline, status, creator_name
      FROM tasks 
      WHERE user_id = ? AND status IN ('pending', 'in_progress', 'appointed')
      ORDER BY 
        CASE 
          WHEN status = 'in_progress' THEN 0
          WHEN status = 'pending' THEN 1
          WHEN status = 'appointed' THEN 2
          ELSE 3
        END ASC,
        CASE WHEN deadline IS NULL THEN 1 ELSE 0 END,
        deadline ASC
    `;

    if (limit) {
      return db.prepare(`${query} LIMIT ?`).all(userId, limit);
    }
    return db.prepare(query).all(userId);
  },

  getPendingQueue: async (currentTimeStr) => {
    const query = `
            SELECT r.id AS reminder_id, r.type, t.id AS task_id, t.title, t.category, t.deadline,
              t.user_id, t.creator_id, t.creator_name
      FROM task_reminders r
      JOIN tasks t ON r.task_id = t.id
      WHERE r.status = 'pending' AND r.trigger_time <= ?
    `;
    return db.prepare(query).all(currentTimeStr);
  },

  /**
   * Mengambil semua tugas aktif dan overdue untuk broadcast rangkuman proaktif
   */
  getAllUnfinishedTasksGrouped: async () => {
    const query = `
      SELECT user_id, id, title, category, deadline, status, creator_id, creator_name,
             CASE WHEN deadline < datetime('now', 'localtime') AND deadline IS NOT NULL THEN 1 ELSE 0 END as is_overdue
      FROM tasks
      WHERE status IN ('pending', 'in_progress')
      ORDER BY user_id, is_overdue DESC, deadline ASC
    `;
    const rows = db.prepare(query).all();

    return rows.reduce((groups, task) => {
      if (!groups[task.user_id]) {
        groups[task.user_id] = [];
      }
      groups[task.user_id].push(task);
      return groups;
    }, {});
  },

  updateTaskStatus: async (id, status, userId) => {
    const nextStatus = normalizeTaskStatus(status);
    const query = `UPDATE tasks SET status = ? WHERE id = ? AND user_id = ?`;
    const info = db.prepare(query).run(nextStatus, id, userId);

    if (info.changes > 0 && nextStatus === 'done') {
      const cancelQuery = `UPDATE task_reminders SET status = 'cancelled' WHERE task_id = ? AND status = 'pending'`;
      db.prepare(cancelQuery).run(id);
    }
    return info.changes > 0;
  },

  updateTaskField: async (id, field, value, userId = null) => {
    const allowedFields = ['title', 'category', 'deadline', 'status'];
    const normalizedField = String(field || '').trim().toLowerCase();
    if (!allowedFields.includes(normalizedField)) return false;

    let normalizedValue = value;
    if (normalizedField === 'status') {
      normalizedValue = normalizeTaskStatus(value);
    } else if (normalizedField === 'deadline') {
      normalizedValue = value === null || value === undefined || String(value).trim() === '' ? null : String(value).trim();
    } else {
      normalizedValue = String(value || '').trim();
      if (!normalizedValue) return false;
    }

    const query = userId
      ? `UPDATE tasks SET ${normalizedField} = ? WHERE id = ? AND user_id = ?`
      : `UPDATE tasks SET ${normalizedField} = ? WHERE id = ?`;
    const params = userId ? [normalizedValue, id, userId] : [normalizedValue, id];
    const info = db.prepare(query).run(...params);

    if (info.changes > 0 && normalizedField === 'status' && normalizedValue === 'done') {
      db.prepare(`UPDATE task_reminders SET status = 'cancelled' WHERE task_id = ? AND status = 'pending'`).run(id);
    }

    return info.changes > 0;
  },

  /**
   * Menghapus tugas secara permanen beserta antrean pengingatnya
   */
  deleteTask: async (id, userId) => {
    const deleteOwnedTask = db.transaction(() => {
      const task = db.prepare(`SELECT id FROM tasks WHERE id = ? AND user_id = ?`).get(id, userId);
      if (!task) return false;

      db.prepare(`DELETE FROM task_reminders WHERE task_id = ?`).run(id);
      const query = `DELETE FROM tasks WHERE id = ? AND user_id = ?`;
      const info = db.prepare(query).run(id, userId);
      return info.changes > 0;
    });

    return deleteOwnedTask();
  },

  updateReminderStatus: async (reminderId, status) => {
    const query = `UPDATE task_reminders SET status = ? WHERE id = ?`;
    db.prepare(query).run(status, reminderId);
  }
};

module.exports = tasksRepository;