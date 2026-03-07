const DATE_FORMAT_OPTIONS = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
};

const ONE_MINUTE_MS = 60 * 1000;

const toValidDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const getStepKey = (step) => step?.key || step?.status || null;

const findNearestKnown = (knownById, ids, index, direction) => {
    if (direction === 'backward') {
        for (let i = index - 1; i >= 0; i -= 1) {
            const id = ids[i];
            if (knownById.has(id)) return { id, date: knownById.get(id) };
        }
        return null;
    }

    for (let i = index + 1; i < ids.length; i += 1) {
        const id = ids[i];
        if (knownById.has(id)) return { id, date: knownById.get(id) };
    }
    return null;
};

export const buildTimelineTimestampMap = ({
    steps = [],
    currentStep = 0,
    statusTimestamps = {},
    createdAt = null,
    updatedAt = null
}) => {
    if (!Array.isArray(steps) || currentStep === -1) return {};

    const reachedSteps = steps
        .filter((step) => step.id <= currentStep)
        .sort((a, b) => a.id - b.id);

    if (reachedSteps.length === 0) return {};

    const knownById = new Map();
    reachedSteps.forEach((step) => {
        const stepKey = getStepKey(step);
        const directTimestamp = stepKey ? statusTimestamps?.[stepKey] : null;
        const parsed = toValidDate(directTimestamp);
        if (parsed) {
            knownById.set(step.id, parsed);
        }
    });

    const firstId = reachedSteps[0].id;
    const lastId = reachedSteps[reachedSteps.length - 1].id;
    const firstFallback = toValidDate(createdAt) || toValidDate(updatedAt);
    const lastStepKey = getStepKey(reachedSteps[reachedSteps.length - 1]);
    const lastFallback =
        toValidDate((lastStepKey && statusTimestamps?.[lastStepKey]) || null) ||
        toValidDate(statusTimestamps?.completed) ||
        toValidDate(statusTimestamps?.claimed) ||
        toValidDate(updatedAt) ||
        toValidDate(createdAt);

    if (!knownById.has(firstId) && firstFallback) {
        knownById.set(firstId, firstFallback);
    }

    if (!knownById.has(lastId) && lastFallback) {
        knownById.set(lastId, lastFallback);
    }

    const reachedIds = reachedSteps.map((step) => step.id);
    reachedIds.forEach((id, index) => {
        if (knownById.has(id)) return;

        const previousKnown = findNearestKnown(knownById, reachedIds, index, 'backward');
        const nextKnown = findNearestKnown(knownById, reachedIds, index, 'forward');

        let resolvedDate;
        if (previousKnown && nextKnown && nextKnown.id !== previousKnown.id) {
            const ratio = (id - previousKnown.id) / (nextKnown.id - previousKnown.id);
            const timeDiff = nextKnown.date.getTime() - previousKnown.date.getTime();
            resolvedDate = new Date(previousKnown.date.getTime() + Math.round(timeDiff * ratio));
        } else if (previousKnown) {
            resolvedDate = new Date(previousKnown.date.getTime() + (id - previousKnown.id) * ONE_MINUTE_MS);
        } else if (nextKnown) {
            resolvedDate = new Date(nextKnown.date.getTime() - (nextKnown.id - id) * ONE_MINUTE_MS);
        } else {
            const base = toValidDate(createdAt) || toValidDate(updatedAt) || new Date();
            resolvedDate = new Date(base.getTime() + (id - firstId) * ONE_MINUTE_MS);
        }

        knownById.set(id, resolvedDate);
    });

    let previousTime = null;
    reachedIds.forEach((id) => {
        const currentDate = knownById.get(id);
        if (!currentDate) return;

        if (previousTime !== null && currentDate.getTime() < previousTime) {
            knownById.set(id, new Date(previousTime + ONE_MINUTE_MS));
        }

        previousTime = knownById.get(id).getTime();
    });

    return reachedIds.reduce((acc, id) => {
        const value = knownById.get(id);
        if (value) acc[id] = value.toISOString();
        return acc;
    }, {});
};

export const formatTimelineTimestamp = (value, locale = 'en-PH') => {
    const parsed = toValidDate(value);
    if (!parsed) return '';
    return parsed.toLocaleString(locale, DATE_FORMAT_OPTIONS);
};
