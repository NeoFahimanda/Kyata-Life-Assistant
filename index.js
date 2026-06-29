const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { handleFinance } = require('./src/features/finance/handler');

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
    console.log('🚀 Kyata: Life Assistant sudah aktif dan siap membantu!');
});

// PUSAT ROUTER CHAT MASUK
client.on('message', async (msg) => {
    // Jalankan handler finansial, jika mengembalikan true artinya pesan sudah selesai ditangani
    const isFinance = handleFinance(msg);
    
    if (isFinance) return;

    // Nanti di sini kita tinggal tambah:
    // const isTasks = handleTasks(msg);
    // if (isTasks) return;
});

client.initialize();