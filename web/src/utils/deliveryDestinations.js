export const MULTI_DELIVERY_NOTES_PREFIX = '[multi_delivery_v1]';
const DEFAULT_FEE = 100;

const toFiniteNumber = (value, fallback = 0) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

export const getItemQuantity = (item) => {
    const parsed = Number.parseInt(item?.qty ?? item?.quantity ?? 1, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

export const expandCheckoutItemsToUnits = (items = []) => (
    items.flatMap((item, itemIndex) => {
        const quantity = getItemQuantity(item);
        return Array.from({ length: quantity }, (_, unitIndex) => ({
            unitKey: `${itemIndex}-${unitIndex}`,
            itemIndex,
            itemName: item?.name || `Item ${itemIndex + 1}`,
            itemImage: item?.image_url || item?.image || item?.photo || null,
            productId: item?.id || item?.productId || null,
            price: toFiniteNumber(item?.price),
            unitNumber: unitIndex + 1,
            quantity,
        }));
    })
);

export const createDeliveryAssignments = (items = [], defaultAddressId = null) => (
    expandCheckoutItemsToUnits(items).map((unit) => ({
        ...unit,
        addressId: defaultAddressId ?? '',
    }))
);

export const syncDeliveryAssignments = (items = [], existingAssignments = [], defaultAddressId = null) => {
    const existingByKey = new Map(existingAssignments.map((assignment) => [assignment.unitKey, assignment]));

    return expandCheckoutItemsToUnits(items).map((unit) => {
        const existing = existingByKey.get(unit.unitKey);
        return {
            ...unit,
            addressId: existing?.addressId ?? defaultAddressId ?? '',
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
    subtotal,
    freeShippingThreshold,
    selectedAddressId,
    multiAddressEnabled,
    assignments = [],
    addressFeeMap = {},
}) => {
    if (deliveryMethod === 'pickup') {
        return 0;
    }

    if (toFiniteNumber(subtotal) >= toFiniteNumber(freeShippingThreshold)) {
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
                address_id: address?.id ?? null,
                address_label: address?.label || '',
                recipient_name: address?.name || '',
                recipient_phone: address?.phone || '',
                shipping_fee: toFiniteNumber(addressFeeMap[String(assignment.addressId)], DEFAULT_FEE),
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
        return {
            note: typeof payload?.note === 'string' ? payload.note : '',
            destinations: Array.isArray(payload?.destinations) ? payload.destinations : [],
            hasMultiDelivery: Array.isArray(payload?.destinations) && payload.destinations.length > 0,
        };
    } catch (error) {
        return {
            note: notes,
            destinations: [],
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

export const groupDeliveryDestinations = (destinations = []) => {
    const groups = new Map();

    (destinations || []).forEach((destination) => {
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
                assignedRiderIds: [],
            });
        }

        groups.get(groupKey).items.push({
            unitKey: destination?.unit_key,
            itemName: destination?.item_name || 'Item',
            unitNumber: destination?.unit_number || 1,
            quantity: destination?.quantity || 1,
        });

        if (destination?.assigned_rider_id) {
            const riderId = String(destination.assigned_rider_id);
            if (!groups.get(groupKey).assignedRiderIds.includes(riderId)) {
                groups.get(groupKey).assignedRiderIds.push(riderId);
            }
        }
    });

    return Array.from(groups.values());
};
