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

export const serializeMultiDeliveryNotes = ({ destinations = [], note = '' } = {}) => {
    const cleanDestinations = Array.isArray(destinations) ? destinations.filter(Boolean) : [];
    const cleanNote = String(note || '').trim();

    if (!cleanDestinations.length) {
        return cleanNote || null;
    }

    return `${MULTI_DELIVERY_NOTES_PREFIX}${JSON.stringify({
        note: cleanNote,
        destinations: cleanDestinations,
    })}`;
};

const buildAddressText = (snapshot = {}) => (
    [snapshot.street, snapshot.barangay, snapshot.city, snapshot.province, snapshot.zip]
        .filter(Boolean)
        .join(', ')
);

const buildDestinationGroupKey = (destination = {}) => {
    const snapshot = destination?.address_snapshot || {};
    const addressText = buildAddressText(snapshot);

    return [
        destination?.address_id ?? '',
        destination?.recipient_name ?? '',
        destination?.recipient_phone ?? '',
        addressText,
    ].join('|');
};

export const groupDeliveryDestinations = (destinations = []) => {
    const groups = new Map();

    (destinations || []).forEach((destination) => {
        const snapshot = destination?.address_snapshot || {};
        const addressText = buildAddressText(snapshot);
        const groupKey = buildDestinationGroupKey(destination);

        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                groupKey,
                addressId: destination?.address_id ?? null,
                recipientName: destination?.recipient_name || '',
                recipientPhone: destination?.recipient_phone || '',
                addressText,
                items: [],
                unitKeys: [],
                assignedRiderIds: [],
            });
        }

        const group = groups.get(groupKey);
        group.items.push({
            itemName: destination?.item_name || 'Item',
            unitNumber: destination?.unit_number || 1,
        });
        group.unitKeys.push(destination?.unit_key);

        if (destination?.assigned_rider_id) {
            const riderId = String(destination.assigned_rider_id);
            if (!group.assignedRiderIds.includes(riderId)) {
                group.assignedRiderIds.push(riderId);
            }
        }
    });

    return Array.from(groups.values());
};
