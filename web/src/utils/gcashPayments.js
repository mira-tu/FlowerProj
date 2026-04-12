import { parseMultiDeliveryNotes, serializeMultiDeliveryNotes } from './deliveryDestinations';

export const normalizeGcashReferenceNumber = (value) => String(value || '').trim();

export const normalizeAdditionalReceiptEntries = (value) => (
    Array.isArray(value)
        ? value
            .map((entry) => {
                if (!entry) return null;
                if (typeof entry === 'string') {
                    return {
                        url: entry,
                        reference_number: '',
                        uploaded_at: null,
                    };
                }

                return {
                    ...entry,
                    url: entry.url || entry.receipt_url || '',
                    reference_number: normalizeGcashReferenceNumber(
                        entry.reference_number || entry.referenceNumber || ''
                    ),
                    uploaded_at: entry.uploaded_at || entry.uploadedAt || null,
                };
            })
            .filter((entry) => entry?.url)
        : []
);

export const createAdditionalReceiptEntry = ({ url, referenceNumber, uploadedAt = null }) => ({
    url,
    reference_number: normalizeGcashReferenceNumber(referenceNumber),
    uploaded_at: uploadedAt || new Date().toISOString(),
});

const normalizeOrderPaymentMetadata = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    const normalized = {
        gcash_reference_number: normalizeGcashReferenceNumber(
            value.gcash_reference_number || value.gcashReferenceNumber || ''
        ),
        additional_receipts: normalizeAdditionalReceiptEntries(
            value.additional_receipts || value.additionalReceipts || []
        ),
    };

    if (!normalized.gcash_reference_number) {
        delete normalized.gcash_reference_number;
    }

    if (!normalized.additional_receipts.length) {
        delete normalized.additional_receipts;
    }

    return normalized;
};

export const getOrderPaymentMetadataFromNotes = (notes) => {
    const parsedNotes = parseMultiDeliveryNotes(notes);
    return normalizeOrderPaymentMetadata(parsedNotes?.metadata?.payment || {});
};

export const getOrderGcashReferenceFromNotes = (notes) => (
    getOrderPaymentMetadataFromNotes(notes).gcash_reference_number || ''
);

export const getOrderAdditionalReceiptsFromNotes = (notes) => (
    getOrderPaymentMetadataFromNotes(notes).additional_receipts || []
);

const firstNonEmptyString = (...values) => (
    values
        .map((value) => String(value || '').trim())
        .find(Boolean)
        || ''
);

const firstNonEmptyReceipts = (...values) => {
    for (const value of values) {
        const normalizedEntries = normalizeAdditionalReceiptEntries(value);
        if (normalizedEntries.length) {
            return normalizedEntries;
        }
    }

    return [];
};

export const mergeOrderPaymentMetadataIntoNotes = (notes, patch = {}) => {
    const parsedNotes = parseMultiDeliveryNotes(notes);
    const nextPaymentMetadata = normalizeOrderPaymentMetadata({
        ...getOrderPaymentMetadataFromNotes(notes),
        ...patch,
    });
    const nextMetadata = {
        ...(parsedNotes.metadata && typeof parsedNotes.metadata === 'object' ? parsedNotes.metadata : {}),
    };

    if (Object.keys(nextPaymentMetadata).length) {
        nextMetadata.payment = nextPaymentMetadata;
    } else {
        delete nextMetadata.payment;
    }

    return serializeMultiDeliveryNotes({
        note: parsedNotes.note,
        destinations: parsedNotes.destinations,
        metadata: nextMetadata,
    });
};

export const resolveOrderTrackingPaymentMetadata = (order = {}) => {
    const notePaymentMetadata = getOrderPaymentMetadataFromNotes(order?.notes);

    return {
        receiptUrl: firstNonEmptyString(order?.receipt_url),
        gcashReferenceNumber: normalizeGcashReferenceNumber(
            firstNonEmptyString(order?.gcash_reference_number, notePaymentMetadata?.gcash_reference_number),
        ),
        additionalReceipts: firstNonEmptyReceipts(
            order?.additional_receipts,
            notePaymentMetadata?.additional_receipts,
        ),
    };
};

export const resolveRequestTrackingPaymentMetadata = (request = {}) => {
    const requestData = request?.requestData && typeof request.requestData === 'object'
        ? request.requestData
        : (request?.data && typeof request.data === 'object' ? request.data : {});

    return {
        receiptUrl: firstNonEmptyString(
            request?.receipt_url,
            requestData?.receipt_url,
        ),
        gcashReferenceNumber: normalizeGcashReferenceNumber(
            firstNonEmptyString(
                request?.gcash_reference_number,
                requestData?.gcash_reference_number,
            ),
        ),
        additionalReceipts: firstNonEmptyReceipts(
            request?.additional_receipts,
            requestData?.additional_receipts,
        ),
    };
};

export const isMissingTableColumnError = (error, tableName, columnName) => {
    const message = String(error?.message || '').toLowerCase();
    const details = String(error?.details || '').toLowerCase();
    const hint = String(error?.hint || '').toLowerCase();
    const code = String(error?.code || '').toLowerCase();
    const combined = `${message} ${details} ${hint}`;
    const normalizedTable = String(tableName || '').toLowerCase();
    const normalizedColumn = String(columnName || '').toLowerCase();

    if (!normalizedTable || !normalizedColumn) {
        return false;
    }

    if (code === 'pgrst204') {
        return combined.includes(normalizedColumn)
            && (combined.includes(normalizedTable) || combined.includes('schema cache'));
    }

    return combined.includes(normalizedColumn)
        && (combined.includes(`${normalizedTable}.`) || combined.includes(`'${normalizedTable}'`) || combined.includes('column'));
};

export const writeWithOptionalColumns = async ({
    tableName,
    initialPayload,
    optionalColumns = [],
    execute,
}) => {
    let payload = { ...(initialPayload || {}) };
    const removedColumns = [];

    while (true) {
        const result = await execute(payload);
        if (!result?.error) {
            return {
                ...result,
                removedColumns,
                payload,
            };
        }

        const missingColumn = optionalColumns.find((columnName) => (
            Object.prototype.hasOwnProperty.call(payload, columnName)
            && isMissingTableColumnError(result.error, tableName, columnName)
        ));

        if (!missingColumn) {
            return {
                ...result,
                removedColumns,
                payload,
            };
        }

        const nextPayload = { ...payload };
        delete nextPayload[missingColumn];
        payload = nextPayload;
        removedColumns.push(missingColumn);

        console.warn(`${tableName}.${missingColumn} is missing from the database schema. Retrying without it.`);
    }
};
