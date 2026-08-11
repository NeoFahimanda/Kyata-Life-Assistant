const { execSync } = require("child_process");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

// 0. PEMBERSIHAN ZOMBIE CHROMIUM
// Bersihkan sisa proses Chromium lama jika ada agar tidak timbul error binding
try {
    execSync("pkill -f chromium || true");
    console.log("🧹 Cleaned up old Chromium processes.");
} catch (e) {
    // Abaikan jika tidak ada proses chromium yang berjalan
}

// 1. Impor Handler Fitur (Feature Handlers)
const { handleFinance } = require("./src/features/finance/handler");
const { handleTasks } = require("./src/features/tasks/handler");
const { handleGeneral } = require("./src/services/handler-general");
const { initAllCrons } = require("./src/services/cron");

// Inisialisasi database otomatis saat app dinyalakan
require("./src/services/database");

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: "/usr/bin/chromium",
        handleSIGINT: false,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--single-process",
            "--disable-gpu",
        ],
    },
});

client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
    console.log("🔄 Scan QR Code di atas untuk menyambungkan Kyata...");
});

client.on("ready", () => {
    console.log("🚀 Kyata: Life Assistant sudah aktif dan siap membantu!");
    // Inisialisasi semua cron jobs saat client siap
    initAllCrons(client);
});

// 2. PUSAT ROUTER CHAT MASUK (Central Entry Point)
client.on("message", async (msg) => {
    try {
        const generalHandled = await handleGeneral(msg);
        if (generalHandled) return;

        // Jalankan handler finansial, jika mengembalikan true artinya pesan selesai diproses
        const financeHandled = await handleFinance(msg);
        if (financeHandled) return;

        // Jalankan handler tasks tracker yang baru, jika true maka hentikan aliran proses
        const tasksHandled = await handleTasks(msg);
        if (tasksHandled) return;

        // Kamu bisa tambahkan modul masa depan di bawah sini (e.g. handleHabits, handleAI)
    } catch (error) {
        console.error("🔴 [Pusat Router Error]:", error);
    }
});

client.initialize();