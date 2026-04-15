const normalizeRiderId = (value) => String(value || '').trim();
const hasExplicitDestinationAssignments = (destinations = []) => (
  (Array.isArray(destinations) ? destinations : []).some(
    (destination) => Boolean(normalizeRiderId(destination?.assigned_rider_id))
  )
);

const toPositiveInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const buildAddressText = (snapshot = {}) => (
  [snapshot.street, snapshot.barangay, snapshot.city, snapshot.province, snapshot.zip]
    .filter(Boolean)
    .join(', ')
);

export const getAssignedDestinationsForRider = (destinations = [], riderId) => {
  const normalizedRiderId = normalizeRiderId(riderId);
  if (!normalizedRiderId) return [];

  return (Array.isArray(destinations) ? destinations : []).filter(
    (destination) => normalizeRiderId(destination?.assigned_rider_id) === normalizedRiderId
  );
};

export const getAssignedItemIndexesForRider = (destinations = [], riderId) => Array.from(
  new Set(
    getAssignedDestinationsForRider(destinations, riderId)
      .map((destination) => Number.parseInt(destination?.item_index, 10))
      .filter((value) => Number.isFinite(value) && value >= 0)
  )
);

export const filterItemsByAssignedIndexes = (items = [], assignedItemIndexes = []) => {
  if (!Array.isArray(items)) return [];
  if (!assignedItemIndexes.length) return [];

  const allowedIndexes = new Set(assignedItemIndexes.map((value) => Number(value)));
  return items.filter((_, index) => allowedIndexes.has(index));
};

export const aggregateAssignedOrderItems = (items = [], assignedDestinations = []) => {
  const sourceItems = Array.isArray(items) ? items : [];
  const destinations = Array.isArray(assignedDestinations) ? assignedDestinations : [];
  if (!destinations.length) return [];

  const aggregated = new Map();

  destinations.forEach((destination) => {
    const itemIndex = Number.parseInt(destination?.item_index, 10);
    const sourceByIndex = Number.isFinite(itemIndex) ? sourceItems[itemIndex] : null;
    const destinationProductId = destination?.product_id != null ? String(destination.product_id) : '';
    const sourceByProductId = destinationProductId
      ? sourceItems.find((item) => String(item?.product_id ?? item?.productId ?? '') === destinationProductId)
      : null;
    const sourceItem = sourceByIndex || sourceByProductId || null;

    const key = Number.isFinite(itemIndex)
      ? `item-index:${itemIndex}`
      : `product:${destinationProductId || sourceItem?.name || destination?.item_name || 'unknown'}`;

    if (!aggregated.has(key)) {
      aggregated.set(key, {
        product_id: sourceItem?.product_id ?? sourceItem?.productId ?? destination?.product_id ?? null,
        name: sourceItem?.name || destination?.item_name || 'Item',
        image_url:
          sourceItem?.image_url
          || sourceItem?.products?.image_url
          || sourceItem?.image
          || sourceItem?.photo
          || null,
        price: Number(sourceItem?.price || 0),
        quantity: 0,
        products: sourceItem?.products || null,
      });
    }

    const current = aggregated.get(key);
    current.quantity += toPositiveInt(destination?.quantity, 1);

    if (
      !current.image_url
      && (sourceItem?.image_url || sourceItem?.products?.image_url || sourceItem?.image || sourceItem?.photo)
    ) {
      current.image_url =
        sourceItem.image_url
        || sourceItem.products?.image_url
        || sourceItem.image
        || sourceItem.photo;
    }

    if (!current.products && sourceItem?.products) {
      current.products = sourceItem.products;
    }

    if (!current.price && Number(sourceItem?.price || 0) > 0) {
      current.price = Number(sourceItem.price);
    }
  });

  return Array.from(aggregated.values());
};

export const buildAssignedShippingAddress = (destinations = []) => {
  const firstDestination = (Array.isArray(destinations) ? destinations : [])[0] || null;
  if (!firstDestination?.address_snapshot) return null;

  return {
    description: buildAddressText(firstDestination.address_snapshot),
    snapshot: firstDestination.address_snapshot,
    recipient_name: firstDestination.recipient_name || '',
    recipient_phone: firstDestination.recipient_phone || '',
  };
};

export const shouldRestrictOrderToAssignedRider = (order) => {
  if (!order) return false;

  const destinations = Array.isArray(order.multi_delivery_destinations)
    ? order.multi_delivery_destinations
    : [];

  if (destinations.length) {
    return hasExplicitDestinationAssignments(destinations);
  }

  return Boolean(normalizeRiderId(order.assigned_rider));
};

export const filterOrderForAssignedRider = (order, riderId) => {
  if (!order) return null;

  const normalizedRiderId = normalizeRiderId(riderId);
  if (!normalizedRiderId) return order;

  const destinations = Array.isArray(order.multi_delivery_destinations)
    ? order.multi_delivery_destinations
    : [];

  if (destinations.length) {
    const assignedDestinations = getAssignedDestinationsForRider(destinations, normalizedRiderId);
    if (!assignedDestinations.length) return null;

    const filteredItems = aggregateAssignedOrderItems(order.items || [], assignedDestinations);
    const assignedShippingAddress = buildAssignedShippingAddress(assignedDestinations);

    return {
      ...order,
      multi_delivery_destinations: assignedDestinations,
      items: filteredItems,
      shipping_address: assignedShippingAddress || order.shipping_address || null,
    };
  }

  return normalizeRiderId(order.assigned_rider) === normalizedRiderId ? order : null;
};

export const filterRequestDataForAssignedRider = (requestData = {}, riderId) => {
  const normalizedRiderId = normalizeRiderId(riderId);
  const sourceData = requestData && typeof requestData === 'object' ? requestData : {};
  if (!normalizedRiderId) {
    return {
      requestData: sourceData,
      assignedDestinations: [],
      assignedItemIndexes: [],
    };
  }

  const destinations = Array.isArray(sourceData.multi_delivery_destinations)
    ? sourceData.multi_delivery_destinations
    : [];

  if (!destinations.length) {
    return {
      requestData: sourceData,
      assignedDestinations: [],
      assignedItemIndexes: [],
    };
  }

  const assignedDestinations = getAssignedDestinationsForRider(destinations, normalizedRiderId);
  const assignedItemIndexes = getAssignedItemIndexesForRider(destinations, normalizedRiderId);

  return {
    requestData: {
      ...sourceData,
      multi_delivery_destinations: assignedDestinations,
      items: Array.isArray(sourceData.items)
        ? filterItemsByAssignedIndexes(sourceData.items, assignedItemIndexes)
        : sourceData.items,
    },
    assignedDestinations,
    assignedItemIndexes,
  };
};

export const filterRequestForAssignedRider = (request, riderId, parseRequestData) => {
  if (!request) return null;

  const normalizedRiderId = normalizeRiderId(riderId);
  if (!normalizedRiderId) return request;

  const parsedRequestData = parseRequestData ? parseRequestData(request.data) : request.data;
  const { requestData: filteredRequestData, assignedDestinations } = filterRequestDataForAssignedRider(
    parsedRequestData,
    normalizedRiderId
  );

  if (assignedDestinations.length) {
    return {
      ...request,
      data: filteredRequestData,
    };
  }

  return normalizeRiderId(request.assigned_rider) === normalizedRiderId ? request : null;
};

export const shouldRestrictRequestToAssignedRider = (request, parseRequestData) => {
  if (!request) return false;

  const parsedRequestData = parseRequestData ? parseRequestData(request.data) : request.data;
  const destinations = Array.isArray(parsedRequestData?.multi_delivery_destinations)
    ? parsedRequestData.multi_delivery_destinations
    : [];

  if (destinations.length) {
    return hasExplicitDestinationAssignments(destinations);
  }

  return Boolean(normalizeRiderId(request.assigned_rider));
};
