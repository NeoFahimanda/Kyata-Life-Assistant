const tasksRepo = require("./repository");

function formatTaskDeadline(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseTaskDeadline(value, now = new Date()) {
  if (!value) return null;

  const input = value.trim().toLowerCase();
  const relativeMatch = input.match(/^(besok\s+lusa|besok|lusa)(?:\s+(.*))?$/);

  if (relativeMatch) {
    const [, dayPhrase, timePhrase = ""] = relativeMatch;
    const deadline = new Date(now);
    const hourByPeriod = {
      pagi: 7,
      siang: 12,
      sore: 16,
      malam: 19,
      malem: 19,
    };
    const periodHour = hourByPeriod[timePhrase];
    const timeMatch = timePhrase.match(/^(\d{1,2}):(\d{2})$/);

    if (!timePhrase) {
      deadline.setSeconds(0, 0);
      deadline.setTime(deadline.getTime() + (dayPhrase === "besok" ? 24 : 48) * 60 * 60 * 1000);
    } else {
      if (periodHour === undefined && !timeMatch) {
        throw new Error("Waktu deadline tidak dikenali");
      }

      const hour = periodHour ?? Number(timeMatch[1]);
      const minute = periodHour === undefined ? Number(timeMatch[2]) : 0;
      if (hour > 23 || minute > 59) {
        throw new Error("Waktu deadline tidak valid");
      }

      deadline.setDate(deadline.getDate() + (dayPhrase === "besok" ? 1 : 2));
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

async function handleTasks(msg) {
  const textRaw = msg.body.trim();
  const parts = textRaw.split(/\s+/);
  const command = parts[0].toLowerCase();

  // Kunci utama saklar fitur: Hanya memproses jika diawali komando !task atau @task
  if (command !== "@task" && command !== "!task") return false;

  const subCommand = parts[1] ? parts[1].toLowerCase() : "quick";
  const userId = msg.from;

  try {
    const kontak = await msg.getContact();
    let namaUser = kontak.pushname || kontak.number;
    namaUser = namaUser.replace(/[/\\?*:[\]]/g, "").trim();

    switch (subCommand) {
      case "add": {
        const argString = textRaw.substring(10).trim();
        if (!argString) {
          msg.reply(`❌ *Format Salah, ${namaUser}!*\n\nFormat:\n\`!task add [Judul] | [Deadline] | [Kategori] | [Status]\``);
          return true;
        }

        const args = argString.split("|").map((item) => item.trim());
        const title = args[0];
        const deadlineInput = args[1] || null;
        const category = args[2] || "Personal";
        const status = args[3] || "pending";

        if (!title) {
          msg.reply(`❌ *Judul tugas tidak boleh kosong ya, ${namaUser}!*`);
          return true;
        }

        let deadline;
        try {
          deadline = parseTaskDeadline(deadlineInput);
        } catch (error) {
          msg.reply(`❌ Deadline tidak dikenali. Gunakan tanggal YYYY-MM-DD atau contoh: \`besok 17:00\`, \`besok lusa\`, \`besok pagi\`.`);
          return true;
        }

        // ✨ Kirim userId ke repository agar tercatat milik siapa
        const newTask = await tasksRepo.addTask(userId, title, category, deadline, status);

        let replyMsg = `✅ *Tugas Berhasil Dicatat, ${namaUser}!*\n\n`;
        replyMsg += `🆔 *ID:* ${newTask.id}\n`;
        replyMsg += `📌 *Tugas:* ${newTask.title}\n`;
        replyMsg += `🗂️ *Kategori:* ${newTask.category}\n`;
        replyMsg += `⏳ *Deadline:* ${newTask.deadline ? newTask.deadline : "Ngambang (Appointed)"}\n`;
        replyMsg += `🚦 *Status:* \`${newTask.status.toUpperCase()}\``;

        msg.reply(replyMsg);
        return true;
      }

      case "quick":
      case "list": {
        const isQuickMode = subCommand === "quick";

        // ✨ Kirim userId agar user hanya melihat tugas milik chat mereka sendiri
        const activeTasks = await tasksRepo.getActiveTasks(userId, isQuickMode ? 3 : null);

        if (activeTasks.length === 0) {
          msg.reply(`🎉 *Hore! Tidak ada tugas aktif saat ini, ${namaUser}.*\nPikiranmu bersih! Waktunya istirahat.`);
          return true;
        }

        let listMsg = isQuickMode
          ? `⚡ *QUICK VIEW TASKS (TOP 3) ${namaUser.toUpperCase()}* ⚡\n\n`
          : `📊 *DAFTAR LENGKAP TUGAS AKTIF ${namaUser.toUpperCase()}* 📊\n\n`;

        activeTasks.forEach((task) => {
          let statusIcon = "📌";
          if (task.status === "in_progress") statusIcon = "⚡";
          if (task.status === "appointed") statusIcon = "☁️";

          const deadlineText = task.deadline
            ? `⏳ _Batas: ${task.deadline}_`
            : "☁️ _Belum ada deadline..._";

          listMsg += `${statusIcon} *[ID: ${task.id}]* ${task.title}\n`;
          listMsg += `    └ 🗂️ ${task.category} | ${deadlineText} | \`${task.status.toUpperCase()}\`\n\n`;
        });

        if (isQuickMode) {
          listMsg += `💡 *Ketik \`!task list\` untuk melihat seluruh isi list tugasmu.*`;
        } else {
          listMsg += `💡 *Tips Aksi:* \`!task progress [id]\` untuk garap, atau \`!task done [id]\` untuk selesaikan tugas!`;
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
        helpMsg += `• \`!task add [Judul] | [Deadline] | [Kategori] | [Status]\`\n`;
        helpMsg += `• \`!task progress [id]\` -> Set tugas menjadi sedang digarap\n`;
        helpMsg += `• \`!task done [id]\` -> Tandai tugas selesai\n`;
        helpMsg += `• \`!task delete [id]\` -> Hapus salah input\n\n`;
        helpMsg += `💡 *Contoh:* \`!task add beli susu | besok 17:00\`\n`;
        helpMsg += `Contoh kategori: \`!task add bayar listrik | besok | Rumah\`\n`;
        helpMsg += `Deadline: \`besok\` = +24 jam, \`besok lusa\` = +48 jam; pagi 07:00, siang 12:00, sore 16:00, malem 19:00.`;
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
    `• \`!task add [Judul] | [Deadline] | [Kategori] | [Status]\`\n` +
    `• \`!task progress [id]\` -> Set tugas menjadi sedang digarap\n` +
    `• \`!task done [id]\` -> Tandai tugas selesai\n` +
    `• \`!task delete [id]\` -> Hapus salah input\n\n` +
    `💡 *Contoh:* \`!task add beli susu | besok 17:00\`\n` +
    `Contoh kategori: \`!task add bayar listrik | besok | Rumah\`\n` +
    `Deadline: \`besok\` = +24 jam, \`besok lusa\` = +48 jam; pagi 07:00, siang 12:00, sore 16:00, malem 19:00.`;
}

module.exports = { handleTasks, getTasksHelpMessage, parseTaskDeadline };