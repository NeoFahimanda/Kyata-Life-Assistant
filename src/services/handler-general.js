const { getFinanceHelpMessage } = require("../features/finance/handler");
const { getTasksHelpMessage } = require("../features/tasks/handler");

function cleanUserName(rawName) {
    return (rawName || "").replace(/[/\\?*:[\]]/g, "").trim();
}

async function handleGeneral(msg) {
    const textRaw = msg.body.trim();
    const parts = textRaw.split(/\s+/);
    const command = parts[0].toLowerCase();

    if (command !== "!help" && command !== "@help") return false;

    const subCommand = parts[1] ? parts[1].toLowerCase() : null;
    const kontak = await msg.getContact();
    const namaUser = cleanUserName(kontak.pushname || kontak.number);

    if (!subCommand) {
        msg.reply(
            `*===== Kyata at Your Service! =====*\n` +
            `Hai *${namaUser}*! Gunakan perintah ini:\n` +
            `• \`!help duid\` untuk bantuan fitur keuangan\n` +
            `• \`!help task\` untuk bantuan fitur tugas\n` +
            `
Contoh: \`!help duid\``,
        );
        return true;
    }

    if (subCommand === "duid") {
        msg.reply(getFinanceHelpMessage(namaUser));
        return true;
    }

    if (subCommand === "task") {
        msg.reply(getTasksHelpMessage(namaUser));
        return true;
    }

    msg.reply(
        `⚠️ Sub-perintah *${subCommand}* tidak dikenali. Ketik \`!help\` untuk bantuan umum.`,
    );
    return true;
}

module.exports = { handleGeneral };