const tasksRepo = require("./repository");

function formatTaskDeadline(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseTaskDeadline(value, now = new Date()) {
  if (!value) return null;

  const input = value.trim().toLowerCase();
  const relativeMatch = input.match(/^(today|hari ini|(?:pagi|siang|sore|malam|malem) ini|besok\s+lusa|besok|lusa)(?:\s+(.*))?$/);

  if (relativeMatch) {
    const [, dayPhrase, timePhrase = ""] = relativeMatch;
    const deadline = new Date(now);
    const todayPeriodMatch = dayPhrase.match(/^(pagi|siang|sore|malam|malem) ini$/);
    const isToday = dayPhrase === "today" || dayPhrase === "hari ini" || Boolean(todayPeriodMatch);
    const hourByPeriod = {
      pagi: 7,
      siang: 12,
      sore: 16,
      malam: 19,
      malem: 19,
    };
    const parsedTimePhrase = todayPeriodMatch ? todayPeriodMatch[1] : timePhrase;
    const periodHour = hourByPeriod[parsedTimePhrase];
    const timeMatch = parsedTimePhrase.match(/^(\d{1,2}):(\d{2})$/);

    if (!parsedTimePhrase) {
      if (isToday) {
        deadline.setHours(23, 59, 0, 0);
      } else {
        deadline.setSeconds(0, 0);
        deadline.setTime(deadline.getTime() + (dayPhrase === "besok" ? 24 : 48) * 60 * 60 * 1000);
      }
    } else {
      if (periodHour === undefined && !timeMatch) {
        throw new Error("Waktu deadline tidak dikenali");
      }

      const hour = periodHour ?? Number(timeMatch[1]);
      const minute = periodHour === undefined ? Number(timeMatch[2]) : 0;
      if (hour > 23 || minute > 59) {
        throw new Error("Waktu deadline tidak valid");
      }

      if (!isToday) deadline.setDate(deadline.getDate() + (dayPhrase === "besok" ? 1 : 2));
      deadline.setHours(hour, minute, 0, 0);
    }

    return formatTaskDeadline(deadline);
  }

  const dateMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!dateMatch) {
    throw new Error("Format deadline tidak dikenali");
  }

  const [, yearText, monthText, dayText, hourText = "23", minuteText = "59"] = dateMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const deadline = new Date(year, month - 1, day, hour, minute);

  if (
    deadline.getFullYear() !== year ||
    deadline.getMonth() !== month - 1 ||
    deadline.getDate() !== day ||
    hour > 23 ||
    minute > 59
  ) {
    throw new Error("Tanggal atau waktu deadline tidak valid");
  }

  return formatTaskDeadline(deadline);
}

function looksLikeDeadline(value) {
  if (!value) return false;
  const text = value.trim().toLowerCase();
  if (["today", "hari ini", "besok", "lusa", "besok lusa", "sore ini", "pagi ini", "siang ini", "malam ini", "malem ini"].includes(text)) return true;
  if (/^(pagi|siang|sore|malam|malem)\s+ini/.test(text)) return true;
  if (/^(besok|lusa|today|hari ini)\s+/.test(text)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return true;
  if (/^\d{1,2}:\d{2}$/.test(text)) return true;
  return false;
}

function parseTaskAddArguments(argString) {
  const trimmed = (argString || "").trim();
  if (!trimmed) {
    return { title: "", deadlineInput: null, category: "Personal", requestedStatus: "pending" };
  }

  const splitValues = trimmed.split(/\s*\|\s*|\s*\.\s*/).map((value) => value.trim()).filter(Boolean);
  if (splitValues.length === 0) {
    return { title: "", deadlineInput: null, category: "Personal", requestedStatus: "pending" };
  }

  if (splitValues.length === 1) {
    return { title: splitValues[0], deadlineInput: null, category: "Personal", requestedStatus: "pending" };
  }

  const [title, ...rest] = splitValues;
  let deadlineInput = null;
  let category = "Personal";
  let requestedStatus = "pending";

  rest.forEach((value) => {
    if (!deadlineInput && looksLikeDeadline(value)) {
      deadlineInput = value;
      return;
    }

    if (category === "Personal") {
      category = value;
      return;
    }

    if (requestedStatus === "pending") {
      requestedStatus = value.toLowerCase();
    }
  });

  return { title, deadlineInput, category, requestedStatus };
}

function normalizeTaskEditField(field) {
  const lower = String(field || "").trim().toLowerCase();
  const map = {
    nama: "title",
    judul: "title",
    title: "title",
    kategori: "category",
    category: "category",
    deadline: "deadline",
    tanggal: "deadline",
    status: "status",
    progress: "status",
    done: "status",
  };
  return map[lower] || null;
}

function parseTaskEditPayload(textRaw) {
  const payload = textRaw.replace(/^(!task|@task)\s+edit\s+/i, "").trim();
  if (!payload) return null;

  const match = payload.match(/^([a-zA-Z]+)\s+(\d+)\s*(?:\.|\|)\s*(.+)$/);
  if (!match) return null;

  const [, rawField, taskId, rawValue] = match;
  const field = normalizeTaskEditField(rawField);
  if (!field) return null;

  return { field, taskId, value: rawValue.trim() };
}

async function handleTasks(msg) {
  const textRaw = msg.body.trim();
  const parts = textRaw.split(/\s+/);
  const command = parts[0].toLowerCase();

  if (command !== "@task" && command !== "!task") return false;

  const subCommand = parts[1] ? parts[1].toLowerCase() : "quick";
  const userId = msg.from;

  try {
    const kontak = await msg.getContact();
    let namaUser = kontak.pushname || kontak.name || kontak.number || "Pengguna";
    namaUser = namaUser.replace(/[/\\?*:[\]]/g, "").trim();
    const creatorId = msg.author || kontak.id?._serialized || null;

    switch (subCommand) {
      case "add": {
        const argString = textRaw.replace(/^(!task|@task)\s+add\s+/i, "").trim();
        if (!argString) {
          msg.reply(`❌ *Format Salah, ${namaUser}!*\n\nFormat:\n\`!task add [Judul]. [Deadline]. [Kategori]. [Status]\`\n\nDeadline opsional, jadi kamu juga bisa pakai:\n\`!task add Buat Gambar\``);
          return true;
        }

        const { title, deadlineInput, category, requestedStatus } = parseTaskAddArguments(argString);

        if (!title) {
          msg.reply(`❌ *Judul tugas tidak boleh kosong ya, ${namaUser}!*`);
          return true;
        }

        const status = requestedStatus === "status" ? "pending" : requestedStatus;
        if (!["pending", "progress", "in_progress", "appointed", "done"].includes(status)) {
          msg.reply("❌ Status harus pending, progress, appointed, atau done.");
          return true;
        }

        let deadline = null;
        if (deadlineInput) {
          try {
            deadline = parseTaskDeadline(deadlineInput);
          } catch (error) {
            msg.reply(`❌ Deadline tidak dikenali. Gunakan tanggal YYYY-MM-DD atau contoh: \`hari ini 17:00\`, \`sore ini\`, \`besok 17:00\`, \`besok pagi\`.`);
            return true;
          }
        }

        const newTask = await tasksRepo.addTask(userId, title, category, deadline, status, creatorId, namaUser);

        let replyMsg = `✅ *Tugas Berhasil Dicatat, ${namaUser}!*\n\n`;
        replyMsg += `[${newTask.id}]\n`;
        replyMsg += `📌 ${newTask.title}\n`;
        replyMsg += `🗂️ _${newTask.category}_\n`;
        replyMsg += `⏳ Deadline: ${newTask.deadline || "Tidak ditentukan"}\n`;
        replyMsg += `🚦 Status: ${newTask.status.toUpperCase()}`;

        msg.reply(replyMsg);
        return true;
      }

      case "edit": {
        const payload = parseTaskEditPayload(textRaw);
        if (!payload) {
          msg.reply(`❌ Format edit salah, ${namaUser}. Contoh:\n\`!task edit nama 5. Judul baru\`\n\`!task edit kategori 5. Design\`\n\`!task edit deadline 5. besok 17:00\``);
          return true;
        }

        const { field, taskId, value } = payload;
        if (!taskId) {
          msg.reply(`❌ Mohon masukkan ID tugasnya. Contoh: \`!task edit nama 5. Judul baru\``);
          return true;
        }

        if (!value) {
          msg.reply(`❌ Nilai baru tidak boleh kosong, ${namaUser}.`);
          return true;
        }

        let updateValue = value;
        if (field === "status") {
          const normalizedStatus = value.toLowerCase();
          if (!["pending", "progress", "in_progress", "appointed", "done"].includes(normalizedStatus)) {
            msg.reply("❌ Status harus pending, progress, appointed, atau done.");
            return true;
          }
          updateValue = normalizedStatus;
        }

        if (field === "deadline") {
          try {
            updateValue = parseTaskDeadline(value);
          } catch (error) {
            msg.reply(`❌ Deadline tidak dikenali. Gunakan format seperti: \`hari ini 17:00\`, \`besok 17:00\`, atau \`2026-10-20 12:00\`.`);
            return true;
          }
        }

        const isUpdated = await tasksRepo.updateTaskField(taskId, field, updateValue, userId);
        if (isUpdated) {
          const fieldLabel = field === "title" ? "nama" : field === "category" ? "kategori" : field;
          msg.reply(`✅ *Data tugas berhasil diubah.*\n\n[ID: ${taskId}]\nField: ${fieldLabel.toUpperCase()}\nBaru: *${updateValue}*`);
        } else {
          msg.reply(`❌ Tugas dengan ID *#${taskId}* tidak ditemukan atau data tidak valid.`);
        }
        return true;
      }

      case "quick":
      case "list": {
        const isQuickMode = subCommand === "quick";
        const filterValue = parts[2] ? parts[2].trim() : null;
        const listFilter = {};

        if (filterValue) {
          const normalizedFilter = filterValue.toLowerCase();
          if (["pending", "progress", "in_progress", "appointed", "done"].includes(normalizedFilter)) {
            listFilter.status = normalizedFilter;
          } else {
            listFilter.category = filterValue;
          }
        }

        const activeTasks = isQuickMode
          ? await tasksRepo.getActiveTasks(userId, 3)
          : await tasksRepo.getTasksByFilter(userId, listFilter);

        if (activeTasks.length === 0) {
          const emptyText = listFilter.category
            ? `📭 Tidak ada tugas dengan kategori *${listFilter.category}* saat ini.`
            : listFilter.status
              ? `📭 Tidak ada tugas dengan status *${listFilter.status}* saat ini.`
              : `🎉 *Hore! Tidak ada tugas aktif saat ini, ${namaUser}.*\nPikiranmu bersih! Waktunya istirahat.`;
          msg.reply(emptyText);
          return true;
        }

        let listMsg = isQuickMode
          ? `⚡ *QUICK VIEW TASKS (TOP 3) ${namaUser.toUpperCase()}* ⚡\n\n`
          : `📊 *DAFTAR TUGAS ${namaUser.toUpperCase()}* 📊\n\n`;

        if (listFilter.category) {
          listMsg = `📂 *FILTER KATEGORI: ${listFilter.category.toUpperCase()}* 📂\n\n`;
        }

        if (listFilter.status) {
          listMsg = `🚦 *FILTER STATUS: ${listFilter.status.toUpperCase()}* 🚦\n\n`;
        }

        activeTasks.forEach((task) => {
          let statusIcon = "📌";
          if (task.status === "in_progress") statusIcon = "⚡";
          if (task.status === "appointed") statusIcon = "☁️";
          if (task.status === "done") statusIcon = "✅";

          const deadlineText = task.deadline
            ? `⏳ Deadline: ${task.deadline}`
            : "☁️ Deadline: tidak ditentukan";

          listMsg += `${statusIcon} *[ID: ${task.id}]* ${task.title}\n`;
          listMsg += `    └ 🗂️ _${task.category}_ | ${deadlineText} | ${task.status.toUpperCase()}`;
          if (task.creator_name) listMsg += ` | 👤 ${task.creator_name}`;
          listMsg += "\n\n";
        });

        if (isQuickMode) {
          listMsg += `💡 *Ketik \`!task list\` untuk melihat seluruh isi list tugasmu.*`;
        } else {
          listMsg += `💡 *Tips Aksi:* \`!task list [kategori]\` atau \`!task list [status]\` untuk penyaringan, \`!task progress [id]\` untuk garap, atau \`!task done [id]\` untuk selesaikan tugas!`;
        }

        msg.reply(listMsg);
        return true;
      }

      case "progress": {
        const taskId = parts[2];
        if (!taskId) {
          msg.reply(`❌ Mohon masukkan ID tugasnya. Contoh: \`!task progress 5\``);
          return true;
        }

        const isUpdated = await tasksRepo.updateTaskStatus(taskId, "in_progress", userId);
        if (isUpdated) {
          msg.reply(`⚡ *Status Diperbarui!* Tugas ID *#${taskId}* sekarang berstatus *IN PROGRESS*. Selamat fokus menggarap, ${namaUser}!`);
        } else {
          msg.reply(`❌ Tugas dengan ID *#${taskId}* tidak ditemukan.`);
        }
        return true;
      }

      case "done": {
        const taskId = parts[2];
        if (!taskId) {
          msg.reply(`❌ Mohon masukkan ID tugasnya. Contoh: \`!task done 5\``);
          return true;
        }

        const isUpdated = await tasksRepo.updateTaskStatus(taskId, "done", userId);
        if (isUpdated) {
          msg.reply(`🎉 *Mantap ${namaUser}!* Tugas ID *#${taskId}* resmi diselesaikan. Pikiran makin lega! 🌟`);
        } else {
          msg.reply(`❌ Tugas dengan ID *#${taskId}* tidak ditemukan.`);
        }
        return true;
      }

      case "delete": {
        const taskId = parts[2];
        if (!taskId) {
          msg.reply(`❌ Mohon masukkan ID tugasnya. Contoh: \`!task delete 5\``);
          return true;
        }

        const isDeleted = await tasksRepo.deleteTask(taskId, userId);
        if (isDeleted) {
          msg.reply(`🗑️ Tugas ID *#${taskId}* telah dihapus permanen dari database.`);
        } else {
          msg.reply(`❌ Tugas dengan ID *#${taskId}* tidak ditemukan.`);
        }
        return true;
      }

      case "help":
      default: {
        let helpMsg = `📖 *PANDUAN UTAMA KYATA TASKS* 📖\n\n`;
        helpMsg += `• \`!task\` -> Quick view melihat 3 teratas yang paling mendesak\n`;
        helpMsg += `• \`!task list\` -> Melihat seluruh daftar tugas aktifmu\n`;
        helpMsg += `• \`!task list [kategori]\` -> Menampilkan tugas berdasarkan kategori\n`;
        helpMsg += `• \`!task list [status]\` -> Menampilkan tugas berdasarkan status\n`;
        helpMsg += `• \`!task add [Judul]. [Deadline]. [Kategori]. [Status]\`\n`;
        helpMsg += `• \`!task edit nama [id]. [Judul task baru]\`\n`;
        helpMsg += `• \`!task edit kategori [id]. [Kategori baru]\`\n`;
        helpMsg += `• \`!task edit deadline [id]. [Deadline baru]\`\n`;
        helpMsg += `• \`!task progress [id]\` -> Set tugas menjadi sedang digarap\n`;
        helpMsg += `• \`!task done [id]\` -> Tandai tugas selesai\n`;
        helpMsg += `• \`!task delete [id]\` -> Hapus salah input\n\n`;
        helpMsg += `💡 *Contoh:* \`!task add Buat Gambar\`\n`;
        helpMsg += `💡 *Contoh:* \`!task list Design\` atau \`!task list pending\`\n`;
        helpMsg += `Deadline: \`hari ini 17:00\` atau \`sore ini\`; \`besok\` = +24 jam, \`besok lusa\` = +48 jam. Pagi 07:00, siang 12:00, sore 16:00, malem 19:00.`;
        msg.reply(helpMsg);
        return true;
      }
    }
  } catch (error) {
    console.error("🔴 [TASKS HANDLER ERROR]:", error);
    msg.reply("❌ Waduh, terjadi kesalahan sistem saat memproses modul tugas.");
    return true;
  }
}

function getTasksHelpMessage(namaUser = "Kamu") {
  return `📖 *PANDUAN UTAMA KYATA TASKS* 📖\n\n` +
    `• \`!task\` -> Quick view melihat 3 teratas yang paling mendesak\n` +
    `• \`!task list\` -> Melihat seluruh daftar tugas aktifmu\n` +
    `• \`!task list [kategori]\` -> Menampilkan tugas berdasarkan kategori\n` +
    `• \`!task list [status]\` -> Menampilkan tugas berdasarkan status\n` +
    `• \`!task add [Judul]. [Deadline]. [Kategori]. [Status]\`\n` +
    `• \`!task edit nama [id]. [Judul task baru]\`\n` +
    `• \`!task edit kategori [id]. [Kategori baru]\`\n` +
    `• \`!task edit deadline [id]. [Deadline baru]\`\n` +
    `• \`!task progress [id]\` -> Set tugas menjadi sedang digarap\n` +
    `• \`!task done [id]\` -> Tandai tugas selesai\n` +
    `• \`!task delete [id]\` -> Hapus salah input\n\n` +
    `💡 *Contoh:* \`!task add Buat Gambar\`\n` +
    `💡 *Contoh:* \`!task list Design\` atau \`!task list pending\`\n` +
    `Deadline: \`hari ini 17:00\` atau \`sore ini\`; \`besok\` = +24 jam, \`besok lusa\` = +48 jam. Pagi 07:00, siang 12:00, sore 16:00, malem 19:00.`;
}

module.exports = { handleTasks, getTasksHelpMessage, parseTaskDeadline, parseTaskEditPayload };