const tasksRepo = require("./repository");

async function handleTasks(msg) {
  const textRaw = msg.body.trim();
  const parts = textRaw.split(/\s+/);
  const command = parts[0].toLowerCase();

  // Kunci utama saklar fitur: Hanya memproses jika diawali komando !task
  if (command !== "@task" && command !== "!task") return false;

  // ✨ KUNCI SAKLAR BARU: Jika cuma ketik !task, arahkan ke sub-command "quick"
  const subCommand = parts[1] ? parts[1].toLowerCase() : "quick";

  try {
    const kontak = await msg.getContact();
    let namaUser = kontak.pushname || kontak.number;
    namaUser = namaUser.replace(/[/ \\ ?*:[ ] ]/g, "");

    switch (subCommand) {
      case "add": {
        const argString = textRaw.substring(10).trim();
        if (!argString) {
          msg.reply(`❌ *Format Salah, ${namaUser}!*\n\nFormat menambahkan tugas:\n\`!task add [Judul] | [Kategori] | [Deadline YYYY-MM-DD] | [Status]\``);
          return true;
        }

        const args = argString.split("|").map((item) => item.trim());
        const title = args[0];
        const category = args[1] || "Personal";
        let deadline = args[2] || null;
        const status = args[3] || "pending";

        if (deadline && deadline.length === 10) {
          deadline = `${deadline} 23:59`;
        }

        if (!title) {
          msg.reply(`❌ *Judul tugas tidak boleh kosong ya, ${namaUser}!*`);
          return true;
        }

        const newTask = await tasksRepo.addTask(title, category, deadline, status);

        let replyMsg = `✅ *Tugas Berhasil Dicatat, ${namaUser}!*\n\n`;
        replyMsg += `🆔 *ID:* ${newTask.id}\n`;
        replyMsg += `📌 *Tugas:* ${newTask.title}\n`;
        replyMsg += `🗂️ *Kategori:* ${newTask.category}\n`;
        replyMsg += `⏳ *Deadline:* ${newTask.deadline ? newTask.deadline : "Ngambang (Appointed)"}\n`;
        replyMsg += `🚦 *Status:* \`${newTask.status.toUpperCase()}\``;

        msg.reply(replyMsg);
        return true;
      }

      // 🌟 COMBINED CASE: Menangani !task (quick) dan !task list (list) bersamaan
      case "quick":
      case "list": {
        const isQuickMode = subCommand === "quick";

        // Panggil repo: Jika quick mode, kirim angka 3 ke SQLite
        const activeTasks = await tasksRepo.getActiveTasks(isQuickMode ? 3 : null);

        if (activeTasks.length === 0) {
          msg.reply(`🎉 *Hore! Tidak ada tugas aktif saat ini, ${namaUser}.*\nPikiranmu bersih! Waktunya istirahat atau ngerjain habit.`);
          return true;
        }

        // Set judul header dinamis berdasarkan perintahnya
        let listMsg = isQuickMode
          ? `⚡ *QUICK VIEW TASKS (TOP 3) ${namaUser.toUpperCase()}* ⚡\n\n`
          : ` Bars *DAFTAR LENGKAP TUGAS AKTIF ${namaUser.toUpperCase()}* 📊\n\n`;

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

        const isUpdated = await tasksRepo.updateTaskStatus(taskId, "in_progress");
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

        const isUpdated = await tasksRepo.updateTaskStatus(taskId, "done");
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

        const isDeleted = await tasksRepo.deleteTask(taskId);
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
        helpMsg += `• \`!task add [Judul] | [Kategori] | [Deadline] | [Status]\`\n`;
        helpMsg += `• \`!task progress [id]\` -> Set tugas menjadi sedang digarap\n`;
        helpMsg += `• \`!task done [id]\` -> Tandai tugas selesai\n`;
        helpMsg += `• \`!task delete [id]\` -> Hapus salah input\n\n`;
        helpMsg += `💡 *Contoh Input:* \`!task add kerjain komisi | Bisnis | 2026-08-03\``;
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

module.exports = { handleTasks };