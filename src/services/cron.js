const fs = require("fs");
const path = require("path");

function initAllCrons(client) {
  console.log(
    "⏰ [CRON SYSTEM] Menginisialisasi sistem penjadwalan otomatis...",
  );

  const featuresDir = path.join(__dirname, "../features");

  // Membaca semua direktori fitur (finance, tasks, dll)
  fs.readdirSync(featuresDir).forEach((feature) => {
    const cronPath = path.join(featuresDir, feature, "cron.js");

    // Jika fitur memiliki berkas cron.js sendiri, daftarkan otomatis
    if (fs.existsSync(cronPath)) {
      try {
        const { initCron } = require(cronPath);
        initCron(client);
        console.log(
          `✅ [CRON SYSTEM] Berhasil mendaftarkan Cron untuk fitur: ${feature}`,
        );
      } catch (error) {
        console.error(
          `❌ [CRON SYSTEM] Gagal memuat Cron untuk fitur ${feature}:`,
          error,
        );
      }
    }
  });
}

module.exports = { initAllCrons };
