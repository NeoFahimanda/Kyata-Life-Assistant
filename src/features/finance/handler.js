const repo = require('./repository');

async function handleFinance(msg) {
    const textRaw = msg.body.trim();
    const parts = textRaw.split(/\s+/);
    const command = parts[0].toLowerCase();

    const validCommands = ['!saldo', '!add', '!minus', '!hutang', '!piutang', '!pay', '!claim', '!bulanan', '!mingguan', '!help', '!reset'];
    if (!validCommands.includes(command)) return false;

    // KUNCI UTAMA: Ambil nomor HP unik & bersihkan nama profil untuk sapaan teks
    const kontak = await msg.getContact();
    const noHp = kontak.number; // Ini yang masuk ke Database (Stabil & Permanen)
    let namaUser = kontak.pushname || kontak.number; 
    namaUser = namaUser.replace(/[/\\?*:[\]]/g, ''); // Ini murni untuk sapaan teks chat

    // 0. COMMAND: !help
    if (command === '!help') {
        msg.reply(
            `*===== COMMAND LIST BOT E.T. =====*\n` +
            `Halo *${namaUser}*! Berikut adalah daftar perintah lengkap finansial kamu:\n\n` +
            `• \`!saldo\`\n• \`!add [nominal] [keterangan]\`\n• \`!minus [nominal] [keterangan]\`\n` +
            `• \`!hutang [nominal] [keterangan]\`\n• \`!pay [nominal] [keterangan]\`\n` +
            `• \`!piutang [nominal] [keterangan]\`\n• \`!claim [nominal] [keterangan]\`\n` +
            `• \`!mingguan\`\n• \`!bulanan\`\n• \`!reset\``
        );
        return true;
    }

    // 1. COMMAND: !saldo
    if (command === '!saldo') {
        msg.reply(`Bentar ya ${namaUser}, lagi ngecek saldo kamu... 📊⏳`);
        const s = repo.getSaldoInfo(noHp);
        if (s) {
            msg.reply(
                `*===== Ringkasan Dompet ${namaUser} =====*\n\n` +
                `📅 *Riwayat Bulan ${s.namaBulan}:*\n` +
                `  ➕ Pemasukan: Rp ${s.pemasukan.toLocaleString('id-ID')} (+ Rp ${s.piutang.toLocaleString('id-ID')} Piutang)\n` +
                `  ➖ Pengeluaran: Rp ${s.pengeluaran.toLocaleString('id-ID')} (+ Rp ${s.hutang.toLocaleString('id-ID')} Hutang)\n\n` +
                `⏳ *Transaksi Tertunda:*\n` +
                `  💸 Hutang: Rp ${s.hutang.toLocaleString('id-ID')}\n` +
                `  💼 Piutang: Rp ${s.piutang.toLocaleString('id-ID')}\n` +
                `-----------------------------------------\n` +
                `💳 *Sisa Saldo Fisik Saat Ini: Rp ${s.total.toLocaleString('id-ID')}*\n\nSemangat ngaturnya! 💪✨`
            );
        }
        return true;
    }

    // 2. COMMAND: !bulanan
    if (command === '!bulanan') {
        msg.reply(`Bentar ya ${namaUser}, lagi ngumpulin riwayat transaksi bulan ini... 📅⏳`);
        const sekarang = new Date();
        const namaBulanTeks = sekarang.toLocaleDateString('id-ID', { month: 'long' });
        const rentangBulanIni = `${sekarang.getFullYear()}-${String(sekarang.getMonth() + 1).padStart(2, '0')}%`;

        try {
            const rows = repo.getBulananRows(noHp, rentangBulanIni);
            const s = repo.getSaldoInfo(noHp);

            if (rows.length === 0) {
                msg.reply(`📅 Di bulan ${namaBulanTeks} ini kamu belum mencatat aktivitas keuangan sama sekali.`);
                return true;
            }

            let teksRiwayat = `*===== 📝 TRACKING BULAN ${namaBulanTeks.toUpperCase()} =====*\n\n`;
            rows.forEach(row => {
                let emoji = '';
                if (row.jenis === 'Pemasukan') emoji = '➕ [Pemasukan]';
                if (row.jenis === 'Pengeluaran') emoji = '➖ [Pengeluaran]';
                if (row.jenis === 'Hutang') emoji = '💸 [Hutang]';
                if (row.jenis === 'Piutang') emoji = '💼 [Piutang]';
                if (row.jenis === 'Bayar Hutang') emoji = '✅ [Bayar]';
                if (row.jenis === 'Tagih Piutang') emoji = '💰 [Tagih]';

                teksRiwayat += `[${row.tgl}] ${emoji} Rp ${row.nominal.toLocaleString('id-ID')} - ${row.keterangan}\n`;
            });

            teksRiwayat += `-----------------------------------------\n` +
                           `📊 *Total Pemasukan Murni:* Rp ${s.pemasukan.toLocaleString('id-ID')}\n` +
                           `📉 *Total Pengeluaran Murni:* Rp ${s.pengeluaran.toLocaleString('id-ID')}\n\n` +
                           `💳 *Sisa Saldo Fisik Saat Ini: Rp ${s.total.toLocaleString('id-ID')}*`;
            msg.reply(teksRiwayat);
        } catch (err) {
            msg.reply('❌ Gagal menarik riwayat bulanan.');
        }
        return true;
    }

    // 3. COMMAND: !mingguan
    if (command === '!mingguan') {
        msg.reply(`Bentar ya ${namaUser}, lagi ngumpulin laporan transaksi 7 hari terakhir... 📅⏳`);
        try {
            const rows = repo.getMingguanRows(noHp);
            if (rows.length === 0) {
                msg.reply(`📅 Ngga ada aktivitas keuangan sama sekali dalam 7 hari terakhir.`);
                return true;
            }

            let teksRiwayat = `*===== 📊 REKAP 7 HARI TERAKHIR =====*\n\n`;
            let totalPemasukanMingguan = 0;
            let totalPengeluaranMingguan = 0;

            rows.forEach(row => {
                let emoji = '';
                if (row.jenis === 'Pemasukan') { emoji = '➕ [Pemasukan]'; totalPemasukanMingguan += row.nominal; }
                if (row.jenis === 'Pengeluaran') { emoji = '➖ [Pengeluaran]'; totalPengeluaranMingguan += row.nominal; }
                if (row.jenis === 'Hutang') emoji = '💸 [Hutang]';
                if (row.jenis === 'Piutang') emoji = '💼 [Piutang]';
                if (row.jenis === 'Bayar Hutang') emoji = '✅ [Bayar]';
                if (row.jenis === 'Tagih Piutang') emoji = '💰 [Tagih]';

                teksRiwayat += `[${row.tgl}] ${emoji} Rp ${row.nominal.toLocaleString('id-ID')} - ${row.keterangan}\n`;
            });

            teksRiwayat += `-----------------------------------------\n` +
                           `📈 *Total Masuk:* Rp ${totalPemasukanMingguan.toLocaleString('id-ID')}\n` +
                           `📉 *Total Keluar:* Rp ${totalPengeluaranMingguan.toLocaleString('id-ID')}\n\n`;

            teksRiwayat += (totalPengeluaranMingguan > totalPemasukanMingguan) 
                ? `⚠️ *Evaluasi:* Pengeluaran lebih besar dari pemasukan. Rem dikit jajannya ${namaUser}! 🛒🛑`
                : `✅ *Evaluasi:* Aman! Aliran kas minggu ini terkendali dengan baik. Pertahankan! 🏆✨`;

            msg.reply(teksRiwayat);
        } catch (err) {
            msg.reply('❌ Gagal menarik rekap mingguan.');
        }
        return true;
    }

    // 4. COMMAND MUTASI DATA (!add, !minus, !hutang, !piutang, !pay, !claim)
    if (['!add', '!minus', '!hutang', '!piutang', '!pay', '!claim'].includes(command)) {
        if (parts.length < 3) {
            msg.reply(`Format salah! Contoh: "!minus 25000 makan siang"`);
            return true;
        }

        const nominalRaw = parts[1];
        const keterangan = parts.slice(2).join(' ');

        if (isNaN(nominalRaw)) {
            msg.reply('Nominal harus berupa angka bulat ya!');
            return true;
        }

        const nominal = parseInt(nominalRaw);
        let jenis = '';
        let teksAksi = '';
        if (command === '!add') { jenis = 'Pemasukan'; teksAksi = 'Pemasukan'; }
        if (command === '!minus') { jenis = 'Pengeluaran'; teksAksi = 'Pengeluaran'; }
        if (command === '!hutang') { jenis = 'Hutang'; teksAksi = 'Hutang'; }
        if (command === '!piutang') { jenis = 'Piutang'; teksAksi = 'Piutang'; }
        if (command === '!pay') { jenis = 'Bayar Hutang'; teksAksi = '💸 Pembayaran Hutang'; }
        if (command === '!claim') { jenis = 'Tagih Piutang'; teksAksi = '💼 Penagihan Piutang'; }

        msg.reply(`Siaapp, lagi memproses catatan... ⏳`);

        try {
            repo.insertTransaction(noHp, jenis, nominal, keterangan);
            const s = repo.getSaldoInfo(noHp);
            msg.reply(`✅ Berhasil dicatat ke Database!\n\n✨ ${teksAksi}: Rp ${nominal.toLocaleString('id-ID')}\n📝 Ket: ${keterangan}\n\n💰 *Sisa Saldo Kamu: Rp ${s.total.toLocaleString('id-ID')}*`);
        } catch (error) {
            msg.reply('❌ Gagal menyimpan mutasi transaksi.');
        }
        return true;
    }

    // 5. COMMAND: !reset
    if (command === '!reset') {
        try {
            repo.clearFinanceData(noHp);
            msg.reply(`🗑️ *Database Keuangan Bersih!* Semua riwayat transaksi kamu berhasil dihapus.`);
        } catch (error) {
            msg.reply('❌ Gagal mereset data keuangan.');
        }
        return true;
    }

    return false;
}

module.exports = { handleFinance };