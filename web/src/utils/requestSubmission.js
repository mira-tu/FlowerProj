const normalizeName = (value) => String(value || '').trim().toLowerCase();

const splitCountAcrossTargets = (total, targetCount) => {
  const safeTotal = Math.max(0, Number.parseInt(total, 10) || 0);
  const safeTargetCount = Math.max(0, Number.parseInt(targetCount, 10) || 0);

  if (!safeTotal || !safeTargetCount) {
    return [];
  }

  const base = Math.floor(safeTotal / safeTargetCount);
  let remainder = safeTotal % safeTargetCount;

  return Array.from({ length: safeTargetCount }, () => {
    const next = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }
    return next;
  });
};

const collectBookingFlowerDemand = (items = []) => {
  const demandByName = new Map();

  (Array.isArray(items) ? items : []).forEach((item, itemIndex) => {
    const arrangementSelections = Array.isArray(item?.arrangementSelections) ? item.arrangementSelections : [];

    arrangementSelections.forEach((selection, selectionIndex) => {
      const preferredFlowerNames = Array.isArray(selection?.preferred_flowers)
        ? selection.preferred_flowers
        : Array.isArray(selection?.preferredFlowers)
          ? selection.preferredFlowers
          : [];
      const normalizedNames = preferredFlowerNames
        .map((name) => String(name || '').trim())
        .filter(Boolean);
      const totalFlowers = Number.parseInt(selection?.total_flowers || selection?.totalFlowers || 0, 10) || 0;

      if (!normalizedNames.length || totalFlowers <= 0) {
        return;
      }

      const splitCounts = splitCountAcrossTargets(totalFlowers, normalizedNames.length);
      normalizedNames.forEach((flowerName, nameIndex) => {
        const count = splitCounts[nameIndex] || 0;
        if (!count) {
          return;
        }

        const key = normalizeName(flowerName);
        const existing = demandByName.get(key) || {
          flowerName,
          quantity: 0,
          itemIndexes: new Set(),
          arrangementIndexes: new Set(),
        };
        existing.quantity += count;
        existing.itemIndexes.add(itemIndex);
        existing.arrangementIndexes.add(selectionIndex);
        demandByName.set(key, existing);
      });
    });
  });

  return demandByName;
};

export const resolveBookingRequestStockReservations = async ({
  supabase,
  items = [],
}) => {
  const flowerDemand = collectBookingFlowerDemand(items);
  const flowerNames = Array.from(flowerDemand.keys());

  if (!supabase || !flowerNames.length) {
    return [];
  }

  const { data: stockRows, error } = await supabase
    .from('stock_products')
    .select('id, name, category')
    .eq('category', 'Flowers');

  if (error) {
    console.error('Error resolving booking flower stock rows:', error);
    return [];
  }

  const stockByName = new Map(
    (stockRows || []).map((row) => [normalizeName(row.name), row])
  );

  return flowerNames.reduce((reservations, flowerKey) => {
    const stockRow = stockByName.get(flowerKey);
    const demand = flowerDemand.get(flowerKey);

    if (!stockRow || !demand?.quantity) {
      return reservations;
    }

    reservations.push({
      stock_product_id: stockRow.id,
      quantity: demand.quantity,
      scope: 'flower',
      reservation_kind: 'flower',
      metadata: {
        flower_name: demand.flowerName,
        item_indexes: Array.from(demand.itemIndexes),
        arrangement_indexes: Array.from(demand.arrangementIndexes),
        source: 'preferred_flowers',
      },
    });

    return reservations;
  }, []);
};
