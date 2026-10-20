const express = require("express");
const path = require("path");
const tasksRepo = require("../features/tasks/repository");
const financeRepo = require("../features/finance/repository");

const PORT = process.env.WEB_PORT || 3000;
// 0.0.0.0 = reachable from LAN and Tailscale (not just localhost)
const HOST = process.env.WEB_HOST || "0.0.0.0";

const TASK_STATUSES = ["appointed", "pending", "in_progress", "done"];
const FINANCE_TYPES = [
  "Pemasukan",
  "Pengeluaran",
  "Hutang",
  "Piutang",
  "Bayar Hutang",
  "Tagih Piutang",
];

// Wrap async handlers so errors become JSON 500 responses
const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error("🔴 [WEB API ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  });

const bad = (res, message) =>
  res.status(400).json({ success: false, message });

function startWebServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "../../public")));

  // ---------- HEALTH ----------
  app.get("/api/health", (req, res) => res.json({ success: true, status: "ok" }));

  // ---------- TASKS ----------
  app.get(
    "/api/tasks",
    wrap(async (req, res) => {
      const { userId } = req.query;
      if (!userId) return bad(res, "userId is required");
      const data = await tasksRepo.getActiveTasks(userId);
      res.json({ success: true, data });
    }),
  );

  app.post(
    "/api/tasks",
    wrap(async (req, res) => {
      const { userId, title, category, deadline, status } = req.body;
      if (!userId || !title || !title.trim()) return bad(res, "userId and title are required");

      let finalDeadline = deadline || null;
      if (finalDeadline && finalDeadline.length === 10) finalDeadline = `${finalDeadline} 23:59`;
      // datetime-local sends "YYYY-MM-DDTHH:MM"
      if (finalDeadline) finalDeadline = finalDeadline.replace("T", " ");

      const finalStatus = TASK_STATUSES.includes(status) ? status : "pending";
      const data = await tasksRepo.addTask(
        userId,
        title.trim(),
        (category || "Personal").trim(),
        finalDeadline,
        finalStatus,
      );
      res.status(201).json({ success: true, data });
    }),
  );

  app.patch(
    "/api/tasks/:id",
    wrap(async (req, res) => {
      const { status } = req.body;
      if (!TASK_STATUSES.includes(status)) return bad(res, "invalid status");
      const ok = await tasksRepo.updateTaskStatus(req.params.id, status);
      if (!ok) return res.status(404).json({ success: false, message: "Task not found" });
      res.json({ success: true });
    }),
  );

  app.delete(
    "/api/tasks/:id",
    wrap(async (req, res) => {
      const ok = await tasksRepo.deleteTask(req.params.id);
      if (!ok) return res.status(404).json({ success: false, message: "Task not found" });
      res.json({ success: true });
    }),
  );

  // ---------- FINANCE ----------
  app.get(
    "/api/finance/summary",
    wrap(async (req, res) => {
      const { phone } = req.query;
      if (!phone) return bad(res, "phone is required");
      const data = financeRepo.getSaldoInfo(phone);
      if (!data) return res.status(500).json({ success: false, message: "Failed to compute balance" });
      res.json({ success: true, data });
    }),
  );

  app.get(
    "/api/finance/transactions",
    wrap(async (req, res) => {
      const { phone } = req.query;
      if (!phone) return bad(res, "phone is required");
      const now = new Date();
      const range = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}%`;
      const data = financeRepo.getBulananRows(phone, range);
      res.json({ success: true, data });
    }),
  );

  app.post(
    "/api/finance/transactions",
    wrap(async (req, res) => {
      const { phone, jenis, nominal, keterangan } = req.body;
      if (!phone) return bad(res, "phone is required");
      if (!FINANCE_TYPES.includes(jenis)) return bad(res, "invalid jenis");
      const amount = parseInt(nominal, 10);
      if (!Number.isFinite(amount) || amount <= 0) return bad(res, "nominal must be a positive integer");
      if (!keterangan || !keterangan.trim()) return bad(res, "keterangan is required");

      financeRepo.insertTransaction(phone, jenis, amount, keterangan.trim());
      res.status(201).json({ success: true, data: financeRepo.getSaldoInfo(phone) });
    }),
  );

  app.delete(
    "/api/finance/transactions/last",
    wrap(async (req, res) => {
      const { phone } = req.query;
      if (!phone) return bad(res, "phone is required");
      const last = financeRepo.getLastTransaction(phone);
      if (!last) return res.status(404).json({ success: false, message: "No transaction to undo" });
      financeRepo.deleteTransaction(last.id);
      res.json({ success: true, data: last });
    }),
  );

  app.listen(PORT, HOST, () => {
    console.log(`🌐 [WEB] Kyata Web App listening on http://${HOST}:${PORT}`);
  });

  return app;
}

module.exports = { startWebServer };
