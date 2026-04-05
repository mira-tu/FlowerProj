const toNonNegativeNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }
    return Math.round(parsed * 100) / 100;
};

const toPositiveInt = (value, fallback = 1) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const formatTentativePesoAmount = (value) => `\u20b1${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
})}`;

export const formatTentativePriceRange = (min, max, note = '') => {
    const safeMin = toNonNegativeNumber(min, 0);
    const safeMaxCandidate = toNonNegativeNumber(max, safeMin);
    const safeMax = safeMaxCandidate < safeMin ? safeMin : safeMaxCandidate;
    const trimmedNote = String(note || '').trim();

    if (safeMin <= 0 && safeMax <= 0) {
        return '';
    }

    const rangeText = safeMax > safeMin
        ? `${formatTentativePesoAmount(safeMin)}\u2013${formatTentativePesoAmount(safeMax)}`
        : formatTentativePesoAmount(Math.max(safeMin, safeMax));

    return trimmedNote ? `${rangeText} ${trimmedNote}` : rangeText;
};

const normalizeLookupKey = (value) => String(value || '').trim().toLowerCase();

const findMatchingArrangementEstimate = (selection = {}, arrangementCatalog = []) => {
    const lookupKeys = [
        selection?.arrangement_label,
        selection?.arrangementLabel,
        selection?.label,
        selection?.arrangement_type,
        selection?.arrangementType,
        selection?.value,
    ]
        .map(normalizeLookupKey)
        .filter(Boolean);

    if (!lookupKeys.length || !Array.isArray(arrangementCatalog) || !arrangementCatalog.length) {
        return null;
    }

    return arrangementCatalog.find((arrangement) => {
        const arrangementKeys = [
            arrangement?.label,
            arrangement?.value,
        ]
            .map(normalizeLookupKey)
            .filter(Boolean);

        return arrangementKeys.some((key) => lookupKeys.includes(key));
    }) || null;
};

const normalizeTentativeLineItem = (selection = {}, index = 0, arrangementCatalog = []) => {
    const label = String(
        selection?.arrangement_label
        || selection?.arrangementLabel
        || selection?.label
        || selection?.arrangement_type
        || selection?.arrangementType
        || ''
    ).trim();

    if (!label) {
        return null;
    }

    const quantity = toPositiveInt(selection?.quantity || selection?.arrangement_quantity, 1);
    const matchedArrangement = findMatchingArrangementEstimate(selection, arrangementCatalog);
    const unitMin = toNonNegativeNumber(
        selection?.estimated_price_min ?? selection?.estimatedPriceMin ?? matchedArrangement?.estimatedPriceMin,
        0
    );
    const unitMaxCandidate = toNonNegativeNumber(
        selection?.estimated_price_max ?? selection?.estimatedPriceMax ?? matchedArrangement?.estimatedPriceMax,
        unitMin
    );
    const unitMax = unitMaxCandidate < unitMin ? unitMin : unitMaxCandidate;
    const note = String(
        selection?.estimated_price_note
        ?? selection?.estimatedPriceNote
        ?? matchedArrangement?.estimatedPriceNote
        ?? ''
    ).trim();
    const hasEstimate = unitMin > 0 || unitMax > 0;
    const lineMin = hasEstimate
        ? toNonNegativeNumber(selection?.tentative_subtotal_min ?? selection?.tentativeSubtotalMin, unitMin * quantity)
        : 0;
    const lineMax = hasEstimate
        ? toNonNegativeNumber(selection?.tentative_subtotal_max ?? selection?.tentativeSubtotalMax, unitMax * quantity)
        : 0;

    return {
        key: `${label}-${index}`,
        label,
        quantity,
        note,
        unitMin,
        unitMax,
        lineMin,
        lineMax,
        hasEstimate,
        formattedUnitRange: hasEstimate ? formatTentativePriceRange(unitMin, unitMax, note) : 'To be quoted',
        formattedLineRange: hasEstimate ? formatTentativePriceRange(lineMin, lineMax) : 'To be quoted',
    };
};

export const buildTentativeBreakdownFromSelections = (arrangementSelections = [], arrangementCatalog = []) => {
    const lineItems = (Array.isArray(arrangementSelections) ? arrangementSelections : [])
        .map((selection, index) => normalizeTentativeLineItem(selection, index, arrangementCatalog))
        .filter(Boolean);

    const estimatedLineItems = lineItems.filter((item) => item.hasEstimate);
    const hasAnyEstimate = estimatedLineItems.length > 0;
    const hasCompleteEstimate = hasAnyEstimate && estimatedLineItems.length === lineItems.length;
    const subtotalMin = estimatedLineItems.reduce((sum, item) => sum + item.lineMin, 0);
    const subtotalMax = estimatedLineItems.reduce((sum, item) => sum + item.lineMax, 0);

    return {
        lineItems,
        hasAnyEstimate,
        hasCompleteEstimate,
        subtotalMin,
        subtotalMax,
        formattedSubtotalRange: hasCompleteEstimate ? formatTentativePriceRange(subtotalMin, subtotalMax) : '',
    };
};

export const getTentativeBreakdownFromItem = (item = {}, arrangementCatalog = []) => {
    const storedBreakdown = item?.tentativeBreakdown || item?.tentative_breakdown;
    const storedLineItems = Array.isArray(storedBreakdown?.lineItems)
        ? storedBreakdown.lineItems
        : Array.isArray(storedBreakdown?.line_items)
            ? storedBreakdown.line_items
            : null;

    if (storedLineItems?.length) {
        return buildTentativeBreakdownFromSelections(storedLineItems, arrangementCatalog);
    }

    return buildTentativeBreakdownFromSelections(
        Array.isArray(item?.arrangementSelections)
            ? item.arrangementSelections
            : Array.isArray(item?.arrangement_selections)
                ? item.arrangement_selections
                : [],
        arrangementCatalog,
    );
};

export const buildTentativePricingSummary = ({
    fixedAmount = 0,
    tentativeBreakdowns = [],
    extraFixedAmount = 0,
}) => {
    const safeFixedAmount = toNonNegativeNumber(fixedAmount, 0);
    const safeExtraFixedAmount = toNonNegativeNumber(extraFixedAmount, 0);
    const normalizedBreakdowns = (Array.isArray(tentativeBreakdowns) ? tentativeBreakdowns : []).filter(Boolean);
    const hasAnyTentativeEstimate = normalizedBreakdowns.some((breakdown) => breakdown?.hasAnyEstimate);
    const hasIncompleteTentativeEstimate = normalizedBreakdowns.some((breakdown) => breakdown?.lineItems?.length && !breakdown?.hasCompleteEstimate);
    const tentativeMin = normalizedBreakdowns.reduce((sum, breakdown) => sum + toNonNegativeNumber(breakdown?.subtotalMin, 0), 0);
    const tentativeMax = normalizedBreakdowns.reduce((sum, breakdown) => sum + toNonNegativeNumber(breakdown?.subtotalMax, 0), 0);
    const subtotalMin = safeFixedAmount + tentativeMin;
    const subtotalMax = safeFixedAmount + tentativeMax;
    const totalMin = subtotalMin + safeExtraFixedAmount;
    const totalMax = subtotalMax + safeExtraFixedAmount;
    const hasAnyEstimate = safeFixedAmount > 0 || hasAnyTentativeEstimate;
    const hasCompleteEstimate = hasAnyEstimate && !hasIncompleteTentativeEstimate;

    return {
        hasAnyEstimate,
        hasCompleteEstimate,
        subtotalMin,
        subtotalMax,
        totalMin,
        totalMax,
        formattedSubtotalRange: hasCompleteEstimate ? formatTentativePriceRange(subtotalMin, subtotalMax) : '',
        formattedTotalRange: hasCompleteEstimate ? formatTentativePriceRange(totalMin, totalMax) : '',
    };
};
