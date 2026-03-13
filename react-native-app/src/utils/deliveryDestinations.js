const MULTI_DELIVERY_NOTES_PREFIX = '[multi_delivery_v1]';

export const parseMultiDeliveryNotes = (notes) => {
    if (typeof notes !== 'string' || !notes.startsWith(MULTI_DELIVERY_NOTES_PREFIX)) {
        return {
            note: typeof notes === 'string' ? notes : '',
            destinations: [],
            hasMultiDelivery: false,
        };
    }

    try {
        const payload = JSON.parse(notes.slice(MULTI_DELIVERY_NOTES_PREFIX.length));
        const destinations = Array.isArray(payload?.destinations) ? payload.destinations : [];
        return {
            note: typeof payload?.note === 'string' ? payload.note : '',
            destinations,
            hasMultiDelivery: destinations.length > 0,
        };
    } catch (error) {
        return {
            note: notes,
            destinations: [],
            hasMultiDelivery: false,
        };
    }
};

const buildAddressText = (snapshot = {}) => (
    [snapshot.street, snapshot.barangay, snapshot.city, snapshot.province, snapshot.zip]
        .filter(Boolean)
        .join(', ')
);

export const groupDeliveryDestinations = (destinations = []) => {
    const groups = new Map();

    (destinations || []).forEach((destination) => {
        const snapshot = destination?.address_snapshot || {};
        const addressText = buildAddressText(snapshot);
        const groupKey = [
            destination?.address_id ?? '',
            destination?.recipient_name ?? '',
            destination?.recipient_phone ?? '',
            addressText,
        ].join('|');

        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                recipientName: destination?.recipient_name || '',
                recipientPhone: destination?.recipient_phone || '',
                addressText,
                items: [],
            });
        }

        groups.get(groupKey).items.push({
            itemName: destination?.item_name || 'Item',
            unitNumber: destination?.unit_number || 1,
        });
    });

    return Array.from(groups.values());
};
