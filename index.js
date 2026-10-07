process.env.TZ = "Asia/Jakarta";

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
            "--disable-gpu",
        ],
    },
});

let reconnectTimer = null;
let reconnectAttempts = 0;
let reconnecting = false;

function requestClientReconnect(reason) {
    if (reconnectTimer || reconnecting) return;

    const delayMs = Math.min(5000 * (2 ** reconnectAttempts), 60000);
    reconnectAttempts += 1;
    console.error(`🔴 [WHATSAPP CLIENT] ${reason}. Reconnecting in ${Math.round(delayMs / 1000)}s...`);

    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        reconnecting = true;

        try {
            await client.destroy();
        } catch (error) {
            console.error("[WHATSAPP CLIENT] Error closing stale client:", error);
        }

        try {
            await client.initialize();
        } catch (error) {
            console.error("[WHATSAPP CLIENT] Reinitialization failed:", error);
            reconnecting = false;
            requestClientReconnect("Retrying after initialization failure");
            return;
        }

        reconnecting = false;
    }, delayMs);
}

client.on("disconnected", (reason) => {
    requestClientReconnect(`Disconnected: ${reason}`);
});

client.on("session_error", (error) => {
    requestClientReconnect(`Browser session error: ${error.message || error}`);
});

client.on("auth_failure", (reason) => {
    console.error("🔴 [WHATSAPP CLIENT] Authentication failed:", reason);
});

client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
    console.log("🔄 Scan QR Code di atas untuk menyambungkan Kyata...");
});

client.on("ready", () => {
    reconnectAttempts = 0;
    console.log("🚀 Kyata: Life Assistant sudah aktif dan siap membantu!");

    client.pupPage?.once("error", (error) => {
        requestClientReconnect(`Puppeteer page crashed: ${error.message}`);
    });
    client.pupPage?.once("close", () => {
        requestClientReconnect("Puppeteer page closed");
    });
    client.pupBrowser?.once("disconnected", () => {
        requestClientReconnect("Puppeteer browser disconnected");
    });

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

client.initialize().catch((error) => {
    console.error("🔴 [WHATSAPP CLIENT] Initial startup failed:", error);
    requestClientReconnect("Retrying after initial startup failure");
});