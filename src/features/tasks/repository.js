const db = require('../../services/database');

const tasksRepository = {
  /**
   * Menambahkan tugas baru
   */
  addTask: async (title, category, deadline = null, status = 'pending') => {
    const finalStatus = status === 'appointed' || !deadline ? 'appointed' : status;
    const finalDeadline = finalStatus === 'appointed' ? null : deadline;

    const query = `
      INSERT INTO tasks (title, category, deadline, status)
      VALUES (?, ?, ?, ?)
    `;

    const stmt = db.prepare(query);
    const info = stmt.run(title, category, finalDeadline, finalStatus);
    return { id: info.lastInsertRowid, title, category, deadline: finalDeadline, status: finalStatus };
  },

  /**
   * ✅ SEKARANG DILENGKAPI PARAMETER LIMIT & BOBOT PRIORITAS
   * Mengambil tugas aktif urut berdasarkan: IN_PROGRESS -> PENDING -> APPOINTED
   */
  getActiveTasks: async (limit = null) => {
    let query = `
      SELECT id, title, category, deadline, status 
      FROM tasks 
      WHERE status IN ('pending', 'in_progress', 'appointed')
      ORDER BY 
        CASE 
          WHEN status = 'in_progress' THEN 0
          WHEN status = 'pending' THEN 1
          WHEN status = 'appointed' THEN 2
          ELSE 3
        END ASC,
        CASE WHEN deadline IS NULL THEN 1 ELSE 0 END, -- Jaga-jaga urutan date jika ada yang null
        deadline ASC                                  -- Urutkan tanggal terdekat di sesama kelompok status
    `;

    // Jika parameter limit dikirim (khusus !task murni), potong datanya di SQLite
    if (limit) {
      query += ` LIMIT ?`;
      return db.prepare(query).all(limit);
    }

    return db.prepare(query).all();
  },

  updateTaskStatus: async (id, status) => {
    const query = `UPDATE tasks SET status = ? WHERE id = ?`;
    const info = db.prepare(query).run(status, id);
    return info.changes > 0;
  },

  deleteTask: async (id) => {
    const query = `DELETE FROM tasks WHERE id = ?`;
    const info = db.prepare(query).run(id);
    return info.changes > 0;
  },

  getTopUrgentTasks: async (limit = 3) => {
    const query = `
      SELECT title, category, deadline, status 
      FROM tasks 
      WHERE status IN ('pending', 'in_progress')
      AND deadline IS NOT NULL
      ORDER BY deadline ASC 
      LIMIT ?
    `;
    return db.prepare(query).all(limit);
  }
};

module.exports = tasksRepository;