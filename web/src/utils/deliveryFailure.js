export const DELIVERY_FAILED_ATTEMPT_STATUS = 'delivery_failed_attempt';

export const getDeliveryFailureReason = (record = {}) => (
    record?.status_timestamps?.delivery_failed_attempt_reason
    || record?.statusTimestamps?.delivery_failed_attempt_reason
    || record?.delivery_failed_attempt_reason
    || record?.deliveryFailureReason
    || null
);

export const hasDeliveryFailedAttempt = (record = {}) => (
    String(record?.status || record?.trackingStatus || '').trim().toLowerCase() === DELIVERY_FAILED_ATTEMPT_STATUS
    || Boolean(record?.status_timestamps?.delivery_failed_attempt)
    || Boolean(record?.statusTimestamps?.delivery_failed_attempt)
);

export const withDeliveryFailedAttemptStep = (steps = [], record = {}) => {
    if (!hasDeliveryFailedAttempt(record)) {
        return steps;
    }

    const getStepKey = (step) => step?.key || step?.status || null;
    const existingIndex = steps.findIndex((step) => getStepKey(step) === DELIVERY_FAILED_ATTEMPT_STATUS);
    if (existingIndex !== -1) {
        return steps;
    }

    const failedStep = {
        id: 0,
        key: DELIVERY_FAILED_ATTEMPT_STATUS,
        status: DELIVERY_FAILED_ATTEMPT_STATUS,
        title: 'Failed Delivery Attempt',
        description: 'Delivery was attempted but could not be completed. Our team will contact you or retry delivery.',
        icon: 'fa-triangle-exclamation',
        tone: 'warning',
    };

    const outForDeliveryIndex = steps.findIndex((step) => getStepKey(step) === 'out_for_delivery');
    const completedIndex = steps.findIndex((step) => getStepKey(step) === 'completed');
    const insertIndex = outForDeliveryIndex !== -1
        ? outForDeliveryIndex + 1
        : (completedIndex !== -1 ? completedIndex : steps.length);

    return [
        ...steps.slice(0, insertIndex),
        failedStep,
        ...steps.slice(insertIndex),
    ].map((step, index) => ({ ...step, id: index + 1 }));
};
