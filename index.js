const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { handleFinance } = require('./src/features/finance/handler'); // Tetap pakai 'features' karena di VS Code-mu memang ada!

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
    // FIX UTAMA: Ditambahkan 'await' karena handleFinance adalah fungsi Async
    const isFinance = await handleFinance(msg);
    
    if (isFinance) return;

    // Nanti fitur Tasks tinggal ditaruh di bawah sini:
    // const isTasks = await handleTasks(msg);
    // if (isTasks) return;
});

client.initialize();