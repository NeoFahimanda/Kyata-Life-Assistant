const db = require('../../services/database');

function formatDateTime(date) {
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const tasksRepository = {
  /**
   * Menambahkan tugas baru dan mendaftarkan antrean notifikasi berbasis user_id
   */
  addTask: async (userId, title, category, deadline = null, status = 'pending') => {
    const finalStatus = status === 'appointed' || !deadline ? 'appointed' : status;
    const finalDeadline = finalStatus === 'appointed' ? null : deadline;

    const queryTask = `
      INSERT INTO tasks (user_id, title, category, deadline, status)
      VALUES (?, ?, ?, ?, ?)
    `;
    const stmtTask = db.prepare(queryTask);
    const infoTask = stmtTask.run(userId, title, category, finalDeadline, finalStatus);
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
          if (rem.time > now) {
            stmtReminder.run(taskId, formatDateTime(rem.time), rem.type);
          }
        });
      } catch (err) {
        console.error("⚠️ [CRON TASKS] Gagal menghitung antrean reminder:", err);
      }
    }

    return { id: taskId, title, category, deadline: finalDeadline, status: finalStatus };
  },

  /**
   * ✨ MENGEMBALIKAN FUNGSI YANG HILANG
   * Mengambil tugas aktif spesifik milik user/chat tertentu
   */
  getActiveTasks: async (userId, limit = null) => {
    let query = `
      SELECT id, title, category, deadline, status 
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
      query += ` LIMIT ?`;
      return db.prepare(query).all(userId, limit);
    }
    return db.prepare(query).all(userId);
  },

  getPendingQueue: async (currentTimeStr) => {
    const query = `
      SELECT r.id AS reminder_id, r.type, t.id AS task_id, t.title, t.category, t.deadline, t.user_id
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
      SELECT user_id, id, title, category, deadline, status,
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

  updateTaskStatus: async (id, status) => {
    const query = `UPDATE tasks SET status = ? WHERE id = ?`;
    const info = db.prepare(query).run(status, id);

    if (info.changes > 0 && status === 'done') {
      const cancelQuery = `UPDATE task_reminders SET status = 'cancelled' WHERE task_id = ? AND status = 'pending'`;
      db.prepare(cancelQuery).run(id);
    }
    return info.changes > 0;
  },

  /**
   * ✨ MENGEMBALIKAN FUNGSI YANG HILANG
   * Menghapus tugas secara permanen
   */
  deleteTask: async (id) => {
    const query = `DELETE FROM tasks WHERE id = ?`;
    const info = db.prepare(query).run(id);
    return info.changes > 0;
  },

  updateReminderStatus: async (reminderId, status) => {
    const query = `UPDATE task_reminders SET status = ? WHERE id = ?`;
    db.prepare(query).run(status, reminderId);
  }
};

module.exports = tasksRepository;