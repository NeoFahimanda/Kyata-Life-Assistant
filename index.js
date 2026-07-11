const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { handleFinance } = require('./src/features/finance/handler');
const { initAllCrons } = require('./src/services/cron'); // Panggil core cron manager baru

// Inisialisasi database otomatis saat app dinyalakan
require('./src/services/database');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        handleSIGINT: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('🔄 Scan QR Code di atas untuk menyambungkan Kyata...');
});

client.on('ready', () => {
    console.log('🚀 Kyata: Life Assistant v2.0 sudah aktif dan siap membantu!');
    initAllCrons(client); // Menjalankan semua cron terdesentralisasi secara otomatis
});

// PUSAT ROUTER CHAT MASUK
client.on('message', async (msg) => {
    // 1. Fitur Finansial
    const isFinance = await handleFinance(msg);
    if (isFinance) return;

    // 2. Fitur Tugas/Tasks (Masa Depan tinggal pasang tanpa merusak kode lama)
    // const isTasks = await handleTasks(msg);
    // if (isTasks) return;
});

client.initialize();