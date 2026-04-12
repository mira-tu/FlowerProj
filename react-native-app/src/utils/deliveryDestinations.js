const MULTI_DELIVERY_NOTES_PREFIX = '[multi_delivery_v1]';
export const DELIVERY_CONFIRMATION_OWNER = {
    CUSTOMER: 'customer',
    RIDER: 'rider',
};
export const DELIVERY_CONFIRMATION_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
};

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

const normalizeConfirmationOwner = (value, fallback = null) => {
    const normalized = String(value || '').trim().toLowerCase();

    if (normalized === DELIVERY_CONFIRMATION_OWNER.CUSTOMER || normalized === DELIVERY_CONFIRMATION_OWNER.RIDER) {
        return normalized;
    }

    return fallback;
};

const normalizeConfirmationStatus = (value, fallback = DELIVERY_CONFIRMATION_STATUS.PENDING) => {
    const normalized = String(value || '').trim().toLowerCase();

    if (normalized === DELIVERY_CONFIRMATION_STATUS.CONFIRMED) {
        return DELIVERY_CONFIRMATION_STATUS.CONFIRMED;
    }

    if (normalized === DELIVERY_CONFIRMATION_STATUS.PENDING) {
        return DELIVERY_CONFIRMATION_STATUS.PENDING;
    }

    return fallback;
};

export const normalizeDeliveryDestination = (destination = {}, index = 0) => {
    const confirmationOwner = normalizeConfirmationOwner(
        destination?.confirmation_owner ?? destination?.confirmationOwner,
        null
    );
    const confirmationStatus = normalizeConfirmationStatus(
        destination?.confirmation_status ?? destination?.confirmationStatus,
        confirmationOwner ? DELIVERY_CONFIRMATION_STATUS.PENDING : null
    );

    return {
        ...destination,
        unit_key: String(destination?.unit_key || destination?.unitKey || `stop-${index + 1}`).trim(),
        item_name: destination?.item_name || destination?.itemName || 'Item',
        quantity: Number.parseInt(destination?.quantity, 10) || 1,
        unit_number: Number.parseInt(destination?.unit_number ?? destination?.unitNumber, 10) || 1,
        unit_label: String(
            destination?.unit_label
            || destination?.unitLabel
            || `Unit ${Number.parseInt(destination?.unit_number ?? destination?.unitNumber, 10) || 1}`
        ).trim(),
        confirmation_owner: confirmationOwner,
        confirmation_status: confirmationStatus,
        confirmed_at: destination?.confirmed_at || destination?.confirmedAt || null,
        confirmed_by_actor: destination?.confirmed_by_actor || destination?.confirmedByActor || null,
        confirmed_by_user_id: destination?.confirmed_by_user_id || destination?.confirmedByUserId || null,
        proof_image_url: destination?.proof_image_url || destination?.proofImageUrl || null,
        proof_uploaded_at: destination?.proof_uploaded_at || destination?.proofUploadedAt || null,
        proof_note: destination?.proof_note || destination?.proofNote || '',
        addressText: buildAddressText(destination?.address_snapshot || {}),
    };
};

export const normalizeDeliveryDestinations = (destinations = []) => (
    (Array.isArray(destinations) ? destinations : [])
        .filter(Boolean)
        .map((destination, index) => normalizeDeliveryDestination(destination, index))
);

export const hasStopConfirmationFlow = (destinations = []) => (
    normalizeDeliveryDestinations(destinations).some((destination) => Boolean(destination.confirmation_owner))
);

export const isDeliveryStopConfirmed = (destination = {}) => (
    normalizeDeliveryDestination(destination).confirmation_status === DELIVERY_CONFIRMATION_STATUS.CONFIRMED
);

export const areAllDeliveryStopsConfirmed = (destinations = []) => {
    const normalizedStops = normalizeDeliveryDestinations(destinations).filter((destination) => destination.confirmation_owner);
    return normalizedStops.length > 0 && normalizedStops.every((destination) => isDeliveryStopConfirmed(destination));
};

export const confirmDeliveryStop = (
    destinations = [],
    unitKey,
    {
        actorType = 'customer',
        actorUserId = null,
        proofImageUrl = null,
        proofNote = '',
        confirmedAt = new Date().toISOString(),
    } = {}
) => normalizeDeliveryDestinations(destinations).map((destination) => {
    if (destination.unit_key !== String(unitKey || '').trim()) {
        return destination;
    }

    return {
        ...destination,
        confirmation_status: DELIVERY_CONFIRMATION_STATUS.CONFIRMED,
        confirmed_at: confirmedAt,
        confirmed_by_actor: actorType,
        confirmed_by_user_id: actorUserId || null,
        proof_image_url: proofImageUrl || destination.proof_image_url || null,
        proof_uploaded_at: proofImageUrl ? confirmedAt : (destination.proof_uploaded_at || null),
        proof_note: String(proofNote || destination.proof_note || '').trim(),
    };
});

export const getDeliveryStopDisplayLabel = (destination = {}, index = 0) => {
    const normalizedDestination = normalizeDeliveryDestination(destination, index);
    const itemName = String(normalizedDestination.item_name || 'Item').trim();
    const unitLabel = String(normalizedDestination.unit_label || '').trim();

    if (itemName && unitLabel) {
        return `${itemName} - ${unitLabel}`;
    }

    return unitLabel || itemName || `Stop ${index + 1}`;
};

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

    normalizeDeliveryDestinations(destinations).forEach((destination) => {
        const addressText = destination.addressText || buildAddressText(destination?.address_snapshot || {});
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
            unitLabel: destination?.unit_label || `Unit ${destination?.unit_number || 1}`,
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
