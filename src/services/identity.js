function normalizePhoneNumber(value) {
    let phone = String(value || "").replace(/\D/g, "");
    if (phone.startsWith("0")) phone = `62${phone.slice(1)}`;
    if (phone.length < 8 || phone.length > 15) return null;
    return phone;
}

function taskUserIdFromPhone(phone) {
    return `${phone}@c.us`;
}

module.exports = { normalizePhoneNumber, taskUserIdFromPhone };