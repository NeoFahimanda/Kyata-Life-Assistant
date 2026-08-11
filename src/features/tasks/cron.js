const cron = require("node-cron");
const tasksRepo = require("./repository");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mengirim bubble chat pengingat dengan handling Group / Personal Mention secara dinamis
 */
async function sendTaskMessage(client, targetId, messageText) {
    try {
        let cleanTargetId = targetId;

        // Jika ID masih berupa @lid, coba ubah atau dapatkan contact-nya
        if (cleanTargetId.includes('@lid')) {
            try {
                const contact = await client.getContactById(cleanTargetId);
                cleanTargetId = contact.id._serialized;
            } catch (err) {
                console.warn(`⚠️ Konversi @lid ke contact ID gagal untuk ${cleanTargetId}, mencoba fallback sendMessage direct...`);
                await client.sendMessage(cleanTargetId, messageText);
                return;
            }
        }

        const targetChat = await client.getChatById(cleanTargetId);

        if (targetChat.isGroup) {
            let mentionText = "";
            let mentions = [];

            for (let participant of targetChat.participants) {
                try {
                    const contact = await client.getContactById(participant.id._serialized);
                    mentions.push(contact);
                    mentionText += `@${participant.id.user} `;
                    await delay(100);
                } catch (err) {
                    console.error(`Gagal memuat kontak member grup: ${participant.id.user}`);
                }
            }

            await targetChat.sendMessage(`${mentionText}\n\n${messageText}`, { mentions });
        } else {
            await targetChat.sendMessage(messageText);
        }
    } catch (error) {
        console.error(`🔴 [CRON TASKS] Gagal mengirim pesan ke ${targetId}:`, error);
    }
}

function initCron(client) {
    // Berjalan setiap menit dengan penguncian Zona Waktu Asia/Jakarta (WIB)
    cron.schedule("*/1 * * * *", async () => {
        const sekarangWIB = new Date(
            new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
        );

        const pad = (num) => String(num).padStart(2, "0");
        const tanggalStr = `${sekarangWIB.getFullYear()}-${pad(sekarangWIB.getMonth() + 1)}-${pad(sekarangWIB.getDate())}`;
        const jamMenitStr = `${pad(sekarangWIB.getHours())}:${pad(sekarangWIB.getMinutes())}`;

        const waktuSekarangFullStr = `${tanggalStr} ${jamMenitStr}`; // Hasil: "2026-07-13 21:30"

        // ==========================================
        // JALUR 1: POLLING ANTRIAN PRESISI (MENITAN)
        // ==========================================
        try {
            const queue = await tasksRepo.getPendingQueue(waktuSekarangFullStr);

            for (const item of queue) {
                let headerIcon = "";
                let messageTypeBody = "";

                switch (item.type) {
                    case 'morning_briefing':
                        headerIcon = "🌅 *BRIEFING PAGI TASK*";
                        messageTypeBody = "Hari ini adalah batas akhir pengerjaan tugas ini, lho. Jangan lupa dijadwalkan ya!";
                        break;
                    case 'h_minus_1_day':
                        headerIcon = "⏳ *PENGINGAT H-1 DEADLINE*";
                        messageTypeBody = "Besok tugas ini sudah harus selesai. Yuk, dicicil atau mulai digarap sekarang!";
                        break;
                    case 'h_minus_1_hour':
                        headerIcon = "🚨 *🚨 PANIC BUTTON (H-1 JAM)*";
                        messageTypeBody = "Gawat! 1 jam lagi batas waktu tugas ini habis. Buruan amankan atau beresin sekarang!";
                        break;
                    case 'at_deadline':
                        headerIcon = "⏰ *WAKTU DEADLINE TIBA!*";
                        messageTypeBody = "Waktu pengerjaan tugas ini sudah habis! Sudah selesai di-done belum? Jangan ditunda lagi ya! 🔥";
                        break;
                    default:
                        headerIcon = "📌 *PENGINGAT TUGAS*";
                        messageTypeBody = "Jangan lupa dengan progres tugas yang satu ini.";
                }

                let reminderMsg = `${headerIcon}\n\n`;
                reminderMsg += `📌 *Tugas:* ${item.title}\n`;
                reminderMsg += `🗂️ *Kategori:* ${item.category}\n`;
                reminderMsg += `⏳ *Deadline:* ${item.deadline}\n\n`;
                reminderMsg += `💡 _${messageTypeBody}_\n\n`;
                reminderMsg += `👉 Ketik \`!task progress ${item.task_id}\` untuk mulai garap atau \`!task done ${item.task_id}\` jika sudah beres!`;

                await sendTaskMessage(client, item.user_id, reminderMsg);
                await tasksRepo.updateReminderStatus(item.reminder_id, 'sent');
                await delay(500);
            }
        } catch (err) {
            console.error("🔴 [CRON TASKS] Error pada sistem antrean menit:", err);
        }

        // ==========================================
        // JALUR 2: BROADCAST PROAKTIF RUTIN (3X SEHARI)
        // ==========================================
        const jamRutin = ["07:00", "13:00", "19:00"];

        if (jamRutin.includes(jamMenitStr)) {
            let label = jamMenitStr === "07:00" ? "pagi" : jamMenitStr === "13:00" ? "siang" : "malam";

            try {
                console.log(`⏰ [CRON TASKS] Menjalankan laporan proaktif rutin ${label}...`);
                const groupedTasks = await tasksRepo.getAllUnfinishedTasksGrouped();

                for (const [userId, tasks] of Object.entries(groupedTasks)) {
                    let overdueText = "";
                    let activeText = "";
                    let totalOverdue = 0;

                    tasks.forEach((task) => {
                        const dateInfo = task.deadline ? `(Batas: ${task.deadline})` : "(Tanpa deadline)";
                        if (task.is_overdue === 1) {
                            totalOverdue++;
                            overdueText += `⚠️ *[ID: ${task.id}]* ${task.title} _${dateInfo}_\n`;
                        } else {
                            activeText += `📌 *[ID: ${task.id}]* ${task.title} _${dateInfo}_\n`;
                        }
                    });

                    let openingMsg = "";
                    if (label === "pagi") {
                        openingMsg = `🌅 *BRIEFING PAGI KYATA*\n\nSebelum mulai aktivitas harian, ini daftar tugas kamu yang masih aktif ya. Tetap produktif!`;
                    } else if (label === "siang") {
                        openingMsg = `☀️ *EVALUASI SIANG KYATA*\n\nSudah tengah hari nih, yuk rehat sejenak! Sekalian cek progres, ini daftar tugas yang masih menunggu digarap:`;
                    } else {
                        openingMsg = `🌌 *EVALUASI MALAM KYATA*\n\nWaktunya evaluasi malam hari. Ini sisa tugasmu sebelum kamu istirahat total dan tidur:`;
                    }

                    let finalBroadcast = `${openingMsg}\n\n`;

                    // Blok Overdue ditaruh paling atas bubble chat
                    if (totalOverdue > 0) {
                        finalBroadcast += `🚨 *KERJAAN OVERDUE (BELUM KELAR):*\n${overdueText}\n🔥 _Bro/Kak, ini kerjaanmu yang sudah lewat tenggat! Jangan lupa segera diselesaikan biar gak makin menumpuk!_\n\n`;
                    }

                    if (activeText) {
                        finalBroadcast += `📋 *TUGAS ANTRIAN AKTIF:*\n${activeText}\n`;
                    }

                    finalBroadcast += `\n💡 _Ketik \`!task done [id]\` jika tugasnya sudah selesai kamu kerjakan._`;

                    await sendTaskMessage(client, userId, finalBroadcast);
                    await delay(1000);
                }
            } catch (err) {
                console.error(`🔴 [CRON TASKS] Gagal memproses broadcast proaktif ${label}:`, err);
            }
        }
    });
}

module.exports = { initCron };