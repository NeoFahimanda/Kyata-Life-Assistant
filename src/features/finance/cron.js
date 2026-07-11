const cron = require("node-cron");
const repo = require("./repository");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendReminderMessage(client, chat, typeText) {
  const targetChat = await client.getChatById(chat.chat_id);

  if (targetChat.isGroup) {
    let text = `📢 *WAKTU NYA TRACKING DUIT ${typeText}!* 📊\n\nHalo teman-teman, jangan lupa catat pemasukan dan pengeluaran kalian ${typeText.toLowerCase()} ini lewat Kyata ya! ✨\n\n`;
    let mentions = [];

    for (let participant of targetChat.participants) {
      try {
        const contact = await client.getContactById(participant.id._serialized);
        mentions.push(contact);
        text += `@${participant.id.user} `;
        await delay(200);
      } catch (err) {
        console.error(`Gagal mengambil kontak member: ${participant.id.user}`);
      }
    }
    await targetChat.sendMessage(text, { mentions });
  } else {
    await targetChat.sendMessage(
      `📢 *WAKTU NYA TRACKING DUIT ${typeText}!* 📊\n\nHalo! Jangan lupa luangkan waktu sejenak untuk merapikan dan mencatat pengeluaran finansialmu ${typeText.toLowerCase()} ini ya. Semangat! 💪✨`,
    );
  }
}

function initCron(client) {
  // Sistem simulasi berjalan mengecek database setiap menit
  cron.schedule("*/1 * * * *", async () => {
    // Kunci zona waktu ke Asia/Jakarta (WIB) biar konisten di mana pun bot di-host
    const sekarangWIB = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
    );

    const hariSekarang = sekarangWIB.getDay().toString(); // 0 = Minggu, 1 = Senin, dst
    const jamSekarang = String(sekarangWIB.getHours()).padStart(2, "0");
    const menitSekarang = String(sekarangWIB.getMinutes()).padStart(2, "0");
    const waktuSekarangStr = `${jamSekarang}:${menitSekarang}`; // Hasil format pasti: "20:00"

    // 1. PROSES ALARM HARIAN (DAILY)
    try {
      const activeDailyChats = repo.getActiveReminders("daily");
      for (const chat of activeDailyChats) {
        // Normalisasi format string database (antisipasi jika user input "8:00" malah jadi gak cocok)
        const dbTime =
          chat.remind_time.length === 4
            ? `0${chat.remind_time}`
            : chat.remind_time;

        if (dbTime === waktuSekarangStr) {
          console.log(
            `📊 [CRON FINANCE] Mengirim alarm HARIAN ke ${chat.chat_id}`,
          );
          await sendReminderMessage(client, chat, "HARIAN");
          await delay(1000);
        }
      }
    } catch (error) {
      console.error("Error pada cron harian:", error);
    }

    // 2. PROSES ALARM MINGGUAN (WEEKLY)
    try {
      const activeWeeklyChats = repo.getActiveReminders("weekly");
      for (const chat of activeWeeklyChats) {
        const dbTime =
          chat.remind_time.length === 4
            ? `0${chat.remind_time}`
            : chat.remind_time;

        if (chat.remind_day === hariSekarang && dbTime === waktuSekarangStr) {
          console.log(
            `📊 [CRON FINANCE] Mengirim alarm MINGGUAN ke ${chat.chat_id}`,
          );
          await sendReminderMessage(client, chat, "MINGGUAN");
          await delay(1000);
        }
      }
    } catch (error) {
      console.error("Error pada cron mingguan:", error);
    }
  });
}

module.exports = { initCron };
