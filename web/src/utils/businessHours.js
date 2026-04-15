export const PICKUP_TIME_OPTIONS = [
    '7:00 AM',
    '8:00 AM',
    '9:00 AM',
    '10:00 AM',
    '11:00 AM',
    '12:00 PM',
    '1:00 PM',
    '2:00 PM',
    '3:00 PM',
    '4:00 PM',
    '5:00 PM',
    '6:00 PM',
];

export const CUSTOM_ORDER_TIME_MIN = '07:00';
export const CUSTOM_ORDER_TIME_MAX = '18:00';
export const BUSINESS_HOURS_LABEL = '7:00 AM - 6:00 PM';

const toLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const getEarliestPickupDate = () => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 1);
    return toLocalDateString(date);
};

export const isPickupDateSelectable = (value) => {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) {
        return false;
    }

    const selectedDate = new Date(`${normalizedValue}T00:00:00`);
    if (Number.isNaN(selectedDate.getTime())) {
        return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate <= today) {
        return false;
    }

    const day = selectedDate.getDay();
    return day !== 0 && day !== 6;
};

export const isWithinBusinessHours = (timeValue) => {
    if (!timeValue || typeof timeValue !== 'string') {
        return false;
    }

    const [hours, minutes] = timeValue.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        return false;
    }

    const totalMinutes = (hours * 60) + minutes;
    const startMinutes = 7 * 60;
    const endMinutes = 18 * 60;

    return totalMinutes >= startMinutes && totalMinutes <= endMinutes;
};
