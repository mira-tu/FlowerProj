export const formatPhoneNumber = (value) => {
    if (!value) return '';
    const phoneNumber = value.replace(/[^\d]/g, ''); // Remove all non-digit characters
    const phoneNumberLength = phoneNumber.length;

    if (phoneNumberLength < 5) return phoneNumber; // 0917
    if (phoneNumberLength < 8) { // 0917-123
        return `${phoneNumber.slice(0, 4)}-${phoneNumber.slice(4)}`;
    }
    // 0917-123-4567
    return `${phoneNumber.slice(0, 4)}-${phoneNumber.slice(4, 7)}-${phoneNumber.slice(7, 11)}`;
};
