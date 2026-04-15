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

const isMissingRequestStockAllocationRpcError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  const combined = `${message} ${details} ${hint}`;

  return code === 'pgrst202'
    || combined.includes('apply_request_stock_allocations')
    || combined.includes('could not find the function')
    || combined.includes('function public.apply_request_stock_allocations')
    || combined.includes('schema cache')
    || (combined.includes('stock_allocations') && combined.includes('not found'))
    || (combined.includes('stock_allocations') && combined.includes('404'));
};

const isMissingManageAdminWorkflowsError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const combined = `${message} ${details} ${hint}`;

  return combined.includes('manage-admin-workflows')
    || combined.includes('not deployed')
    || combined.includes('function not found')
    || combined.includes('404');
};

const parseJsonObject = (value) => {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      return {};
    }
  }
  return typeof value === 'object' ? value : {};
};

const isMissingStockReservationsTableError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  const status = String(error?.status || error?.statusCode || '').toLowerCase();
  const combined = `${message} ${details} ${hint}`;

  return code === 'pgrst205'
    || code === '42p01'
    || status === '404'
    || (combined.includes('stock_reservations') && combined.includes('not found'))
    || (combined.includes('stock_reservations') && combined.includes('404'))
    || combined.includes("relation 'public.stock_reservations' does not exist")
    || combined.includes('could not find the table')
    || combined.includes('schema cache');
};

const confirmExistingRequestStockReservation = async ({
  supabase,
  requestId,
}) => {
  if (!supabase || !requestId) {
    return false;
  }

  try {
    const [
      requestResult,
      reservationsResult,
    ] = await Promise.all([
      supabase
        .from('requests')
        .select('data')
        .eq('id', requestId)
        .maybeSingle(),
      supabase
        .from('stock_reservations')
        .select('id', { count: 'exact', head: true })
        .eq('request_id', requestId)
        .eq('status', 'reserved'),
    ]);

    const requestData = parseJsonObject(requestResult?.data?.data);
    const requestStatus = String(requestData?.stock_allocation_status || '').trim().toLowerCase();
    const reservationsUnavailable = isMissingStockReservationsTableError(reservationsResult?.error);
    const reservedCount = Number(reservationsResult?.count || 0);

    if (requestStatus === 'reserved' || reservedCount > 0) {
      return true;
    }

    if (reservationsUnavailable) {
      return null;
    }

    return false;
  } catch (error) {
    console.warn('Could not confirm existing request stock reservation fallback state.', error);
    return false;
  }
};

const normalizeStockAllocations = (allocations = []) => {
  const totals = new Map();

  (Array.isArray(allocations) ? allocations : []).forEach((allocation) => {
    const stockProductId = Number.parseInt(String(allocation?.stock_product_id ?? ''), 10);
    const quantity = Number.parseInt(String(allocation?.quantity ?? ''), 10);
    const scope = String(allocation?.scope || 'other').trim().toLowerCase() || 'other';

    if (!Number.isFinite(stockProductId) || stockProductId <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    const existing = totals.get(stockProductId) || { stock_product_id: stockProductId, quantity: 0, scope };
    existing.quantity += quantity;
    if (!existing.scope || existing.scope === 'other') {
      existing.scope = scope;
    }
    totals.set(stockProductId, existing);
  });

  return Array.from(totals.values());
};

const buildStockConflictError = () => new Error(
  'Some wrapper, ribbon, or flower stock changed while you were checking out. Please review your Customizer Studio cart and try again.'
);

export const reserveRequestStockAllocationsDirect = async ({
  supabase,
  requestId,
  allocations = [],
}) => {
  if (!supabase || !requestId) {
    return { success: false, error: new Error('Request stock reservation could not be completed.') };
  }

  const normalizedAllocations = normalizeStockAllocations(allocations);
  if (!normalizedAllocations.length) {
    return { success: true, skipped: true, viaDirectDeduction: true };
  }

  const { data: requestRow, error: requestError } = await supabase
    .from('requests')
    .select('id, data')
    .eq('id', requestId)
    .maybeSingle();

  if (requestError || !requestRow) {
    return {
      success: false,
      error: requestError || new Error('The customized request could not be found after it was created.'),
      viaDirectDeduction: true,
    };
  }

  const requestData = parseJsonObject(requestRow.data);
  const allocationStatus = String(requestData?.stock_allocation_status || '').trim().toLowerCase();
  if (allocationStatus === 'reserved') {
    return {
      success: true,
      skipped: false,
      viaDirectDeduction: true,
      viaExistingReservation: true,
    };
  }

  const allocationIds = normalizedAllocations.map((allocation) => allocation.stock_product_id);
  const { data: stockRows, error: stockError } = await supabase
    .from('stock_products')
    .select('id, quantity')
    .in('id', allocationIds);

  if (stockError) {
    return { success: false, error: stockError, viaDirectDeduction: true };
  }

  const stockById = new Map((stockRows || []).map((row) => [Number(row.id), row]));
  const hasConflict = normalizedAllocations.some((allocation) => {
    const row = stockById.get(allocation.stock_product_id);
    return !row || Number(row.quantity || 0) < allocation.quantity;
  });

  if (hasConflict) {
    return {
      success: false,
      error: buildStockConflictError(),
      viaDirectDeduction: true,
      stockConflict: true,
    };
  }

  const appliedUpdates = [];
  for (const allocation of normalizedAllocations) {
    const currentRow = stockById.get(allocation.stock_product_id);
    const currentQuantity = Number(currentRow?.quantity || 0);
    const nextQuantity = Math.max(0, currentQuantity - allocation.quantity);

    const { data: updatedRows, error: updateError } = await supabase
      .from('stock_products')
      .update({ quantity: nextQuantity })
      .eq('id', allocation.stock_product_id)
      .eq('quantity', currentQuantity)
      .select('id, quantity');

    if (updateError || !Array.isArray(updatedRows) || updatedRows.length === 0) {
      for (const appliedUpdate of appliedUpdates.reverse()) {
        try {
          await supabase
            .from('stock_products')
            .update({ quantity: appliedUpdate.previousQuantity })
            .eq('id', appliedUpdate.stock_product_id);
        } catch (rollbackError) {
          console.error('Failed to roll back customized stock deduction after a partial update.', rollbackError);
        }
      }

      return {
        success: false,
        error: updateError || buildStockConflictError(),
        viaDirectDeduction: true,
        stockConflict: !updateError,
      };
    }

    appliedUpdates.push({
      stock_product_id: allocation.stock_product_id,
      previousQuantity: currentQuantity,
    });
  }

  const nextRequestData = {
    ...requestData,
    stock_allocations: Array.isArray(requestData?.stock_allocations) && requestData.stock_allocations.length > 0
      ? requestData.stock_allocations
      : normalizedAllocations,
    stock_allocation_status: 'reserved',
    stock_allocation_mode: 'legacy_direct',
    stock_allocation_reserved_at: new Date().toISOString(),
  };

  const { error: requestUpdateError } = await supabase
    .from('requests')
    .update({ data: nextRequestData })
    .eq('id', requestId);

  if (requestUpdateError) {
    console.error('Customized request stock was deducted, but the request allocation marker could not be updated.', requestUpdateError);
  }

  return {
    success: true,
    skipped: false,
    usedFallback: true,
    viaDirectDeduction: true,
  };
};

export const reserveRequestStockAllocations = async ({
  supabase,
  requestId,
  allocations = [],
}) => {
  if (!supabase || !requestId || !Array.isArray(allocations) || allocations.length === 0) {
    return { success: true, skipped: true, usedFallback: false };
  }

  const { data: functionResult, error: functionError } = await supabase.functions.invoke('manage-admin-workflows', {
    body: {
      action: 'reserve_request_stock',
      requestId,
      allocations,
    },
  });

  if (!functionError && functionResult?.success !== false) {
    return { success: true, skipped: false, usedFallback: false, viaFunction: true };
  }

  if (functionError && !isMissingManageAdminWorkflowsError(functionError)) {
    console.warn('Request stock reservation edge function failed. Falling back to RPC.', functionError);
  }

  const { error } = await supabase.rpc('apply_request_stock_allocations', {
    p_request_id: requestId,
    p_allocations: allocations,
    p_mode: 'reserve',
  });

  if (!error) {
    return { success: true, skipped: false, usedFallback: true, viaFunction: false };
  }

  if (isMissingRequestStockAllocationRpcError(error)) {
    const alreadyReserved = await confirmExistingRequestStockReservation({
      supabase,
      requestId,
    });

    if (alreadyReserved) {
      return {
        success: true,
        skipped: false,
        usedFallback: true,
        viaFunction: false,
        viaExistingReservation: true,
      };
    }

    if (alreadyReserved === null) {
      return {
        success: false,
        error: new Error('Live stock reservation is not available right now. Please try again in a moment.'),
        skipped: false,
        usedFallback: true,
        viaFunction: false,
        infrastructureUnavailable: true,
      };
    }

    console.error('Request stock allocation RPC is unavailable, so reservation could not be completed.', error);
    return {
      success: false,
      error: new Error('Live stock reservation is not available right now. Please try again in a moment.'),
      skipped: false,
      usedFallback: true,
      viaFunction: false,
      infrastructureUnavailable: true,
    };
  }

  return { success: false, error, skipped: false, usedFallback: false };
};
