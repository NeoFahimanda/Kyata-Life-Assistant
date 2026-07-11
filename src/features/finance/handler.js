const repo = require("./repository");

async function handleFinance(msg) {
  const textRaw = msg.body.trim();
  const parts = textRaw.split(/\s+/);
  const command = parts[0].toLowerCase();

  const validCommands = [
    "!saldo",
    "!add",
    "!minus",
    "!hutang",
    "!piutang",
    "!pay",
    "!claim",
    "!bulanan",
    "!mingguan",
    "!help",
    "!reset",
    "!sync",
    "!split",
    "!undo",
    "!setup",
  ];
  if (!validCommands.includes(command)) return false;

  // KUNCI UTAMA: Ambil nomor HP unik & bersihkan nama profil untuk sapaan teks
  const kontak = await msg.getContact();
  const noHp = kontak.number; // Ini yang masuk ke Database (Stabil & Permanen)
  let namaUser = kontak.pushname || kontak.number;
  namaUser = namaUser.replace(/[/\\?*:[\]]/g, ""); // Ini murni untuk sapaan teks chat

  // 0. COMMAND: !help
  if (command === "!help") {
    msg.reply(
      `*===== COMMAND LIST BOT E.T. =====*\n` +
        `Halo *${namaUser}*! Berikut adalah daftar perintah lengkap finansial kamu:\n\n` +
        `• \`!saldo\`\n• \`!add [nominal] [keterangan]\`\n• \`!minus [nominal] [keterangan]\`\n` +
        `• \`!hutang [nominal] [keterangan]\`\n• \`!pay [nominal] [keterangan]\`\n` +
        `• \`!piutang [nominal] [keterangan]\`\n• \`!claim [nominal] [keterangan]\`\n• \`!undo\`\n` +
        `• \`!mingguan\`\n• \`!bulanan\`\n• \`!reset\`\n• \`!sync\`\n• \`!split [id] [nominal] [keterangan]\`\n` +
        `• \`!setup remind duid [on/off]\`\n• \`!setup remind duid [on/off] [daily/weekly]\`\n` +
        `• \`!setup remind duid day [0-6]\`\n• \`!setup remind duid time [HH:MM]\``,
    );
    return true;
  }

  // 1. COMMAND: !saldo
  if (command === "!saldo") {
    msg.reply(`Bentar ya ${namaUser}, lagi ngecek saldo kamu... 📊⏳`);
    const s = repo.getSaldoInfo(noHp);
    if (s) {
      msg.reply(
        `*===== Ringkasan Dompet ${namaUser} =====*\n\n` +
          `📅 *Riwayat Bulan ${s.namaBulan}:*\n` +
          `  ➕ Pemasukan: Rp ${s.pemasukan.toLocaleString("id-ID")} (+ Rp ${s.piutang.toLocaleString("id-ID")} Piutang)\n` +
          `  ➖ Pengeluaran: Rp ${s.pengeluaran.toLocaleString("id-ID")} (+ Rp ${s.hutang.toLocaleString("id-ID")} Hutang)\n\n` +
          `⏳ *Transaksi Tertunda:*\n` +
          `  💸 Hutang: Rp ${s.hutang.toLocaleString("id-ID")}\n` +
          `  💼 Piutang: Rp ${s.piutang.toLocaleString("id-ID")}\n` +
          `-----------------------------------------\n` +
          `💳 *Sisa Saldo Fisik Saat Ini: Rp ${s.total.toLocaleString("id-ID")}*\n\nSemangat ngaturnya! 💪✨`,
      );
    }
    return true;
  }

  // 2. COMMAND: !bulanan
  if (command === "!bulanan") {
    msg.reply(
      `Bentar ya ${namaUser}, lagi ngumpulin riwayat transaksi bulan ini... 📅⏳`,
    );
    const sekarang = new Date();
    const namaBulanTeks = sekarang.toLocaleDateString("id-ID", {
      month: "long",
    });
    const rentangBulanIni = `${sekarang.getFullYear()}-${String(sekarang.getMonth() + 1).padStart(2, "0")}%`;

    try {
      const rows = repo.getBulananRows(noHp, rentangBulanIni);
      const s = repo.getSaldoInfo(noHp);

      if (rows.length === 0) {
        msg.reply(
          `📅 Di bulan ${namaBulanTeks} ini kamu belum mencatat aktivitas keuangan sama sekali.`,
        );
        return true;
      }

      let teksRiwayat = `*===== 📝 TRACKING BULAN ${namaBulanTeks.toUpperCase()} =====*\n\n`;
      rows.forEach((row) => {
        let emoji = "";
        if (row.jenis === "Pemasukan") emoji = "➕ [Pemasukan]";
        if (row.jenis === "Pengeluaran") emoji = "➖ [Pengeluaran]";
        if (row.jenis === "Hutang") emoji = "💸 [Hutang]";
        if (row.jenis === "Piutang") emoji = "💼 [Piutang]";
        if (row.jenis === "Bayar Hutang") emoji = "✅ [Bayar]";
        if (row.jenis === "Tagih Piutang") emoji = "💰 [Tagih]";

        teksRiwayat += `[${row.tgl}] ${emoji} Rp ${row.nominal.toLocaleString("id-ID")} - ${row.keterangan}\n`;
      });

      teksRiwayat +=
        `-----------------------------------------\n` +
        `📊 *Total Pemasukan Murni:* Rp ${s.pemasukan.toLocaleString("id-ID")}\n` +
        `📉 *Total Pengeluaran Murni:* Rp ${s.pengeluaran.toLocaleString("id-ID")}\n\n` +
        `💳 *Sisa Saldo Fisik Saat Ini: Rp ${s.total.toLocaleString("id-ID")}*`;
      msg.reply(teksRiwayat);
    } catch (err) {
      msg.reply("❌ Gagal menarik riwayat bulanan.");
    }
    return true;
  }

  // 3. COMMAND: !mingguan
  if (command === "!mingguan") {
    msg.reply(
      `Bentar ya ${namaUser}, lagi ngumpulin laporan transaksi 7 hari terakhir... 📅⏳`,
    );
    try {
      const rows = repo.getMingguanRows(noHp);
      if (rows.length === 0) {
        msg.reply(
          `📅 Ngga ada aktivitas keuangan sama sekali dalam 7 hari terakhir.`,
        );
        return true;
      }

      let teksRiwayat = `*===== 📊 REKAP 7 HARI TERAKHIR =====*\n\n`;
      let totalPemasukanMingguan = 0;
      let totalPengeluaranMingguan = 0;

      rows.forEach((row) => {
        let emoji = "";
        if (row.jenis === "Pemasukan") {
          emoji = "➕ [Pemasukan]";
          totalPemasukanMingguan += row.nominal;
        }
        if (row.jenis === "Pengeluaran") {
          emoji = "➖ [Pengeluaran]";
          totalPengeluaranMingguan += row.nominal;
        }
        if (row.jenis === "Hutang") emoji = "💸 [Hutang]";
        if (row.jenis === "Piutang") emoji = "💼 [Piutang]";
        if (row.jenis === "Bayar Hutang") emoji = "✅ [Bayar]";
        if (row.jenis === "Tagih Piutang") emoji = "💰 [Tagih]";

        teksRiwayat += `[${row.tgl}] ${emoji} Rp ${row.nominal.toLocaleString("id-ID")} - ${row.keterangan}\n`;
      });

      teksRiwayat +=
        `-----------------------------------------\n` +
        `📈 *Total Masuk:* Rp ${totalPemasukanMingguan.toLocaleString("id-ID")}\n` +
        `📉 *Total Keluar:* Rp ${totalPengeluaranMingguan.toLocaleString("id-ID")}\n\n`;

      teksRiwayat +=
        totalPengeluaranMingguan > totalPemasukanMingguan
          ? `⚠️ *Evaluasi:* Pengeluaran lebih besar dari pemasukan. Rem dikit jajannya ${namaUser}! 🛒🛑`
          : `✅ *Evaluasi:* Aman! Aliran kas minggu ini terkendali dengan baik. Pertahankan! 🏆✨`;

      msg.reply(teksRiwayat);
    } catch (err) {
      msg.reply("❌ Gagal menarik rekap mingguan.");
    }
    return true;
  }

  // 4. COMMAND MUTASI DATA (!add, !minus, !hutang, !piutang, !pay, !claim)
  if (
    ["!add", "!minus", "!hutang", "!piutang", "!pay", "!claim"].includes(
      command,
    )
  ) {
    if (parts.length < 3) {
      msg.reply(`Format salah! Contoh: "!minus 25000 makan siang"`);
      return true;
    }

    const nominalRaw = parts[1];
    const keterangan = parts.slice(2).join(" ");

    if (isNaN(nominalRaw)) {
      msg.reply("Nominal harus berupa angka bulat ya!");
      return true;
    }

    const nominal = parseInt(nominalRaw);
    let jenis = "";
    let teksAksi = "";
    if (command === "!add") {
      jenis = "Pemasukan";
      teksAksi = "Pemasukan";
    }
    if (command === "!minus") {
      jenis = "Pengeluaran";
      teksAksi = "Pengeluaran";
    }
    if (command === "!hutang") {
      jenis = "Hutang";
      teksAksi = "Hutang";
    }
    if (command === "!piutang") {
      jenis = "Piutang";
      teksAksi = "Piutang";
    }
    if (command === "!pay") {
      jenis = "Bayar Hutang";
      teksAksi = "💸 Pembayaran Hutang";
    }
    if (command === "!claim") {
      jenis = "Tagih Piutang";
      teksAksi = "💼 Penagihan Piutang";
    }

    msg.reply(`Siaapp, lagi memproses catatan... ⏳`);

    try {
      repo.insertTransaction(noHp, jenis, nominal, keterangan);
      const s = repo.getSaldoInfo(noHp);
      msg.reply(
        `✅ Berhasil dicatat ke Database!\n\n✨ ${teksAksi}: Rp ${nominal.toLocaleString("id-ID")}\n📝 Ket: ${keterangan}\n\n💰 *Sisa Saldo Kamu: Rp ${s.total.toLocaleString("id-ID")}*`,
      );
    } catch (error) {
      msg.reply("❌ Gagal menyimpan mutasi transaksi.");
    }
    return true;
  }

  // 5. COMMAND: !reset
  if (command === "!reset") {
    try {
      repo.clearFinanceData(noHp);
      msg.reply(
        `🗑️ *Database Keuangan Bersih!* Semua riwayat transaksi kamu berhasil dihapus.`,
      );
    } catch (error) {
      msg.reply("❌ Gagal mereset data keuangan.");
    }
    return true;
  }

  // ==================== COMMAND: !sync ====================
  if (command === "!sync") {
    if (parts.length < 2) {
      try {
        const syncRows = repo.getAllSyncRows(noHp);

        if (syncRows.length === 0) {
          msg.reply(
            `🎉 *Semua transaksi kamu sudah rapi!* Tidak ada dana penyeimbang saldo yang menggantung saat ini.\n\n💡 *Tips:* Jika ingin mencocokkan saldo dompet aslimu dengan database, gunakan perintah:\n\`!sync [nominal_uang_asli]\``,
          );
          return true;
        }

        let teksList = `*🔍 DAFTAR ID PENDING SPLIT (${namaUser})* \n`;
        teksList += `Berikut adalah dana penyeimbang saldo yang belum kamu pecah:\n\n`;

        syncRows.forEach((row) => {
          let emoji = row.jenis === "Pemasukan" ? "➕" : "➖";
          teksList += `📌 *ID: ${row.id}* [${row.tgl}]\n   ${emoji} Rp ${row.nominal.toLocaleString("id-ID")} (${row.keterangan})\n\n`;
        });

        teksList += `-----------------------------------------\n`;
        teksList += `💡 *Cara memecah transaksi:* \n\`!split [ID] [nominal] [keterangan]\`\n\n`;
        teksList += `💡 *Cara sinkronisasi saldo baru:* \n\`!sync [nominal_uang_asli]\``;

        msg.reply(teksList);
      } catch (error) {
        console.error(error);
        msg.reply("❌ Gagal menarik daftar pending split.");
      }
      return true;
    }

    const nominalRaw = parts[1];
    if (isNaN(nominalRaw)) {
      msg.reply(
        'Nominal saldo harus berupa angka bulat ya! Contoh: "!sync 500000"',
      );
      return true;
    }

    const saldoAsliFisik = parseInt(nominalRaw);
    const s = repo.getSaldoInfo(noHp);

    if (!s) {
      msg.reply("❌ Gagal memeriksa saldo database sebelum sinkronisasi.");
      return true;
    }

    const saldoDiDatabase = s.total;
    const selisih = saldoAsliFisik - saldoDiDatabase;

    if (selisih === 0) {
      msg.reply(
        `📊 Saldo database kamu sudah cocok dengan dompet aslimu (Rp ${saldoAsliFisik.toLocaleString("id-ID")}). Gak perlu disinkronkan lagi! ✨`,
      );
      return true;
    }

    msg.reply(`Memproses penyesuaian saldo... 🔄⏳`);

    try {
      let jenis = selisih > 0 ? "Pemasukan" : "Pengeluaran";
      let nominalMutlak = Math.abs(selisih);

      const result = repo.insertTransaction(
        noHp,
        jenis,
        nominalMutlak,
        `[Auto-Adjustment Saldo]`,
      );
      const idBaru = result.lastInsertRowid;

      repo.updateTransactionNominal(
        idBaru,
        nominalMutlak,
        `[ID: ${idBaru}] Auto-Adjustment Saldo`,
      );

      msg.reply(
        `✅ *SINKRONISASI SALDO BERHASIL!*\n\n` +
          `💰 Saldo Sekarang: Rp ${saldoAsliFisik.toLocaleString("id-ID")}\n` +
          `⚖️ Penyesuaian (${jenis}): Rp ${nominalMutlak.toLocaleString("id-ID")}\n` +
          `📌 *ID Transaksi Penyeimbang: ${idBaru}*\n\n` +
          `*Tips:* Kalau nanti kamu ingat detail belanjanya, pecah transaksi ini menggunakan perintah:\n` +
          `\`!split ${idBaru} [nominal] [keterangan]\` (Atau ketik \`!sync\` untuk melihat daftar ID)`,
      );
    } catch (error) {
      console.error(error);
      msg.reply("❌ Gagal mengeksekusi sinkronisasi saldo.");
    }
    return true;
  }

  // ==================== COMMAND: !split ====================
  if (command === "!split") {
    if (parts.length < 4 || isNaN(parts[1]) || isNaN(parts[2])) {
      msg.reply(
        'Format salah! Contoh: "!split [id_lama] [nominal_baru] [keterangan]"',
      );
      return true;
    }

    const idTarget = parseInt(parts[1]);
    const nominalPecahan = parseInt(parts[2]);
    const keteranganPecahan = parts.slice(3).join(" ");

    try {
      const txLama = repo.getTransactionById(idTarget, noHp);

      if (!txLama) {
        msg.reply(
          `❌ Transaksi dengan ID ${idTarget} tidak ditemukan di database kamu.`,
        );
        return true;
      }

      if (nominalPecahan > txLama.nominal) {
        msg.reply(
          `⚠️ Nominal pecahan (Rp ${nominalPecahan.toLocaleString("id-ID")}) tidak boleh lebih besar dari nominal sisa di ID ${idTarget} (Rp ${txLama.nominal.toLocaleString("id-ID")}).`,
        );
        return true;
      }

      msg.reply(`Sedang memecah transaksi... 🛠️⏳`);

      repo.insertTransaction(
        noHp,
        txLama.jenis,
        nominalPecahan,
        keteranganPecahan,
      );

      const sisaNominalInduk = txLama.nominal - nominalPecahan;

      if (sisaNominalInduk === 0) {
        repo.deleteTransaction(idTarget);
        msg.reply(
          `✅ Sempurna! Seluruh nominal pada ID ${idTarget} telah berhasil dipecah murni menjadi *${keteranganPecahan}*. Transaksi penyeimbang induk otomatis dihapus.`,
        );
      } else {
        repo.updateTransactionNominal(
          idTarget,
          sisaNominalInduk,
          `[ID: ${idTarget}] Auto-Adjustment Saldo (Sisa Pecahan)`,
        );
        msg.reply(
          `✅ Transaksi Berhasil Dipecah!\n\n` +
            `📝 Berhasil mendaftarkan: Rp ${nominalPecahan.toLocaleString("id-ID")} - ${keteranganPecahan}\n` +
            `📉 Sisa dana yang belum didaftarkan pada ID ${idTarget} kini tinggal: *Rp ${sisaNominalInduk.toLocaleString("id-ID")}*`,
        );
      }
    } catch (error) {
      console.error(error);
      msg.reply("❌ Gagal memproses pemecahan transaksi.");
    }
    return true;
  }

  // ==================== COMMAND: !undo ====================
  if (command === "!undo") {
    msg.reply(`Membatalkan transaksi terakhir kamu... ⏳🔄`);

    try {
      const txTerakhir = repo.getLastTransaction(noHp);

      if (!txTerakhir) {
        msg.reply(
          `❌ Kamu belum mencatat transaksi apa pun di bulan ini. Nggak ada yang bisa di-undo!`,
        );
        return true;
      }

      repo.deleteTransaction(txTerakhir.id);
      const s = repo.getSaldoInfo(noHp);

      msg.reply(
        `🗑️ *UNDO BERHASIL!*\n\n` +
          `Catatan terakhir kamu berikut telah dihapus dari database:\n` +
          `• *[${txTerakhir.jenis}]* Rp ${txTerakhir.nominal.toLocaleString("id-ID")} (${txTerakhir.keterangan})\n\n` +
          `💰 Sisa saldo fisik kamu sekarang: *Rp ${s.total.toLocaleString("id-ID")}*`,
      );
    } catch (error) {
      console.error(error);
      msg.reply("❌ Gagal mengeksekusi perintah undo.");
    }
    return true;
  }

  // ==================== 6. COMMAND: !setup ====================
  if (command === "!setup") {
    if (parts.length < 4) {
      msg.reply(
        "Format salah! Gunakan perintah berikut:\n" +
          "• `!setup remind duid on` atau `off`\n" +
          "• `!setup remind duid on daily` atau `weekly`\n" +
          "• `!setup remind duid day [0-6]` (0=Minggu, 1=Senin, 5=Jumat)\n" +
          "• `!setup remind duid time [HH:MM]` (Contoh: `17:00`)",
      );
      return true;
    }

    const fitur = parts[1].toLowerCase();
    const subFitur = parts[2].toLowerCase();
    const opsi = parts[3].toLowerCase();
    const chatId = msg.from; // ID Chat (Mendeteksi Grup / Personal)

    if (fitur === "remind" && subFitur === "duid") {
      // JALUR 1: Mengatur Hari (Day) -> Contoh: !setup remind duid day 5
      if (opsi === "day") {
        const hari = parts[4];
        if (!hari || isNaN(hari) || hari < 0 || hari > 6) {
          msg.reply(
            "⚠️ Pilihan hari salah. Harus angka 0 sampai 6! (0=Minggu, 1=Senin, 5=Jumat, 6=Sabtu)",
          );
          return true;
        }
        try {
          repo.saveConfigDay(chatId, hari);
          const namaHari = [
            "Minggu",
            "Senin",
            "Selasa",
            "Rabu",
            "Kamis",
            "Jumat",
            "Sabtu",
          ];
          msg.reply(
            `⚙️ *Setup Berhasil!* Hari pengingat mingguan diubah ke hari *${namaHari[hari]}*.`,
          );
        } catch (error) {
          msg.reply("❌ Gagal menyimpan konfigurasi hari.");
        }
        return true;
      }

      // JALUR 2: Mengatur Jam (Time) -> Contoh: !setup remind duid time 17:30
      if (opsi === "time") {
        const waktu = parts[4];
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!waktu || !timeRegex.test(waktu)) {
          msg.reply(
            "⚠️ Format jam salah! Gunakan format 24 jam seperti `17:00` atau `08:30`.",
          );
          return true;
        }
        try {
          repo.saveConfigTime(chatId, waktu);
          msg.reply(
            `⚙️ *Setup Berhasil!* Jam pengingat keuangan diubah ke pukul *${waktu}*.`,
          );
        } catch (error) {
          msg.reply("❌ Gagal menyimpan konfigurasi jam.");
        }
        return true;
      }

      // JALUR 3: Mengatur On/Off Status & Tipe -> Contoh: !setup remind duid on daily
      if (opsi === "on" || opsi === "off") {
        const statusValue = opsi === "on" ? 1 : 0;

        if (parts[4]) {
          const tipe = parts[4].toLowerCase();
          if (tipe !== "daily" && tipe !== "weekly") {
            msg.reply("⚠️ Tipe pengingat harus berupa *daily* atau *weekly*.");
            return true;
          }
          try {
            repo.saveConfig(chatId, statusValue);
            repo.saveConfigType(chatId, tipe);
            msg.reply(
              `⚙️ *Setup Berhasil!* Pengingat keuangan untuk chat ini telah diaktifkan (*ON*) dengan tipe: *${tipe.toUpperCase()}*`,
            );
          } catch (error) {
            msg.reply("❌ Gagal menyimpan konfigurasi tipe.");
          }
          return true;
        }

        try {
          repo.saveConfig(chatId, statusValue);
          msg.reply(
            `⚙️ *Setup Berhasil!* Reminder pengingat uang untuk chat ini telah diubah menjadi: *${opsi.toUpperCase()}*`,
          );
        } catch (error) {
          msg.reply("❌ Gagal menyimpan konfigurasi status.");
        }
        return true;
      }
    }
  }
  return false;
}

module.exports = { handleFinance };
