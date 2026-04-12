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
