export const MULTI_DELIVERY_NOTES_PREFIX = '[multi_delivery_v1]';
const DEFAULT_FEE = 100;
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

const toFiniteNumber = (value, fallback = 0) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toPositiveInteger = (value, fallback = 0) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeComparableText = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export const getItemQuantity = (item) => {
    const parsed = Number.parseInt(item?.qty ?? item?.quantity ?? 1, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

export const expandCheckoutItemsToUnits = (items = []) => (
    items.flatMap((item, itemIndex) => {
        const quantity = getItemQuantity(item);
        return Array.from({ length: quantity }, (_, unitIndex) => ({
            unitKey: String(
                item?.unit_key
                || item?.unitKey
                || `${itemIndex}-${unitIndex}`
            ),
            itemIndex,
            itemName: item?.name || `Item ${itemIndex + 1}`,
            itemImage: item?.image_url || item?.image || item?.photo || null,
            productId: item?.id || item?.productId || null,
            price: toFiniteNumber(item?.price),
            unitNumber: Number.parseInt(item?.unit_index ?? item?.unitIndex, 10) || unitIndex + 1,
            quantity: Number.parseInt(item?.unit_count ?? item?.unitCount, 10) || quantity,
            unitLabel: String(
                item?.unit_label
                || item?.unitLabel
                || (quantity > 1 ? `Unit ${Number.parseInt(item?.unit_index ?? item?.unitIndex, 10) || unitIndex + 1}` : 'Unit 1')
            ).trim(),
        }));
    })
);

export const getDefaultDeliveryConfirmationOwner = (addressId, defaultAddressId = null) => (
    String(addressId || '').trim()
    && String(addressId || '').trim() === String(defaultAddressId || '').trim()
        ? DELIVERY_CONFIRMATION_OWNER.CUSTOMER
        : DELIVERY_CONFIRMATION_OWNER.RIDER
);

const normalizeDeliveryConfirmationOwner = (value, fallback = null) => {
    const normalized = String(value || '').trim().toLowerCase();

    if (normalized === DELIVERY_CONFIRMATION_OWNER.CUSTOMER || normalized === DELIVERY_CONFIRMATION_OWNER.RIDER) {
        return normalized;
    }

    return fallback;
};

const normalizeDeliveryConfirmationStatus = (value, fallback = DELIVERY_CONFIRMATION_STATUS.PENDING) => {
    const normalized = String(value || '').trim().toLowerCase();

    if (normalized === DELIVERY_CONFIRMATION_STATUS.CONFIRMED) {
        return DELIVERY_CONFIRMATION_STATUS.CONFIRMED;
    }

    if (normalized === DELIVERY_CONFIRMATION_STATUS.PENDING) {
        return DELIVERY_CONFIRMATION_STATUS.PENDING;
    }

    return fallback;
};

const normalizeDeliveryStopStatus = (value, fallback = DELIVERY_STOP_STATUS.ACTIVE) => {
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

export const createDeliveryAssignments = (items = [], defaultAddressId = null) => (
    expandCheckoutItemsToUnits(items).map((unit) => ({
        ...unit,
        addressId: defaultAddressId ?? '',
        confirmationOwner: getDefaultDeliveryConfirmationOwner(defaultAddressId, defaultAddressId),
    }))
);

export const syncDeliveryAssignments = (items = [], existingAssignments = [], defaultAddressId = null) => {
    const existingByKey = new Map(existingAssignments.map((assignment) => [assignment.unitKey, assignment]));

    return expandCheckoutItemsToUnits(items).map((unit) => {
        const existing = existingByKey.get(unit.unitKey);
        return {
            ...unit,
            addressId: existing?.addressId ?? defaultAddressId ?? '',
            confirmationOwner: normalizeDeliveryConfirmationOwner(
                existing?.confirmationOwner,
                getDefaultDeliveryConfirmationOwner(
                    existing?.addressId ?? defaultAddressId,
                    defaultAddressId
                )
            ),
        };
    });
};

const normalizeBarangay = (value) => String(value || '').trim().toLowerCase();

export const buildAddressFeeMap = (addresses = [], feeRows = []) => {
    const feeLookup = new Map(
        (feeRows || []).map((row) => [normalizeBarangay(row?.barangay_name), toFiniteNumber(row?.delivery_fee, DEFAULT_FEE)])
    );

    return Object.fromEntries(
        (addresses || []).map((address) => {
            const barangayKey = normalizeBarangay(address?.barangay);
            return [String(address.id), feeLookup.get(barangayKey) ?? DEFAULT_FEE];
        })
    );
};

const uniqueAddressIds = (addressIds = []) => Array.from(
    new Set(
        addressIds
            .map((value) => String(value || '').trim())
            .filter(Boolean)
    )
);

export const calculateDeliveryFee = ({
    deliveryMethod,
    hasFreeShipping = false,
    selectedAddressId,
    multiAddressEnabled,
    assignments = [],
    addressFeeMap = {},
}) => {
    if (deliveryMethod === 'pickup') {
        return 0;
    }

    if (hasFreeShipping) {
        return 0;
    }

    const addressIds = multiAddressEnabled
        ? assignments.map((assignment) => assignment.addressId)
        : [selectedAddressId];

    return uniqueAddressIds(addressIds).reduce((sum, addressId) => (
        sum + toFiniteNumber(addressFeeMap[String(addressId)], DEFAULT_FEE)
    ), 0);
};

export const buildMultiDeliveryDestinations = ({
    assignments = [],
    addresses = [],
    addressFeeMap = {},
}) => {
    const addressById = Object.fromEntries((addresses || []).map((address) => [String(address.id), address]));

    return assignments
        .filter((assignment) => assignment.addressId)
        .map((assignment) => {
            const address = addressById[String(assignment.addressId)];
            return {
                unit_key: assignment.unitKey,
                item_index: assignment.itemIndex,
                item_name: assignment.itemName,
                product_id: assignment.productId,
                quantity: 1,
                unit_number: assignment.unitNumber,
                unit_label: assignment.unitLabel || (assignment.quantity > 1 ? `Unit ${assignment.unitNumber}` : 'Unit 1'),
                address_id: address?.id ?? null,
                address_label: address?.label || '',
                recipient_name: address?.name || '',
                recipient_phone: address?.phone || '',
                shipping_fee: toFiniteNumber(addressFeeMap[String(assignment.addressId)], DEFAULT_FEE),
                confirmation_owner: normalizeDeliveryConfirmationOwner(
                    assignment.confirmationOwner,
                    DELIVERY_CONFIRMATION_OWNER.RIDER
                ),
                confirmation_status: DELIVERY_CONFIRMATION_STATUS.PENDING,
                confirmed_at: null,
                confirmed_by_actor: null,
                confirmed_by_user_id: null,
                proof_image_url: null,
                proof_uploaded_at: null,
                proof_note: null,
                address_snapshot: address ? {
                    street: address.street || '',
                    barangay: address.barangay || '',
                    city: address.city || '',
                    province: address.province || '',
                    zip: address.zip || '',
                } : null,
            };
        });
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
        return {
            note: typeof payload?.note === 'string' ? payload.note : '',
            destinations: Array.isArray(payload?.destinations) ? payload.destinations : [],
            metadata: normalizeNotesMetadata(payload?.metadata),
            hasMultiDelivery: Array.isArray(payload?.destinations) && payload.destinations.length > 0,
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

export const parseOrderDeliveryDestinations = (order) => parseMultiDeliveryNotes(order?.notes).destinations;

const formatSnapshotAddress = (snapshot = {}) => (
    [snapshot.street, snapshot.barangay, snapshot.city, snapshot.province, snapshot.zip]
        .filter(Boolean)
        .join(', ')
);

export const formatDeliveryDestinationAddress = (destination = {}) => (
    formatSnapshotAddress(destination?.address_snapshot || {})
);

export const normalizeDeliveryDestination = (destination = {}, index = 0) => {
    const confirmationOwner = normalizeDeliveryConfirmationOwner(
        destination?.confirmation_owner ?? destination?.confirmationOwner,
        null
    );
    const confirmationStatus = normalizeDeliveryConfirmationStatus(
        destination?.confirmation_status ?? destination?.confirmationStatus,
        confirmationOwner ? DELIVERY_CONFIRMATION_STATUS.PENDING : null
    );
    const stopStatus = normalizeDeliveryStopStatus(
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
        confirmation_owner: confirmationOwner,
        confirmation_status: confirmationStatus,
        confirmed_at: destination?.confirmed_at || destination?.confirmedAt || null,
        confirmed_by_actor: destination?.confirmed_by_actor || destination?.confirmedByActor || null,
        confirmed_by_user_id: destination?.confirmed_by_user_id || destination?.confirmedByUserId || null,
        proof_image_url: destination?.proof_image_url || destination?.proofImageUrl || null,
        proof_uploaded_at: destination?.proof_uploaded_at || destination?.proofUploadedAt || null,
        proof_note: destination?.proof_note || destination?.proofNote || '',
        addressText: formatDeliveryDestinationAddress(destination),
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

export const areAllDeliveryStopsConfirmed = (destinations = []) => {
    const normalizedStops = normalizeDeliveryDestinations(destinations)
        .filter((destination) => destination.confirmation_owner && !isDeliveryStopCancelled(destination));
    return normalizedStops.length > 0 && normalizedStops.every((destination) => isDeliveryStopConfirmed(destination));
};

export const getDeliveryStopDisplayLabel = (destination = {}, index = 0) => {
    const normalized = normalizeDeliveryDestination(destination, index);
    return `${normalized.item_name} (${normalized.unit_label})`;
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

export const groupDeliveryDestinations = (destinations = []) => {
    const groups = new Map();

    normalizeDeliveryDestinations(destinations).forEach((destination) => {
        const snapshot = destination?.address_snapshot || {};
        const addressText = formatSnapshotAddress(snapshot);
        const groupKey = [
            destination?.address_id ?? '',
            destination?.recipient_name ?? '',
            destination?.recipient_phone ?? '',
            addressText,
        ].join('|');

        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                groupKey,
                addressId: destination?.address_id ?? null,
                addressLabel: destination?.address_label || '',
                recipientName: destination?.recipient_name || '',
                recipientPhone: destination?.recipient_phone || '',
                addressText,
                shippingFee: toFiniteNumber(destination?.shipping_fee),
                items: [],
                unitKeys: [],
                assignedRiderIds: [],
                activeItemCount: 0,
                cancelledItemCount: 0,
            });
        }

        const isCancelledStop = isDeliveryStopCancelled(destination);
        groups.get(groupKey).items.push({
            unitKey: destination?.unit_key,
            itemName: destination?.item_name || 'Item',
            unitNumber: destination?.unit_number || 1,
            unitLabel: destination?.unit_label || `Unit ${destination?.unit_number || 1}`,
            quantity: destination?.quantity || 1,
            stopStatus: isCancelledStop ? DELIVERY_STOP_STATUS.CANCELLED : DELIVERY_STOP_STATUS.ACTIVE,
            cancelledAt: destination?.cancelled_at || null,
            cancelledReason: destination?.cancelled_reason || '',
        });
        groups.get(groupKey).unitKeys.push(destination?.unit_key);
        if (isCancelledStop) {
            groups.get(groupKey).cancelledItemCount += 1;
        } else {
            groups.get(groupKey).activeItemCount += 1;
        }

        if (!isCancelledStop && destination?.assigned_rider_id) {
            const riderId = String(destination.assigned_rider_id);
            if (!groups.get(groupKey).assignedRiderIds.includes(riderId)) {
                groups.get(groupKey).assignedRiderIds.push(riderId);
            }
        }
    });

    return Array.from(groups.values());
};
