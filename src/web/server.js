const express = require("express");
const crypto = require("crypto");
const path = require("path");
const tasksRepo = require("../features/tasks/repository");
const financeRepo = require("../features/finance/repository");
const accountsRepo = require("../services/accounts");
const { normalizePhoneNumber, taskUserIdFromPhone } = require("../services/identity");

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
const OTP_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const RATE_LIMIT_MS = 60 * 1000;
const otpByPhone = new Map();
const sessions = new Map();
const requestTimes = new Map();

function getSession(req) {
  const cookie = req.headers.cookie || "";
  const token = cookie.match(/(?:^|;\s*)kyata_session=([a-f0-9]+)/)?.[1];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function setSessionCookie(req, res, token) {
  const secure = req.secure || req.get("x-forwarded-proto") === "https";
  res.setHeader(
    "Set-Cookie",
    `kyata_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure ? "; Secure" : ""}`,
  );
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, message: "Login required" });
  req.user = session;
  next();
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

// Wrap async handlers so errors become JSON 500 responses
const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error("🔴 [WEB API ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  });

const bad = (res, message) =>
  res.status(400).json({ success: false, message });

function startWebServer(client) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "../../public")));

  // ---------- HEALTH ----------
  app.get("/api/health", (req, res) => res.json({ success: true, status: "ok" }));

  // ---------- AUTH ----------
  app.get("/api/auth/me", (req, res) => {
    const session = getSession(req);
    res.json({ success: true, authenticated: Boolean(session), phone: session?.phone || null });
  });

  app.post("/api/auth/request-code", wrap(async (req, res) => {
    const phone = normalizePhoneNumber(req.body.phone);
    if (!phone) return bad(res, "Enter a valid WhatsApp number");

    const now = Date.now();
    const rateKeys = [`phone:${phone}`, `ip:${req.ip}`];
    if (rateKeys.some((key) => now - (requestTimes.get(key) || 0) < RATE_LIMIT_MS)) {
      return res.status(429).json({ success: false, message: "Wait a minute before requesting another code" });
    }
    rateKeys.forEach((key) => requestTimes.set(key, now));

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const aliases = [taskUserIdFromPhone(phone)];
    try {
      const numberId = await client.getNumberId(phone);
      const numberIdSerialized = typeof numberId === "string" ? numberId : numberId?._serialized;
      if (numberIdSerialized) aliases.push(numberIdSerialized);
      try {
        const contact = await client.getContactById(numberIdSerialized || taskUserIdFromPhone(phone));
        if (contact.id?._serialized) aliases.push(contact.id._serialized);
      } catch { }
      otpByPhone.set(phone, { code, aliases: [...new Set(aliases)], expiresAt: now + OTP_TTL_MS, attempts: 0 });
      await client.sendMessage(
        taskUserIdFromPhone(phone),
        `Kode login Kyata kamu: ${code}. Kode berlaku selama 5 menit. Jangan bagikan kode ini kepada siapa pun.`,
      );
      res.json({ success: true, message: "If this number can receive WhatsApp messages, a login code was sent." });
    } catch (error) {
      otpByPhone.delete(phone);
      console.error("[WEB AUTH] Failed to deliver login code:", error.message || error);
      res.status(503).json({ success: false, message: "Could not send a code. Check the WhatsApp number and try again." });
    }
  }));

  app.post("/api/auth/verify-code", wrap(async (req, res) => {
    const phone = normalizePhoneNumber(req.body.phone);
    const code = String(req.body.code || "").trim();
    const challenge = phone && otpByPhone.get(phone);
    if (!challenge || challenge.expiresAt <= Date.now()) {
      if (phone) otpByPhone.delete(phone);
      return res.status(401).json({ success: false, message: "Code expired or not requested" });
    }
    challenge.attempts += 1;
    if (challenge.attempts > 5 || !/^\d{6}$/.test(code) || !timingSafeEqual(code, challenge.code)) {
      if (challenge.attempts >= 5) otpByPhone.delete(phone);
      return res.status(401).json({ success: false, message: "Invalid or expired code" });
    }

    otpByPhone.delete(phone);
    await tasksRepo.linkPhoneAliases(phone, challenge.aliases);
    const migratedTasks = await tasksRepo.migratePhoneOwner(phone, challenge.aliases);
    if (migratedTasks > 0) {
      console.info(`[WEB AUTH] Migrated ${migratedTasks} direct-chat task(s) for a verified account.`);
    }
    financeRepo.migratePhoneOwner(phone, challenge.aliases);
    accountsRepo.getOrCreate(phone);
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { phone, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 });
    setSessionCookie(req, res, token);
    res.json({ success: true, phone });
  }));

  app.post("/api/auth/logout", (req, res) => {
    const session = getSession(req);
    if (session) sessions.delete(session.token);
    res.setHeader("Set-Cookie", "kyata_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
    res.json({ success: true });
  });

  app.get("/api/profile", requireAuth, wrap(async (req, res) => {
    const account = accountsRepo.getOrCreate(req.user.phone);
    const finance = financeRepo.getReminderConfig(taskUserIdFromPhone(req.user.phone));
    res.json({
      success: true,
      data: {
        ...account,
        financeReminderEnabled: Boolean(finance.enabled),
        financeReminderType: finance.type,
        financeReminderDay: Number(finance.day),
        financeReminderTime: finance.time,
      },
    });
  }));

  app.put("/api/profile", requireAuth, wrap(async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name || name.length > 40) return bad(res, "Name must be between 1 and 40 characters");

    const taskReminderEnabled = req.body.taskReminderEnabled !== false;
    const taskReminderTime = req.body.taskReminderTime;
    if (!["07:00", "12:00", "19:00"].includes(taskReminderTime)) {
      return bad(res, "Choose morning, noon, or night for the task reminder");
    }

    const financeReminder = req.body.financeReminder || {};
    const financeReminderType = financeReminder.type;
    const financeReminderDay = Number(financeReminder.day);
    const financeReminderTime = financeReminder.time;
    if (!['daily', 'weekly'].includes(financeReminderType)) {
      return bad(res, "Finance reminder must be daily or weekly");
    }
    if (!Number.isInteger(financeReminderDay) || financeReminderDay < 0 || financeReminderDay > 6) {
      return bad(res, "Choose a valid weekday for the weekly finance reminder");
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(financeReminderTime || "")) {
      return bad(res, "Choose a valid finance reminder time");
    }

    const phone = req.user.phone;
    accountsRepo.updateProfile(phone, { name, taskReminderEnabled, taskReminderTime });
    financeRepo.saveReminderConfig(taskUserIdFromPhone(phone), {
      enabled: financeReminder.enabled === true,
      type: financeReminderType,
      day: financeReminderDay,
      time: financeReminderTime,
    });

    res.json({ success: true, data: accountsRepo.getProfile(phone) });
  }));

  // ---------- TASKS ----------
  app.get(
    "/api/tasks",
    requireAuth,
    wrap(async (req, res) => {
      const data = await tasksRepo.getActiveTasks(taskUserIdFromPhone(req.user.phone));
      res.json({ success: true, data });
    }),
  );

  app.post(
    "/api/tasks",
    requireAuth,
    wrap(async (req, res) => {
      const { title, category, deadline, status } = req.body;
      if (!title || !title.trim()) return bad(res, "title is required");

      let finalDeadline = deadline || null;
      if (finalDeadline && finalDeadline.length === 10) finalDeadline = `${finalDeadline} 23:59`;
      // datetime-local sends "YYYY-MM-DDTHH:MM"
      if (finalDeadline) finalDeadline = finalDeadline.replace("T", " ");

      const finalStatus = TASK_STATUSES.includes(status) ? status : "pending";
      const data = await tasksRepo.addTask(
        taskUserIdFromPhone(req.user.phone),
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
    requireAuth,
    wrap(async (req, res) => {
      const { status } = req.body;
      if (!TASK_STATUSES.includes(status)) return bad(res, "invalid status");
      const ok = await tasksRepo.updateTaskStatus(req.params.id, status, taskUserIdFromPhone(req.user.phone));
      if (!ok) return res.status(404).json({ success: false, message: "Task not found" });
      res.json({ success: true });
    }),
  );

  app.delete(
    "/api/tasks/:id",
    requireAuth,
    wrap(async (req, res) => {
      const ok = await tasksRepo.deleteTask(req.params.id, taskUserIdFromPhone(req.user.phone));
      if (!ok) return res.status(404).json({ success: false, message: "Task not found" });
      res.json({ success: true });
    }),
  );

  // ---------- FINANCE ----------
  app.get(
    "/api/finance/summary",
    requireAuth,
    wrap(async (req, res) => {
      const data = financeRepo.getSaldoInfo(req.user.phone);
      if (!data) return res.status(500).json({ success: false, message: "Failed to compute balance" });
      res.json({ success: true, data });
    }),
  );

  app.get(
    "/api/finance/transactions",
    requireAuth,
    wrap(async (req, res) => {
      const now = new Date();
      const range = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}%`;
      const data = financeRepo.getBulananRows(req.user.phone, range);
      res.json({ success: true, data });
    }),
  );

  app.post(
    "/api/finance/transactions",
    requireAuth,
    wrap(async (req, res) => {
      const { jenis, nominal, keterangan } = req.body;
      if (!FINANCE_TYPES.includes(jenis)) return bad(res, "invalid jenis");
      const amount = parseInt(nominal, 10);
      if (!Number.isFinite(amount) || amount <= 0) return bad(res, "nominal must be a positive integer");
      if (!keterangan || !keterangan.trim()) return bad(res, "keterangan is required");

      financeRepo.insertTransaction(req.user.phone, jenis, amount, keterangan.trim());
      res.status(201).json({ success: true, data: financeRepo.getSaldoInfo(req.user.phone) });
    }),
  );

  app.delete(
    "/api/finance/transactions/last",
    requireAuth,
    wrap(async (req, res) => {
      const last = financeRepo.getLastTransaction(req.user.phone);
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
