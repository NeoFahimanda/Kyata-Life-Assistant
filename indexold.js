const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { google } = require('googleapis');
const path = require('path');

// ID Google Sheets kamu
const SPREADSHEET_ID = '1FLKzHZwnD-YVIPyvG7hV-RZT2nolchOcz7H1EDVkwwQ';

// Jalur ke file credentials.json
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

// Inisialisasi autentikasi Google
const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheetsClient = google.sheets({ version: 'v4', auth });

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        handleSIGINT: false,
        headless: true, // Pastikan set true agar berjalan murni di background Linux
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-extensions',
            '--disable-default-apps'
        ],
        executablePath: '/usr/bin/google-chrome' // HORE! Sekarang menembak Chrome Linux internal WSL
    }
});

client.on('qr', (qr) => {
    console.log('--- SCAN QR CODE JIKA DIPERLUKAN ---');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Hore! Bot Expense Tracker Auto-Create Tab sudah siap!');
});

// FUNGSI UNTUK CEK & BUAT TAB OTOMATIS JIKA BELUM ADA
async function ensureSheetExists(namaTab) {
    try {
        // 1. Ambil info semua tab yang ada di spreadsheet
        const spreadsheet = await sheetsClient.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID,
        });
        
        const sheets = spreadsheet.data.sheets;
        const sheetExists = sheets.some(s => s.properties.title === namaTab);
        
        // 2. Jika tab sudah ada, langsung keluar (sukses)
        if (sheetExists) return true;
        
        console.log(`Tab "${namaTab}" tidak ditemukan. Membuat tab baru otomatis...`);
        
        // 3. Jika belum ada, buat tab baru dengan nama tersebut
        await sheetsClient.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                requests: [
                    {
                        addSheet: {
                            properties: {
                                title: namaTab,
                            },
                        },
                    },
                ],
            },
        });
        
        // 4. Isi baris judul (Header) di tab baru tersebut biar rapi
        await sheetsClient.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${namaTab}!A2:D2`, // Sengaja mulai di baris 2 biar sama kayak struktur lamamu
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [['Tanggal', 'Jenis', 'Nominal', 'Keterangan']],
            },
        });
        
        console.log(`✅ Sukses membuat tab baru untuk: ${namaTab}`);
        return true;
    } catch (error) {
        console.error(`Gagal mengecek/membuat tab "${namaTab}":`, error.message);
        return false;
    }
}

// FUNGSI MENULIS KE TAB
async function appendToSheets(namaTab, jenis, nominal, keterangan) {
    const tanggal = new Date().toLocaleDateString('id-ID');
    try {
        await sheetsClient.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${namaTab}!A:D`, 
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[tanggal, jenis, nominal, keterangan]],
            },
        });
        return true;
    } catch (error) {
        console.error(`Gagal append data ke ${namaTab}:`, error.message);
        return false;
    }
}

// FUNGSI UNTUK MENGAMBIL SEMUA BARIS DATA DARI TAB GOOGLE SHEETS
async function getSheetRows(namaTab) {
    try {
        const response = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${namaTab}!A3:D`, // Mulai dari baris 3 untuk melewati header/baris kosong
        });
        return response.data.values || [];
    } catch (error) {
        console.error(`Gagal mengambil data dari tab ${namaTab}:`, error.message);
        return [];
    }
}

// FUNGSI UNTUK MENGHITUNG SALDO BERDASARKAN KATEGORI & BULAN BERJALAN
async function getSaldoInfo(namaUser) {
    try {
        const rows = await getSheetRows(namaUser);
        if (!rows || rows.length === 0) {
            return { ada: false };
        }

        // Ambil data Bulan dan Tahun saat ini (Lokal Indonesia)
        const sekarang = new Date();
        const bulanSekarang = Clinical = sekarang.getMonth(); // 0 = Januari, 5 = Juni, dst.
        const tahunSekarang = sekarang.getFullYear();

        let pemasukanBulanIni = 0;
        let pengeluaranBulanIni = 0;
        let totalHutang = 0;
        let totalPiutang = 0;

        rows.forEach(row => {
            const stringTanggal = row[0]; // Kolom A
            const jenis = row[1];         // Kolom B
            const nominal = parseInt(row[2]) || 0; // Kolom C
            
            if (!stringTanggal) return;

            // Parsing tanggal dari Sheets (Potong string baik menggunakan karakter "/" maupun "-")
            const partTanggal = stringTanggal.split(/[-/]/);
            if (partTanggal.length < 3) return;

            const blnBaris = parseInt(partTanggal[1]) - 1; // Di JS, index bulan dikurang 1
            const thnBaris = parseInt(partTanggal[2]);

            // 1. FILTER BULANAN: Khusus untuk Pemasukan dan Pengeluaran Murni
            if (blnBaris === bulanSekarang && thnBaris === tahunSekarang) {
                if (jenis === 'Pemasukan') {
                    pemasukanBulanIni += nominal;
                } else if (jenis === 'Pengeluaran') {
                    pengeluaranBulanIni += nominal;
                }
            }

            // 2. AKUMULASI GLOBAL: Hitung sisa saldo Hutang & Piutang yang masih menggantung
            if (jenis === 'Hutang') {
                totalHutang += nominal;
            } else if (jenis === 'Bayar Hutang') {
                totalHutang -= nominal; // Mengurangi beban hutang karena dibayar
            }

            if (jenis === 'Piutang') {
                totalPiutang += nominal;
            } else if (jenis === 'Tagih Piutang') {
                totalPiutang -= nominal; // Mengurangi piutang karena uangnya balik
            }
        });

        // 3. RUMUS SISA SALDO FISIK DI TANGAN SAAT INI (Berdasarkan seluruh riwayat mutasi kas dari awal):
        let semuaPemasukanAwal = 0;
        let semuaPengeluaranAwal = 0;
        
        rows.forEach(row => {
            const jenis = row[1];         // Kolom B
            const nominal = parseInt(row[2]) || 0; // Kolom C
            
            if (jenis === 'Pemasukan' || jenis === 'Hutang' || jenis === 'Tagih Piutang') {
                semuaPemasukanAwal += nominal;
            }
            if (jenis === 'Pengeluaran' || jenis === 'Piutang' || jenis === 'Bayar Hutang') {
                semuaPengeluaranAwal += nominal;
            }
        });
        
        const sisaSaldoFisik = semuaPemasukanAwal - semuaPengeluaranAwal;

        // Mendapatkan nama bulan lokal (contoh: "Juni")
        const namaBulanTeks = sekarang.toLocaleDateString('id-ID', { month: 'long' });

        return {
            ada: true,
            namaBulan: namaBulanTeks,
            pemasukan: pemasukanBulanIni,
            pengeluaran: pengeluaranBulanIni,
            hutang: totalHutang,
            piutang: totalPiutang,
            total: sisaSaldoFisik
        };
    } catch (error) {
        console.error('Error saat menghitung info saldo bulanan:', error);
        return { ada: false };
    }
}

// LOGIKA MEMBACA PESAN MASUK
client.on('message', async (msg) => {
    const text = msg.body.trim();
    const parts = text.split(' ');
    const command = parts[0].toLowerCase();

    // Hanya merespon daftar command yang valid
    const validCommands = ['!saldo', '!add', '!minus', '!hutang', '!piutang', '!pay', '!claim', '!bulanan', '!mingguan', '!help'];
    if (!validCommands.includes(command)) return;

    // Mengambil nama profil WA secara dinamis
    const kontak = await msg.getContact();
    
    // Karakter aneh pada nama WA dibersihkan sedikit agar aman jadi nama tab Google Sheets
    let namaUser = kontak.pushname || kontak.number;
    namaUser = namaUser.replace(/[/\\?*:[\]]/g, ''); // Menghapus karakter yang dilarang oleh Google Sheets

    // 0. COMMAND: !help
    if (command === '!help') {
        const menuHelp = `*===== COMMAND LIST BOT E.T. =====*\n` +
                         `Halo *${namaUser}*! Berikut adalah daftar perintah lengkap beserta format pengetikannya:\n\n` +
                         `💰 *MANAJEMEN SALDO UTAMA:*\n` +
                         `• \`!saldo\`\n` +
                         `• \`!add [nominal] [keterangan]\`\n` +
                         `• \`!minus [nominal] [keterangan]\`\n` +
                         `⏳ *MANAJEMEN DELAYED TRANS (HUTANG/PIUTANG):*\n` +
                         `• \`!hutang [nominal] [keterangan]\`\n` +
                         `• \`!pay [nominal] [keterangan]\`\n` +
                         `• \`!piutang [nominal] [keterangan]\`\n` +
                         `• \`!claim [nominal] [keterangan]\`\n` +
                         `📊 *LAPORAN & REKAPITULASI:*\n` +
                         `• \`!mingguan\`\n` +
                         `• \`!bulanan\`\n` +
                         `-----------------------------------------\n` +
                         `💡 *Note:* Ketik angka nominal langsung secara bulat tanpa tanda titik atau koma ya!`;
        
        msg.reply(menuHelp);
        return;
    }

    // 1. COMMAND: !saldo
    if (command === '!saldo') {
        msg.reply(`Bentar ya ${namaUser}, lagi ngecek saldo kamu... 📊⏳`);
        
        const saldoData = await getSaldoInfo(namaUser);

        if (saldoData.ada) {
            const pesanSaldo = `*===== Ringkasan Dompet ${namaUser} =====*\n\n` +
                               `📅 *Riwayat Bulan ${saldoData.namaBulan}:*\n` +
                               `  ➕ Pemasukan Bulan Ini: Rp ${saldoData.pemasukan.toLocaleString('id-ID')} (+ Rp ${saldoData.piutang.toLocaleString('id-ID')} Piutang)\n` +
                               `  ➖ Pengeluaran Bulan Ini: Rp ${saldoData.pengeluaran.toLocaleString('id-ID')} (+ Rp ${saldoData.hutang.toLocaleString('id-ID')} Hutang)\n\n` +
                               `⏳ *Transaksi Tertunda (Delayed):*\n` +
                               `  💸 Hutang (Wajib Dibayar): Rp ${saldoData.hutang.toLocaleString('id-ID')}\n` +
                               `  💼 Piutang (Bakal Ditagih): Rp ${saldoData.piutang.toLocaleString('id-ID')}\n` +
                               `-----------------------------------------\n` +
                               `💳 *Sisa Saldo Fisik Saat Ini: Rp ${saldoData.total.toLocaleString('id-ID')}*\n\n` +
                               `Semangat ngaturnya! 💪✨`;
            msg.reply(pesanSaldo);
        } else {
            msg.reply(`❌ Kamu belum pernah mencatat transaksi apa pun, jadi tab kamu belum ada.`);
        }
        return;
    }

    // 1b. COMMAND: !bulanan
    if (command === '!bulanan') {
        msg.reply(`Bentar ya ${namaUser}, lagi ngumpulin riwayat transaksi bulan ini... 📅⏳`);
        
        const rows = await getSheetRows(namaUser);
        const saldoData = await getSaldoInfo(namaUser); // Ambil ringkasan totalnya sekalian

        if (!rows || rows.length === 0) {
            msg.reply(`❌ Kamu belum pernah mencatat transaksi apa pun.`);
            return;
        }

        const sekarang = new Date();
        const bulanSekarang = sekarang.getMonth();
        const tahunSekarang = spreadsheets = sekarang.getFullYear();
        const namaBulanTeks = sekarang.toLocaleDateString('id-ID', { month: 'long' });

        let teksRiwayat = `*===== 📝 TRACKING BULAN ${namaBulanTeks.toUpperCase()} =====*\n\n`;
        let adaTransaksi = false;

        rows.forEach((row) => {
            const stringTanggal = row[0]; // Kolom A
            const jenis = row[1];         // Kolom B
            const nominal = parseInt(row[2]) || 0; // Kolom C
            const keterangan = row[3] || 'Tanpa Keterangan'; // Kolom D

            if (!stringTanggal) return;

            const partTanggal = stringTanggal.split(/[-/]/);
            if (partTanggal.length < 3) return;

            const blnBaris = parseInt(partTanggal[1]) - 1;
            const thnBaris = parseInt(partTanggal[2]);

            // Filter: Ambil riwayat aktivitas murni di bulan berjalan
            if (blnBaris === bulanSekarang && thnBaris === tahunSekarang) {
                // Kita masukkan juga aktivitas bayar/tagih hutang piutang bulanan jika ada biar informatif
                let emoji = '';
                if (jenis === 'Pemasukan') emoji = '➕ [Pemasukan]';
                if (jenis === 'Pengeluaran') emoji = '➖ [Pengeluaran]';
                if (jenis === 'Hutang') emoji = '💸 [Hutang]';
                if (jenis === 'Piutang') emoji = '💼 [Piutang]';
                if (jenis === 'Bayar Hutang') emoji = '✅ [Bayar]';
                if (jenis === 'Tagih Piutang') emoji = '💰 [Tagih]';

                if (emoji !== '') {
                    teksRiwayat += `[${stringTanggal}] ${emoji} Rp ${nominal.toLocaleString('id-ID')} - ${keterangan}\n`;
                    adaTransaksi = true;
                }
            }
        });

        if (adaTransaksi) {
            teksRiwayat += `-----------------------------------------\n`;
            teksRiwayat += `📊 *Total Pemasukan Murni:* Rp ${saldoData.pemasukan.toLocaleString('id-ID')}\n`;
            teksRiwayat += `📉 *Total Pengeluaran Murni:* Rp ${saldoData.pengeluaran.toLocaleString('id-ID')}\n\n`;
            
            // LAMPIRAN REMINDER: Pengingat sisa hutang piutang global yang belum lunas
            teksRiwayat += `📌 *Pengingat Kewajiban (Sisa Belum Lunas):*\n`;
            teksRiwayat += `  🔺 Sisa Hutang Kamu: Rp ${saldoData.hutang.toLocaleString('id-ID')}\n`;
            teksRiwayat += `  🔹 Sisa Piutang di Orang: Rp ${saldoData.piutang.toLocaleString('id-ID')}\n\n`;
            
            teksRiwayat += `💳 *Sisa Saldo Fisik Saat Ini: Rp ${saldoData.total.toLocaleString('id-ID')}*\n\n`;
            teksRiwayat += `Yuk saling transparan biar ga boncos! 🤝✨`;
            
            msg.reply(teksRiwayat);
        } else {
            msg.reply(`📅 Di bulan ${namaBulanTeks} ini kamu belum mencatat aktivitas keuangan sama sekali.`);
        }
        return;
    }

    // 1c. COMMAND: !mingguan
    if (command === '!mingguan') {
        msg.reply(`Bentar ya ${namaUser}, lagi ngumpulin laporan transaksi 7 hari terakhir... 📅⏳`);
        
        const rows = await getSheetRows(namaUser);
        if (!rows || rows.length === 0) {
            msg.reply(`❌ Kamu belum pernah mencatat transaksi apa pun.`);
            return;
        }

        // Hitung rentang waktu: Hari ini sampai 7 hari yang lalu
        const hariIni = new Date();
        const tglTujuhHariLalu = new Date();
        tglTujuhHariLalu.setDate(hariIni.getDate() - 7);

        let teksRiwayat = `*===== 📊 REKAP 7 HARI TERAKHIR =====*\n` +
                          `⏱️ _${tglTujuhHariLalu.toLocaleDateString('id-ID')} s/d ${hariIni.toLocaleDateString('id-ID')}_\n\n`;
        
        let adaTransaksi = false;
        let totalPemasukanMingguan = 0;
        let totalPengeluaranMingguan = 0;

        rows.forEach((row) => {
            const stringTanggal = row[0]; // Kolom A
            const jenis = row[1];         // Kolom B
            const nominal = parseInt(row[2]) || 0; // Kolom C
            const keterangan = row[3] || 'Tanpa Keterangan'; // Kolom D

            if (!stringTanggal) return;

            const partTanggal = stringTanggal.split(/[-/]/);
            if (partTanggal.length < 3) return;

            // Bikin objek Date dari tanggal baris Sheets untuk dibandingkan
            const tglBarisObj = new Date(parseInt(partTanggal[2]), parseInt(partTanggal[1]) - 1, parseInt(partTanggal[0]));

            // Filter: Hanya ambil jika tanggal baris masuk dalam rentang 7 hari terakhir
            if (tglBarisObj >= tglTujuhHariLalu && tglBarisObj <= hariIni) {
                let emoji = '';
                if (jenis === 'Pemasukan') {
                    emoji = '➕ [Pemasukan]';
                    totalPemasukanMingguan += nominal;
                }
                if (jenis === 'Pengeluaran') {
                    emoji = '➖ [Pengeluaran]';
                    totalPengeluaranMingguan += nominal;
                }
                // Hutang/Piutang/Pay/Claim bulanan tetap dicatat riwayatnya jika ada aktivitas dalam minggu ini
                if (jenis === 'Hutang') emoji = '💸 [Hutang]';
                if (jenis === 'Piutang') emoji = '💼 [Piutang]';
                if (jenis === 'Bayar Hutang') emoji = '✅ [Bayar]';
                if (jenis === 'Tagih Piutang') emoji = '💰 [Tagih]';

                if (emoji !== '') {
                    teksRiwayat += `[${stringTanggal}] ${emoji} Rp ${nominal.toLocaleString('id-ID')} - ${keterangan}\n`;
                    adaTransaksi = true;
                }
            }
        });

        if (adaTransaksi) {
            teksRiwayat += `-----------------------------------------\n`;
            teksRiwayat += `📈 *Total Masuk (Minggu Ini):* Rp ${totalPemasukanMingguan.toLocaleString('id-ID')}\n`;
            teksRiwayat += `📉 *Total Keluar (Minggu Ini):* Rp ${totalPengeluaranMingguan.toLocaleString('id-ID')}\n\n`;
            
            // Kasih evaluasi/analisis tipis-tipis biar seru
            if (totalPengeluaranMingguan > totalPemasukanMingguan) {
                teksRiwayat += `⚠️ *Evaluasi:* Pengeluaran kamu lebih besar dari pemasukan minggu ini. Dompet mulai menipis, rem dikit jajannya Yuki! 🛒🛑`;
            } else {
                teksRiwayat += `✅ *Evaluasi:* Aman! Aliran kas minggu ini terkendali dengan baik. Pertahankan! 🏆✨`;
            }
            
            msg.reply(teksRiwayat);
        } else {
            msg.reply(`📅 Ngga ada aktivitas keuangan sama sekali dalam 7 hari terakhir.`);
        }
        return;
    }

    // 2. COMMAND: !add, !minus, !hutang, !piutang, !pay, ATAU !claim
    if (['!add', '!minus', '!hutang', '!piutang', '!pay', '!claim'].includes(command)) {
        
        if (parts.length < 3) {
            msg.reply(`Format salah! Contoh:\n• "!minus 25000 makan siang"\n• "!add 500000 uang jajan"\n• "!hutang 50000 pinjam dika"\n• "!pay 50000 bayar utang dika"\n• "!piutang 20000 dika minjam boba"\n• "!claim 20000 tagih boba dika"`);
            return;
        }

        const nominal = parts[1];      
        const keterangan = parts.slice(2).join(' '); 

        if (isNaN(nominal)) {
            msg.reply('Nominal harus berupa angka bulat tanpa titik/koma ya!');
            return;
        }

        // Tentukan jenis berdasarkan command untuk dicatat ke kolom Jenis di Sheets
        let jenis = '';
        if (command === '!add') jenis = 'Pemasukan';
        if (command === '!minus') jenis = 'Pengeluaran';
        if (command === '!hutang') jenis = 'Hutang';
        if (command === '!piutang') jenis = 'Piutang';
        if (command === '!pay') jenis = 'Bayar Hutang';
        if (command === '!claim') jenis = 'Tagih Piutang';

        msg.reply(`Siaapp, lagi memproses catatan untuk *${namaUser}*... ⏳`);

        // PENTING: Jalankan pengecekan tab dulu. Kalau belum ada, dibikin otomatis!
        const sheetSiap = await ensureSheetExists(namaUser);

        if (!sheetSiap) {
            msg.reply('❌ Gagal menyiapkan tab di Google Sheets. Coba cek terminal PC.');
            return;
        }

        // Jalankan append data seperti biasa
        const sukses = await appendToSheets(namaUser, jenis, parseInt(nominal), keterangan);

        if (sukses) {
            const saldoTerbaru = await getSaldoInfo(namaUser);
            let teksTambahanSaldo = '';
            
            if (saldoTerbaru && saldoTerbaru.ada) {
                teksTambahanSaldo = `\n\n💰 *Sisa Saldo ${namaUser}: Rp ${saldoTerbaru.total.toLocaleString('id-ID')}*`;
            }

            // Menyesuaikan teks judul notifikasi agar rapi pas !pay dan !claim
            let teksAksi = jenis;
            if (command === '!pay') teksAksi = '💸 Pembayaran Hutang';
            if (command === '!claim') teksAksi = '💼 Penagihan Piutang';

            msg.reply(`✅ Berhasil dicatat ke tab *${namaUser}*!\n\n📅 Tanggal: ${new Date().toLocaleDateString('id-ID')}\n✨ ${teksAksi}: Rp ${parseInt(nominal).toLocaleString('id-ID')}\n📝 Ket: ${keterangan}${teksTambahanSaldo}`);
        } else {
            msg.reply(`❌ Waduh, gagal memasukkan data ke Google Sheets.`);
        }
    }
});

client.initialize();