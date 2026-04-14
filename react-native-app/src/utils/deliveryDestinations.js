const MULTI_DELIVERY_NOTES_PREFIX = '[multi_delivery_v1]';
export const DELIVERY_CONFIRMATION_OWNER = {
    CUSTOMER: 'customer',
    RIDER: 'rider',
};
export const DELIVERY_CONFIRMATION_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
};
export const DELIVERY_STOP_STATUS = {
    ACTIVE: 'active',
    CANCELLED: 'cancelled',
};

const normalizeNotesMetadata = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const cleanedEntries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
    if (!cleanedEntries.length) {
        return null;
    }

    return Object.fromEntries(cleanedEntries);
};

export const parseMultiDeliveryNotes = (notes) => {
    if (typeof notes !== 'string' || !notes.startsWith(MULTI_DELIVERY_NOTES_PREFIX)) {
        return {
            note: typeof notes === 'string' ? notes : '',
            destinations: [],
            metadata: null,
            hasMultiDelivery: false,
        };
    }

    try {
        const payload = JSON.parse(notes.slice(MULTI_DELIVERY_NOTES_PREFIX.length));
        const destinations = Array.isArray(payload?.destinations) ? payload.destinations : [];
        return {
            note: typeof payload?.note === 'string' ? payload.note : '',
            destinations,
            metadata: normalizeNotesMetadata(payload?.metadata),
            hasMultiDelivery: destinations.length > 0,
        };
    } catch (error) {
        return {
            note: notes,
            destinations: [],
            metadata: null,
            hasMultiDelivery: false,
        };
    }
};

export const serializeMultiDeliveryNotes = ({ destinations = [], note = '', metadata = null } = {}) => {
    const cleanDestinations = Array.isArray(destinations) ? destinations.filter(Boolean) : [];
    const cleanNote = String(note || '').trim();
    const cleanMetadata = normalizeNotesMetadata(metadata);

    if (!cleanDestinations.length && !cleanMetadata) {
        return cleanNote || null;
    }

    return `${MULTI_DELIVERY_NOTES_PREFIX}${JSON.stringify({
        note: cleanNote,
        destinations: cleanDestinations,
        metadata: cleanMetadata,
    })}`;
};

const buildAddressText = (snapshot = {}) => (
    [snapshot.street, snapshot.barangay, snapshot.city, snapshot.province, snapshot.zip]
        .filter(Boolean)
        .join(', ')
);

const toPositiveInteger = (value, fallback = 0) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeComparableText = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

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

const normalizeStopStatus = (value, fallback = DELIVERY_STOP_STATUS.ACTIVE) => {
    const normalized = String(value || '').trim().toLowerCase();

    if (normalized === DELIVERY_STOP_STATUS.CANCELLED) {
        return DELIVERY_STOP_STATUS.CANCELLED;
    }

    if (normalized === DELIVERY_STOP_STATUS.ACTIVE) {
        return DELIVERY_STOP_STATUS.ACTIVE;
    }

    return fallback;
};

const getRawItemOriginalQuantity = (item = {}) => {
    const candidates = [
        item?.original_quantity,
        item?.quantity,
        item?.qty,
        item?.arrangementQuantity,
        item?.arrangement_quantity,
        item?.unit_count,
        item?.unitCount,
    ];

    for (const candidate of candidates) {
        const parsed = toPositiveInteger(candidate, 0);
        if (parsed > 0) {
            return parsed;
        }
    }

    return 1;
};

const getRawItemCancelledQuantity = (item = {}) => {
    const originalQuantity = getRawItemOriginalQuantity(item);
    const parsed = toPositiveInteger(item?.cancelled_quantity ?? item?.cancelledQuantity, 0);
    return Math.min(parsed, originalQuantity);
};

const getRawItemIndex = (item = {}, fallbackIndex = 0) => {
    const candidates = [
        item?.item_index,
        item?.itemIndex,
        item?.displayIndex != null ? Number(item.displayIndex) - 1 : null,
    ];

    for (const candidate of candidates) {
        const parsed = Number.parseInt(candidate, 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
            return parsed;
        }
    }

    return fallbackIndex;
};

const getRawItemProductId = (item = {}) => {
    const rawValue = item?.product_id ?? item?.productId ?? item?.id ?? null;
    const normalized = String(rawValue || '').trim();
    return normalized || null;
};

const getRawItemName = (item = {}) => (
    String(item?.item_name || item?.name || item?.title || '').trim()
);

const buildCancellationItemSummaries = (items = []) => (
    (Array.isArray(items) ? items : [])
        .filter(Boolean)
        .map((item, index) => ({
            itemIndex: getRawItemIndex(item, index),
            cancelledQuantity: getRawItemCancelledQuantity(item),
            productId: getRawItemProductId(item),
            itemName: getRawItemName(item),
        }))
);

const sortStopsForCancellation = (stops = []) => (
    [...stops].sort((left, right) => {
        const unitNumberDifference = (Number(right?.unit_number || 0) - Number(left?.unit_number || 0));
        if (unitNumberDifference !== 0) {
            return unitNumberDifference;
        }

        return String(right?.unit_key || '').localeCompare(String(left?.unit_key || ''));
    })
);

const getMatchingStopsForItem = (destinations = [], itemSummary = {}) => {
    const normalizedStops = Array.isArray(destinations) ? destinations : [];
    const normalizedItemName = normalizeComparableText(itemSummary?.itemName);

    let matches = normalizedStops.filter((destination) => (
        Number.isFinite(itemSummary?.itemIndex)
        && destination?.item_index === itemSummary.itemIndex
    ));

    if (!matches.length && itemSummary?.productId) {
        matches = normalizedStops.filter((destination) => (
            String(destination?.product_id || '').trim() === itemSummary.productId
        ));
    }

    if (!matches.length && normalizedItemName) {
        matches = normalizedStops.filter((destination) => (
            normalizeComparableText(destination?.item_name) === normalizedItemName
        ));
    }

    return sortStopsForCancellation(matches);
};

export const normalizeDeliveryDestination = (destination = {}, index = 0) => {
    const assignedRiderId = String(
        destination?.assigned_rider_id
        ?? destination?.assignedRiderId
        ?? destination?.assigned_rider
        ?? destination?.assignedRider
        ?? ''
    ).trim() || null;
    const confirmationOwner = normalizeConfirmationOwner(
        destination?.confirmation_owner ?? destination?.confirmationOwner,
        null
    );
    const confirmationStatus = normalizeConfirmationStatus(
        destination?.confirmation_status ?? destination?.confirmationStatus,
        confirmationOwner ? DELIVERY_CONFIRMATION_STATUS.PENDING : null
    );
    const stopStatus = normalizeStopStatus(
        destination?.stop_status ?? destination?.stopStatus,
        DELIVERY_STOP_STATUS.ACTIVE
    );

    return {
        ...destination,
        unit_key: String(destination?.unit_key || destination?.unitKey || `stop-${index + 1}`).trim(),
        item_index: Number.isFinite(Number.parseInt(destination?.item_index ?? destination?.itemIndex, 10))
            ? Number.parseInt(destination?.item_index ?? destination?.itemIndex, 10)
            : null,
        item_name: destination?.item_name || destination?.itemName || 'Item',
        product_id: destination?.product_id ?? destination?.productId ?? null,
        quantity: Number.parseInt(destination?.quantity, 10) || 1,
        unit_number: Number.parseInt(destination?.unit_number ?? destination?.unitNumber, 10) || 1,
        unit_label: String(
            destination?.unit_label
            || destination?.unitLabel
            || `Unit ${Number.parseInt(destination?.unit_number ?? destination?.unitNumber, 10) || 1}`
        ).trim(),
        stop_status: stopStatus,
        cancelled_at: destination?.cancelled_at || destination?.cancelledAt || null,
        cancelled_reason: String(destination?.cancelled_reason || destination?.cancelledReason || '').trim(),
        assigned_rider_id: assignedRiderId,
        assignedRiderId: assignedRiderId,
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

export const isDeliveryStopCancelled = (destination = {}) => (
    normalizeDeliveryDestination(destination).stop_status === DELIVERY_STOP_STATUS.CANCELLED
);

export const reconcileDeliveryDestinationsWithItems = (destinations = [], items = []) => {
    const normalizedStops = normalizeDeliveryDestinations(destinations);
    if (!normalizedStops.length) {
        return [];
    }

    const derivedCancelledKeys = new Set();
    const itemSummaries = buildCancellationItemSummaries(items);

    itemSummaries.forEach((itemSummary) => {
        if (!itemSummary?.cancelledQuantity) {
            return;
        }

        const matchingStops = getMatchingStopsForItem(normalizedStops, itemSummary);
        if (!matchingStops.length) {
            return;
        }

        const explicitCancelledCount = matchingStops.filter((stop) => isDeliveryStopCancelled(stop)).length;
        const targetCancelledCount = Math.min(
            matchingStops.length,
            Math.max(itemSummary.cancelledQuantity, explicitCancelledCount)
        );

        matchingStops.slice(0, targetCancelledCount).forEach((stop) => {
            derivedCancelledKeys.add(stop.unit_key);
        });
    });

    return normalizedStops.map((stop) => {
        const isCancelled = isDeliveryStopCancelled(stop) || derivedCancelledKeys.has(stop.unit_key);
        return {
            ...stop,
            stop_status: isCancelled ? DELIVERY_STOP_STATUS.CANCELLED : DELIVERY_STOP_STATUS.ACTIVE,
            cancelled_at: isCancelled ? (stop.cancelled_at || null) : null,
            cancelled_reason: isCancelled ? String(stop.cancelled_reason || '').trim() : '',
        };
    });
};

export const cancelDeliveryStopsForItem = (
    destinations = [],
    {
        existingItems = [],
        targetItemIndex = null,
        targetProductId = null,
        targetItemName = '',
        quantityToCancel = 1,
        cancelledAt = new Date().toISOString(),
        cancelledReason = '',
    } = {}
) => {
    const normalizedStops = reconcileDeliveryDestinationsWithItems(destinations, existingItems);
    if (!normalizedStops.length) {
        return [];
    }

    const matchingStops = getMatchingStopsForItem(normalizedStops, {
        itemIndex: Number.isFinite(targetItemIndex) ? targetItemIndex : null,
        productId: targetProductId ? String(targetProductId).trim() : null,
        itemName: targetItemName,
    }).filter((stop) => !isDeliveryStopCancelled(stop));

    const stopKeysToCancel = new Set(
        matchingStops
            .slice(0, Math.max(0, Number.parseInt(quantityToCancel, 10) || 0))
            .map((stop) => stop.unit_key)
    );

    return normalizedStops.map((stop) => (
        stopKeysToCancel.has(stop.unit_key)
            ? {
                ...stop,
                stop_status: DELIVERY_STOP_STATUS.CANCELLED,
                cancelled_at: cancelledAt,
                cancelled_reason: String(cancelledReason || '').trim(),
            }
            : stop
    ));
};

export const getDeliveryStopCounts = (destinations = []) => {
    const normalizedStops = normalizeDeliveryDestinations(destinations);

    return normalizedStops.reduce((summary, stop) => {
        if (isDeliveryStopCancelled(stop)) {
            summary.cancelledCount += 1;
        } else {
            summary.activeCount += 1;
        }
        return summary;
    }, {
        totalCount: normalizedStops.length,
        activeCount: 0,
        cancelledCount: 0,
    });
};

export const hasStopConfirmationFlow = (destinations = []) => (
    normalizeDeliveryDestinations(destinations).some((destination) => Boolean(destination.confirmation_owner))
);

export const isDeliveryStopConfirmed = (destination = {}) => (
    normalizeDeliveryDestination(destination).confirmation_status === DELIVERY_CONFIRMATION_STATUS.CONFIRMED
);

export const getDeliveryStopAssignedRiderId = (destination = {}, fallbackAssignedRiderId = null) => {
    const normalizedDestination = normalizeDeliveryDestination(destination);
    const assignedRiderId = String(
        normalizedDestination?.assigned_rider_id
        ?? normalizedDestination?.assignedRiderId
        ?? normalizedDestination?.assigned_rider
        ?? normalizedDestination?.assignedRider
        ?? fallbackAssignedRiderId
        ?? ''
    ).trim();

    return assignedRiderId || null;
};

export const canCurrentUserCompleteRiderStop = (
    destination = {},
    currentUserId = null,
    currentRecordStatus = '',
    fallbackAssignedRiderId = null
) => {
    const normalizedDestination = normalizeDeliveryDestination(destination);
    const normalizedRecordStatus = String(currentRecordStatus || '').trim().toLowerCase();
    const assignedRiderId = getDeliveryStopAssignedRiderId(normalizedDestination, fallbackAssignedRiderId);
    const normalizedCurrentUserId = String(currentUserId || '').trim();

    if (normalizedDestination.confirmation_owner !== DELIVERY_CONFIRMATION_OWNER.RIDER) {
        return false;
    }

    if (isDeliveryStopCancelled(normalizedDestination)) {
        return false;
    }

    if (normalizedDestination.confirmation_status === DELIVERY_CONFIRMATION_STATUS.CONFIRMED) {
        return false;
    }

    if (normalizedRecordStatus !== 'out_for_delivery') {
        return false;
    }

    return Boolean(assignedRiderId && normalizedCurrentUserId && assignedRiderId === normalizedCurrentUserId);
};

export const areAllDeliveryStopsConfirmed = (destinations = []) => {
    const normalizedStops = normalizeDeliveryDestinations(destinations)
        .filter((destination) => destination.confirmation_owner && !isDeliveryStopCancelled(destination));
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

    if (isDeliveryStopCancelled(destination)) {
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
                activeItemCount: 0,
                cancelledItemCount: 0,
            });
        }

        const group = groups.get(groupKey);
        const isCancelledStop = isDeliveryStopCancelled(destination);
        group.items.push({
            unitKey: destination?.unit_key,
            itemName: destination?.item_name || 'Item',
            unitNumber: destination?.unit_number || 1,
            unitLabel: destination?.unit_label || `Unit ${destination?.unit_number || 1}`,
            stopStatus: isCancelledStop ? DELIVERY_STOP_STATUS.CANCELLED : DELIVERY_STOP_STATUS.ACTIVE,
            cancelledAt: destination?.cancelled_at || null,
            cancelledReason: destination?.cancelled_reason || '',
        });
        group.unitKeys.push(destination?.unit_key);
        if (isCancelledStop) {
            group.cancelledItemCount += 1;
        } else {
            group.activeItemCount += 1;
        }

        const assignedRiderId = getDeliveryStopAssignedRiderId(destination);
        if (!isCancelledStop && assignedRiderId) {
            const riderId = String(assignedRiderId);
            if (!group.assignedRiderIds.includes(riderId)) {
                group.assignedRiderIds.push(riderId);
            }
        }
    });

    return Array.from(groups.values());
};
