const db = require('../../services/database');

function getSaldoInfo(noHp, namaUser) {
    try {
        const sekarang = new Date();
        const tahunSekarang = sekarang.getFullYear();
        const bulanSekarangStr = String(sekarang.getMonth() + 1).padStart(2, '0');
        const rentangBulanIni = `${tahunSekarang}-${bulanSekarangStr}%`;

        // Filter pencarian diganti menggunakan user_id (yang nanti diisi nomor HP)
        const resBulanIni = db.prepare(`
            SELECT 
                SUM(CASE WHEN jenis = 'Pemasukan' THEN nominal ELSE 0 END) as pemasukan,
                SUM(CASE WHEN jenis = 'Pengeluaran' THEN nominal ELSE 0 END) as pengeluaran
            FROM expenses WHERE user_id = ? AND tanggal LIKE ?
        `).get(noHp, rentangBulanIni);

        const resHutangGlobal = db.prepare(`
            SELECT SUM(CASE WHEN jenis = 'Hutang' THEN nominal ELSE 0 END) - 
                   SUM(CASE WHEN jenis = 'Bayar Hutang' THEN nominal ELSE 0 END) as sisaHutang
            FROM expenses WHERE user_id = ?
        `).get(noHp);

        const resPiutangGlobal = db.prepare(`
            SELECT SUM(CASE WHEN jenis = 'Piutang' THEN nominal ELSE 0 END) - 
                   SUM(CASE WHEN jenis = 'Tagih Piutang' THEN nominal ELSE 0 END) as sisaPiutang
            FROM expenses WHERE user_id = ?
        `).get(noHp);

        const resSaldoFisik = db.prepare(`
            SELECT SUM(CASE WHEN jenis IN ('Pemasukan', 'Hutang', 'Tagih Piutang') THEN nominal ELSE 0 END) -
                   SUM(CASE WHEN jenis IN ('Pengeluaran', 'Piutang', 'Bayar Hutang') THEN nominal ELSE 0 END) as totalFisik
            FROM expenses WHERE user_id = ?
        `).get(noHp);

        return {
            pemasukan: resBulanIni.pemasukan || 0,
            pengeluaran: resBulanIni.pengeluaran || 0,
            hutang: resHutangGlobal.sisaHutang || 0,
            piutang: resPiutangGlobal.sisaPiutang || 0,
            total: resSaldoFisik.totalFisik || 0,
            namaBulan: sekarang.toLocaleDateString('id-ID', { month: 'long' })
        };
    } catch (error) {
        console.error('Error kalkulasi saldo SQLite:', error);
        return null;
    }
}

function insertTransaction(noHp, jenis, nominal, keterangan) {
    const stmt = db.prepare('INSERT INTO expenses (user_id, jenis, nominal, keterangan) VALUES (?, ?, ?, ?)');
    return stmt.run(noHp, jenis, nominal, keterangan);
}

function getBulananRows(noHp, rentangBulanIni) {
    return db.prepare(`
        SELECT strftime('%d/%m/%Y', tanggal) as tgl, jenis, nominal, keterangan 
        FROM expenses WHERE user_id = ? AND tanggal LIKE ? ORDER BY tanggal ASC
    `).all(noHp, rentangBulanIni);
}

function getMingguanRows(noHp) {
    return db.prepare(`
        SELECT strftime('%d/%m/%Y', tanggal) as tgl, jenis, nominal, keterangan 
        FROM expenses WHERE user_id = ? AND tanggal >= date('now', '-7 days', 'localtime') ORDER BY tanggal ASC
    `).all(noHp);
}

function clearFinanceData(noHp) {
    const stmt = db.prepare('DELETE FROM expenses WHERE user_id = ?');
    return stmt.run(noHp);
}

module.exports = {
    getSaldoInfo,
    insertTransaction,
    getBulananRows,
    getMingguanRows,
    clearFinanceData
};