import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { decode } from 'base64-arraybuffer';
import {
    areAllDeliveryStopsConfirmed,
    confirmDeliveryStop,
    getDeliveryStopDisplayLabel,
    groupDeliveryDestinations,
    hasStopConfirmationFlow,
    isDeliveryStopCancelled,
    normalizeDeliveryDestinations,
    parseMultiDeliveryNotes,
    reconcileDeliveryDestinationsWithItems,
    serializeMultiDeliveryNotes,
} from '../utils/deliveryDestinations';
import {
    getCustomOrderQuoteTypeLabel,
    normalizeCustomOrderQuoteLineItems,
    summarizeCustomOrderQuoteBreakdown,
} from '../utils/customOrderQuoteBreakdown';

const ADMIN_WORKFLOW_FUNCTION = 'manage-admin-workflows';

const getStoredStaffToken = async () => {
    try {
        const token = await AsyncStorage.getItem('token');
        return typeof token === 'string' ? token.trim() : '';
    } catch (error) {
        console.warn('Unable to read stored staff token:', error?.message || error);
        return '';
    }
};

const getWorkflowAccessToken = async () => {
    let accessToken = '';

    try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
            console.warn('Could not read Supabase session for admin workflow:', sessionError.message);
        }

        accessToken = sessionData?.session?.access_token?.trim?.() || '';
    } catch (error) {
        console.warn('Failed to load Supabase session for admin workflow:', error?.message || error);
    }

    if (accessToken) {
        return accessToken;
    }

    try {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
            console.warn('Could not refresh Supabase session for admin workflow:', refreshError.message);
        }

        accessToken = refreshed?.session?.access_token?.trim?.() || '';
    } catch (error) {
        console.warn('Failed to refresh Supabase session for admin workflow:', error?.message || error);
    }

    if (accessToken) {
        return accessToken;
    }

    return getStoredStaffToken();
};

const getFunctionErrorMessage = async (error, fallbackMessage) => {
    if (!error) return fallbackMessage;

    if (error.context) {
        try {
            const payload = await error.context.json();
            const contextMessage = String(payload?.error || payload?.message || '').trim();
            if (contextMessage) {
                return contextMessage;
            }
        } catch (jsonError) {
            try {
                const text = await error.context.text();
                const contextText = String(text || '').trim();
                if (contextText) {
                    return contextText;
                }
            } catch (textError) {
                // Fall back to the provided message below.
            }
        }
    }

    const rawMessage = String(error?.message || '').trim();
    const normalizedMessage = rawMessage.toLowerCase();
    const isGenericEdgeMessage = [
        'failed to send a request to the edge function',
        'relay error invoking the edge function',
        'edge function returned a non-2xx status code',
    ].some((token) => normalizedMessage.includes(token));

    if (rawMessage && !isGenericEdgeMessage) {
        return rawMessage;
    }

    return fallbackMessage;
};

const invokeAdminWorkflow = async (action, payload = {}) => {
    const startedAt = Date.now();
    const accessToken = await getWorkflowAccessToken();

    if (!accessToken) {
        throw new Error('Your admin session expired. Please sign in again to continue.');
    }

    console.log('[admin-perf] workflow start', {
        action,
    });

    const { data, error } = await supabase.functions.invoke(ADMIN_WORKFLOW_FUNCTION, {
        body: {
            action,
            ...payload,
        },
        headers: accessToken
            ? {
                Authorization: `Bearer ${accessToken}`,
            }
            : undefined,
    });

    if (error) {
        console.log('[admin-perf] workflow failed', {
            action,
            durationMs: Date.now() - startedAt,
            message: error?.message || String(error),
        });
        const message = await getFunctionErrorMessage(error, `Failed to ${action.replace(/_/g, ' ')}.`);
        const enrichedError = new Error(message);
        enrichedError.name = error?.name || 'AdminWorkflowError';
        enrichedError.cause = error;
        throw enrichedError;
    }

    if (data?.error) {
        console.log('[admin-perf] workflow returned error payload', {
            action,
            durationMs: Date.now() - startedAt,
            message: data.error,
        });
        throw new Error(data.error);
    }

    console.log('[admin-perf] workflow success', {
        action,
        durationMs: Date.now() - startedAt,
    });
    return data;
};

const shouldFallbackToDirectWorkflow = (error) => {
    const message = String(error?.message || '').toLowerCase();
    const name = String(error?.name || error?.cause?.name || '').toLowerCase();
    const status = Number(error?.status || error?.cause?.status || error?.cause?.context?.status || 0);

    if (status === 401 || status === 403 || status === 404 || status === 500 || status === 502 || status === 503 || status === 504) {
        return true;
    }

    if ([
        'not authorized',
        'permission denied',
        'entity not authorized',
        'function not found',
        'function not deployed',
        'latest manage-admin-workflows function is not deployed yet',
    ].some((token) => message.includes(token))) {
        return true;
    }

    return [
        'functionsfetcherror',
        'functionsrelayerror',
        'functionshttperror',
        'adminworkflowerror',
        'failed to send a request to the edge function',
        'relay error invoking the edge function',
        'edge function returned a non-2xx status code',
        'network request failed',
        'failed to fetch',
        'network error',
        'load failed',
        'fetch',
    ].some((token) => name.includes(token) || message.includes(token));
};

const isGenericAdminWorkflowTransportError = (error) => {
    const message = String(error?.message || '').trim().toLowerCase();
    const causeMessage = String(error?.cause?.message || '').trim().toLowerCase();
    const status = Number(error?.status || error?.cause?.status || error?.cause?.context?.status || 0);

    if (status === 404 || status === 502 || status === 503 || status === 504) {
        return true;
    }

    return [
        message,
        causeMessage,
    ].some((value) => (
        !value
        || value.includes('failed to send a request to the edge function')
        || value.includes('relay error invoking the edge function')
        || value.includes('edge function returned a non-2xx status code')
        || value.includes('failed to fetch')
        || value.includes('network request failed')
        || value.includes('network error')
        || value.includes('load failed')
        || value.includes('function not found')
    ));
};

const getDeliveryProofCompletionErrorMessage = (error) => {
    const message = String(error?.message || '').trim();
    if (message && !isGenericAdminWorkflowTransportError(error)) {
        return message;
    }

    return 'The latest manage-admin-workflows function is not deployed yet. Please deploy it before riders can submit proof.';
};

const getDeliveryProofCompletionFallbackMessage = (primaryError, fallbackError) => {
    const primaryMessage = String(primaryError?.message || '').trim();
    const fallbackMessage = String(fallbackError?.message || '').trim();

    if (primaryMessage && !isGenericAdminWorkflowTransportError(primaryError)) {
        return primaryMessage;
    }

    if (fallbackMessage && !isGenericAdminWorkflowTransportError(fallbackError)) {
        return fallbackMessage;
    }

    if (primaryMessage && primaryMessage !== fallbackMessage) {
        return primaryMessage;
    }

    return 'The latest manage-admin-workflows function is not deployed yet. Please deploy it before riders can submit proof.';
};

const isTransientFetchError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    const details = String(error?.details || '').toLowerCase();
    const hint = String(error?.hint || '').toLowerCase();
    const name = String(error?.name || error?.cause?.name || '').toLowerCase();
    const haystack = `${message} ${details} ${hint} ${name}`;

    return [
        'network request failed',
        'failed to fetch',
        'network error',
        'load failed',
        'connection closed',
        'err_connection_closed',
        'fetch',
    ].some((token) => haystack.includes(token));
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isDataUrl = (value) => (
    typeof value === 'string' && value.trim().toLowerCase().startsWith('data:')
);
const isHttpUrl = (value) => (
    typeof value === 'string' && /^https?:\/\//i.test(value.trim())
);
const getStockStorageObjectPath = (value) => {
    if (!isHttpUrl(value) || isDataUrl(value)) {
        return '';
    }

    try {
        const parsedUrl = new URL(value);
        const marker = '/storage/v1/object/public/stock-images/';
        const markerIndex = parsedUrl.pathname.indexOf(marker);
        if (markerIndex >= 0) {
            return decodeURIComponent(parsedUrl.pathname.slice(markerIndex + marker.length));
        }
    } catch (error) {
        // Fall through to the simple filename fallback below.
    }

    const parts = String(value || '').split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
};
const removeStockStorageObjectIfNeeded = async (value) => {
    const objectPath = getStockStorageObjectPath(value);
    if (!objectPath) {
        return;
    }

    await supabase.storage.from('stock-images').remove([objectPath]);
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

const getLatestCancellationEntry = (history = []) => {
    if (!Array.isArray(history) || history.length === 0) {
        return null;
    }

    return history
        .filter((entry) => entry && typeof entry === 'object')
        .reduce((latestEntry, entry) => {
            if (!latestEntry) {
                return entry;
            }

            const latestTimestamp = new Date(latestEntry.cancelled_at || 0).getTime();
            const entryTimestamp = new Date(entry.cancelled_at || 0).getTime();

            return entryTimestamp >= latestTimestamp ? entry : latestEntry;
        }, null);
};

const getOrderStopSourceItems = (order = {}) => {
    const requestData = parseJsonObject(order?.request_data);
    const orderItems = Array.isArray(order?.order_items)
        ? [...order.order_items].filter(Boolean).sort((left, right) => Number(left?.id || 0) - Number(right?.id || 0))
        : [];
    const requestItems = Array.isArray(requestData?.items) ? requestData.items.filter(Boolean) : [];

    return orderItems.length ? orderItems : requestItems;
};

const normalizeStockRibbonScope = (value) => {
    const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

    if (!normalized || normalized === 'classic' || normalized === 'classic_wrap' || normalized === 'classic_bouquet') {
        return 'classic_bouquet';
    }

    if (normalized === 'palm_halo' || normalized === 'palm_halo_wrap' || normalized === 'palmhalo') {
        return 'palm_halo_wrap';
    }

    return normalized;
};

const buildStockCustomizationConfig = (formData = {}) => {
    const baseConfig = parseJsonObject(formData?.customization_config);
    const category = String(formData?.category || '').trim().toLowerCase();

    if (!['ribbon', 'ribbons'].includes(category)) {
        return Object.keys(baseConfig).length ? baseConfig : (formData?.customization_config || null);
    }

    const normalizedScope = normalizeStockRibbonScope(formData?.ribbon_scope);
    const isPalmHaloRibbon = normalizedScope === 'palm_halo_wrap';

    return {
        ...baseConfig,
        ribbon_scope: normalizedScope,
        ribbonScope: normalizedScope,
        scopeLabel: isPalmHaloRibbon ? 'Palm Halo Wrap' : 'Classic Bouquet',
        wrapperMode: isPalmHaloRibbon ? 'Palm Halo Wrap' : 'Classic Bouquet',
    };
};

const buildLegacyStockMetadata = (formData = {}) => {
    const category = String(formData?.category || '').trim().toLowerCase();
    if (!['ribbon', 'ribbons'].includes(category)) {
        return formData?.customizer_metadata || formData?.wrapper_behavior || null;
    }

    return buildStockCustomizationConfig(formData);
};

const formatMonthKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
};

const isEmptySingleResultError = (error) => {
    const code = String(error?.code || '').trim().toUpperCase();
    const message = String(error?.message || '').toLowerCase();
    const details = String(error?.details || '').toLowerCase();

    return code === 'PGRST116'
        || message.includes('cannot coerce the result to a single json object')
        || details.includes('contains 0 rows');
};

const getOrderById = async (id, columns = '*') => {
    const { data, error } = await supabase
        .from('orders')
        .select(columns)
        .eq('id', id)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data || null;
};

const updateOrderRecordAndReload = async (id, updatePayload, verifier) => {
    const { data, error } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .maybeSingle();

    if (error && !isEmptySingleResultError(error)) {
        console.error('[admin-perf] order db update failed', {
            orderId: id,
            message: error.message,
            code: error.code,
        });
        throw error;
    }

    if (data) {
        return data;
    }

    const refreshedOrder = await getOrderById(id);
    if (!refreshedOrder) {
        throw new Error('Order not found after updating it.');
    }

    if (typeof verifier === 'function' && !verifier(refreshedOrder)) {
        throw new Error(
            'The order update was not confirmed in the database. Check your Supabase order permissions or deploy the latest manage-admin-workflows function.'
        );
    }

    return refreshedOrder;
};

const buildStopAssignmentLookup = (stopAssignments = []) => {
    const lookup = new Map();

    (Array.isArray(stopAssignments) ? stopAssignments : []).forEach((assignment) => {
        const riderId = assignment?.riderId ? String(assignment.riderId) : null;
        const unitKeys = Array.isArray(assignment?.unitKeys) ? assignment.unitKeys : [];

        unitKeys.forEach((unitKey) => {
            const normalizedUnitKey = String(unitKey || '').trim();
            if (normalizedUnitKey) {
                lookup.set(normalizedUnitKey, riderId);
            }
        });
    });

    return lookup;
};

const applyStopAssignmentsToDestinations = (destinations = [], stopAssignments = []) => {
    const assignmentLookup = buildStopAssignmentLookup(stopAssignments);

    return (Array.isArray(destinations) ? destinations : []).map((destination) => {
        const unitKey = String(destination?.unit_key || '').trim();

        if (!assignmentLookup.has(unitKey)) {
            return destination;
        }

        const assignedRiderId = assignmentLookup.get(unitKey);
        return {
            ...destination,
            assigned_rider_id: assignedRiderId || null,
        };
    });
};

const getUniqueAssignedRiderIds = (destinations = []) => Array.from(
    new Set(
        (Array.isArray(destinations) ? destinations : [])
            .map((destination) => String(destination?.assigned_rider_id || '').trim())
            .filter(Boolean)
    )
);

const getMissingAssignedStopLabels = (destinations = [], fallbackAssignedRiderId = null, items = []) => {
    const normalizedStops = Array.isArray(items) && items.length
        ? reconcileDeliveryDestinationsWithItems(destinations, items)
        : normalizeDeliveryDestinations(destinations);
    const normalizedFallbackAssignedRiderId = normalizedStops.length <= 1
        ? String(fallbackAssignedRiderId || '').trim()
        : '';

    return normalizedStops
        .filter((destination) => !isDeliveryStopCancelled(destination))
        .map((destination, index) => {
            const assignedRiderId = String(destination?.assigned_rider_id || normalizedFallbackAssignedRiderId || '').trim();
            return assignedRiderId ? null : getDeliveryStopDisplayLabel(destination, index);
        })
        .filter(Boolean);
};

const getOutForDeliveryAssignmentError = ({
    recordType = 'order',
    destinations = [],
    fallbackAssignedRiderId = null,
    items = [],
}) => {
    const missingStopLabels = getMissingAssignedStopLabels(destinations, fallbackAssignedRiderId, items);
    if (!missingStopLabels.length) {
        return '';
    }

    return `Please assign an employee rider to every delivery stop before moving this ${recordType} to Out for Delivery. Missing riders: ${missingStopLabels.join(', ')}.`;
};

const insertNotificationRecord = async (notification) => {
    const { error } = await supabase
        .from('notifications')
        .insert([notification]);

    if (error) {
        throw error;
    }
};

const getImageFileExtension = (file = {}) => {
    const mimeType = String(file?.mimeType || '').trim().toLowerCase();

    if (mimeType.includes('png')) return 'png';
    if (mimeType.includes('webp')) return 'webp';
    if (mimeType.includes('heic')) return 'heic';
    if (mimeType.includes('heif')) return 'heif';
    if (mimeType.includes('gif')) return 'gif';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';

    const fileName = String(file?.fileName || file?.name || '').trim();
    const uri = String(file?.uri || '').trim();
    const source = fileName || uri;
    const sourceMatch = source.match(/\.([a-z0-9]+)(?:\?|$)/i);

    return sourceMatch?.[1]?.toLowerCase?.() || 'jpg';
};

const getDeliveryProofFileName = (file = {}) => {
    const extension = getImageFileExtension(file);
    const rawName = String(file?.fileName || file?.name || file?.uri || '').trim();
    const baseName = rawName.split(/[\\/]/).pop()?.split('?')[0] || '';
    const sanitizedName = baseName
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/^-+|-+$/g, '');

    if (!sanitizedName) {
        return `delivery-proof-${Date.now()}.${extension}`;
    }

    return /\.[a-z0-9]+$/i.test(sanitizedName)
        ? sanitizedName
        : `${sanitizedName}.${extension}`;
};

const getDeliveryProofMimeType = (file = {}) => {
    const extension = getImageFileExtension(file);
    const normalizedFromExtension = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
    const rawMimeType = String(file?.mimeType || file?.type || '').trim().toLowerCase();
    const sanitizedMimeType = rawMimeType
        .split(';')[0]
        .trim()
        .replace(/[^a-z0-9!#$&^_.+-/]+/gi, '');

    if (!sanitizedMimeType || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(sanitizedMimeType)) {
        return normalizedFromExtension;
    }

    if (!sanitizedMimeType.startsWith('image/')) {
        return normalizedFromExtension;
    }

    if (sanitizedMimeType === 'image/jpg') {
        return 'image/jpeg';
    }

    return sanitizedMimeType;
};

const getNormalizedImageFileName = (file = {}, prefix = 'image') => {
    const extension = getImageFileExtension(file);
    const rawName = String(file?.fileName || file?.name || file?.uri || '').trim();
    const baseName = rawName.split(/[\\/]/).pop()?.split('?')[0] || '';
    const sanitizedName = baseName
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/^-+|-+$/g, '');

    if (!sanitizedName) {
        return `${prefix}-${Date.now()}.${extension}`;
    }

    return /\.[a-z0-9]+$/i.test(sanitizedName)
        ? sanitizedName
        : `${sanitizedName}.${extension}`;
};

const readImageBase64FromUri = async (file = {}, { label = 'image', tempPrefix = 'image' } = {}) => {
    const sourceUri = String(file?.uri || '').trim();

    if (!sourceUri) {
        throw new Error(`${label} is missing its file location.`);
    }

    const dataUrlMatch = sourceUri.match(/^data:.*?;base64,(.+)$/i);
    if (dataUrlMatch?.[1]) {
        return dataUrlMatch[1].trim();
    }

    let workingUri = sourceUri;
    let tempUri = '';
    const readBase64 = async (targetUri) => {
        const base64 = await FileSystem.readAsStringAsync(targetUri, {
            encoding: FileSystem.EncodingType.Base64,
        });

        if (!String(base64 || '').trim()) {
            throw new Error(`The selected ${label} could not be read.`);
        }

        return String(base64).trim();
    };

    try {
        try {
            return await readBase64(sourceUri);
        } catch (directReadError) {
            if (!sourceUri.startsWith('content://')) {
                throw directReadError;
            }

            const cacheBase = FileSystem.cacheDirectory || FileSystem.documentDirectory;
            if (!cacheBase) {
                throw new Error(`No readable cache directory is available for the ${label}.`);
            }

            tempUri = `${cacheBase}${tempPrefix}-${Date.now()}.${getImageFileExtension(file)}`;
            await FileSystem.copyAsync({ from: sourceUri, to: tempUri });
            workingUri = tempUri;
            console.warn(`[upload] direct ${label} read failed, retrying from copied cache file.`, directReadError?.message || directReadError);
        }

        return await readBase64(workingUri);
    } catch (error) {
        console.error(`Error reading ${label}:`, error);
        throw new Error(`Could not read the selected ${label}. Please choose it again.`);
    } finally {
        if (tempUri) {
            try {
                await FileSystem.deleteAsync(tempUri, { idempotent: true });
            } catch (cleanupError) {
                console.warn(`Could not remove temporary ${label} file:`, cleanupError?.message || cleanupError);
            }
        }
    }
};

const normalizeImageAsset = async (file = {}, { label = 'image', defaultNamePrefix = 'image' } = {}) => {
    if (!file || typeof file !== 'object') {
        throw new Error(`${label} is required.`);
    }

    const existingBase64 = String(file?.base64 || '').trim();
    const normalizedUri = String(file?.uri || '').trim();
    const fileName = getNormalizedImageFileName(file, defaultNamePrefix);
    const mimeType = getDeliveryProofMimeType(file);
    const base64 = existingBase64 || await readImageBase64FromUri(file, {
        label,
        tempPrefix: defaultNamePrefix,
    });

    if (!base64) {
        throw new Error(`${label} is required.`);
    }

    console.log('[upload] normalized asset', {
        label,
        uriScheme: normalizedUri.split(':')[0] || 'unknown',
        hasBase64: Boolean(base64),
        fileName,
        mimeType,
    });

    return {
        ...file,
        uri: normalizedUri,
        fileName,
        name: String(file?.name || fileName).trim() || fileName,
        mimeType,
        type: mimeType,
        base64,
    };
};

const normalizeDeliveryProofFile = async (file = {}) => {
    const normalizedFile = await normalizeImageAsset(file, {
        label: 'proof photo',
        defaultNamePrefix: 'delivery-proof',
    });

    return {
        ...normalizedFile,
        fileName: getDeliveryProofFileName(normalizedFile),
        name: String(normalizedFile?.name || normalizedFile?.fileName).trim() || getDeliveryProofFileName(normalizedFile),
    };
};

const uploadNormalizedImageToBucket = async (
    file,
    {
        bucket,
        folder,
        fileNamePrefix,
        upsert = false,
        label = 'image',
    }
) => {
    const normalizedFile = await normalizeImageAsset(file, {
        label,
        defaultNamePrefix: fileNamePrefix,
    });
    const extension = getImageFileExtension(normalizedFile);
    const safeFolder = String(folder || '').trim().replace(/^\/+|\/+$/g, '');
    const fileName = `${safeFolder ? `${safeFolder}/` : ''}${fileNamePrefix}-${Date.now()}.${extension}`;
    const contentType = normalizedFile.mimeType || `image/${extension === 'jpg' ? 'jpeg' : extension}`;
    const arrayBuffer = decode(normalizedFile.base64);

    console.log('[upload] sending asset', {
        bucket,
        label,
        fileName,
        contentType,
        bytes: arrayBuffer?.byteLength || 0,
        upsert,
    });

    const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, arrayBuffer, {
            cacheControl: '3600',
            upsert,
            contentType,
        });

    if (uploadError) {
        console.error('[upload] storage error', {
            bucket,
            label,
            message: uploadError.message,
            name: uploadError.name,
        });
        throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(uploadData.path);
    return publicUrlData?.publicUrl || null;
};

const uploadDeliveryProofImage = async (file, { entityType, entityId, unitKey }) => {
    const normalizedProofFile = await normalizeDeliveryProofFile(file);

    const safeEntityType = String(entityType || 'delivery').trim().toLowerCase();
    const safeUnitKey = String(unitKey || 'stop').trim().replace(/[^a-z0-9_-]+/gi, '-');
    const extension = getImageFileExtension(normalizedProofFile);
    return uploadNormalizedImageToBucket(normalizedProofFile, {
        bucket: 'receipts',
        folder: 'delivery-proofs',
        fileNamePrefix: `${safeEntityType}-${entityId || 'record'}-${safeUnitKey}.${extension}`.replace(/\.[a-z0-9]+$/i, ''),
        upsert: false,
        label: 'proof photo',
    });
};

const normalizeDeliveryProofNote = (value) => {
    const trimmed = String(value || '').trim();
    return trimmed || '';
};

const buildDeliveryStopNotificationPayload = ({ entityType, record, stop }) => {
    const referenceNumber = entityType === 'request'
        ? record?.request_number || record?.id
        : record?.order_number || record?.id;
    const stopLabel = getDeliveryStopDisplayLabel(stop);
    const link = entityType === 'request'
        ? (
            String(record?.type || '').trim().toLowerCase() === 'customized'
                ? `/customized-request-tracking/${record?.request_number}`
                : `/request-tracking/${record?.request_number}`
        )
        : `/order-tracking/${record?.order_number}`;

    return {
        user_id: record?.user_id,
        title: 'Delivery proof uploaded',
        message: stopLabel
            ? `Proof of delivery for ${stopLabel} in ${entityType === 'request' ? 'request' : 'order'} #${referenceNumber} is now available.`
            : `Proof of delivery for ${entityType === 'request' ? 'request' : 'order'} #${referenceNumber} is now available.`,
        type: 'delivery_update',
        link,
    };
};

const maybeNotifyAssignedStopRiders = async ({ order, destinations }) => {
    if (!order?.id || !order?.order_number) {
        return;
    }

    const riderIds = getUniqueAssignedRiderIds(destinations);

    for (const riderId of riderIds) {
        const riderStops = groupDeliveryDestinations(
            (destinations || []).filter((destination) => String(destination?.assigned_rider_id || '') === riderId)
        );
        const stopCount = riderStops.length || 1;

        try {
            await insertNotificationRecord({
                user_id: riderId,
                title: 'New rider assignment',
                message: stopCount > 1
                    ? `You were assigned to ${stopCount} delivery stops for order #${order.order_number}.`
                    : `You were assigned to a delivery stop for order #${order.order_number}.`,
                type: 'rider_assignment',
                link: `orders/${order.id}`,
            });
        } catch (error) {
            console.error('Failed to send delivery stop notification:', error);
        }
    }
};

const maybeNotifyAssignedRequestStopRiders = async ({ request, destinations }) => {
    if (!request?.id || !request?.request_number) {
        return;
    }

    const riderIds = getUniqueAssignedRiderIds(destinations);

    for (const riderId of riderIds) {
        const riderStops = groupDeliveryDestinations(
            (destinations || []).filter((destination) => String(destination?.assigned_rider_id || '') === riderId)
        );
        const stopCount = riderStops.length || 1;

        try {
            await insertNotificationRecord({
                user_id: riderId,
                title: 'New rider assignment',
                message: stopCount > 1
                    ? `You were assigned to ${stopCount} delivery stops for request #${request.request_number}.`
                    : `You were assigned to a delivery stop for request #${request.request_number}.`,
                type: 'rider_assignment',
                link: `requests/${request.id}`,
            });
        } catch (error) {
            console.error('Failed to send request stop notification:', error);
        }
    }
};

const maybeNotifyAssignedRider = async ({ entityType, record }) => {
    if (!record?.assigned_rider) {
        return;
    }

    const referenceNumber = entityType === 'request'
        ? record?.request_number || record?.id
        : record?.order_number || record?.id;

    try {
        await insertNotificationRecord({
            user_id: record.assigned_rider,
            title: 'New rider assignment',
            message: entityType === 'request'
                ? `You were assigned to handle request #${referenceNumber}.`
                : `You were assigned to handle order #${referenceNumber}.`,
            type: 'rider_assignment',
            link: entityType === 'request'
                ? `requests/${record.id}`
                : `orders/${record.id}`,
        });
    } catch (error) {
        console.error('Failed to send rider assignment notification:', error);
    }
};

const withStatusTimestamp = (existingValue, status) => ({
    ...parseJsonObject(existingValue),
    [status]: new Date().toISOString(),
});

const syncRequestStockAllocationState = async (requestId, requestData, mode = 'release') => {
    const normalizedMode = String(mode || '').trim().toLowerCase();
    if (!requestId || !['reserve', 'release'].includes(normalizedMode)) {
        return false;
    }

    const parsedData = parseJsonObject(requestData);
    const stockAllocations = Array.isArray(parsedData?.stock_allocations) ? parsedData.stock_allocations : [];
    const allocationStatus = String(parsedData?.stock_allocation_status || '').trim().toLowerCase();

    if (!stockAllocations.length) {
        return false;
    }

    if (normalizedMode === 'reserve' && allocationStatus === 'reserved') {
        return false;
    }

    if (normalizedMode === 'release' && allocationStatus === 'released') {
        return false;
    }

    const { error } = await supabase.rpc('apply_request_stock_allocations', {
        p_request_id: requestId,
        p_allocations: stockAllocations,
        p_mode: normalizedMode,
    });

    if (error) {
        throw error;
    }

    return true;
};

const updateOrderStatusDirect = async (id, status, options = {}) => {
    let current = null;
    let fetchError = null;

    try {
        current = await getOrderById(id, 'id, status_timestamps, cancellation_reason, notes, assigned_rider');
    } catch (error) {
        fetchError = error;
    }

    if (!current && !fetchError) {
        fetchError = new Error('Order not found.');
    }

    if (fetchError) {
        if (fetchError.code === '42703' && String(fetchError.message || '').includes('orders.cancellation_reason')) {
            throw new Error('The orders.cancellation_reason column is missing. Apply the latest Supabase migration first.');
        }
        throw fetchError;
    }

    const cancellationReason = typeof options?.cancellationReason === 'string'
        ? options.cancellationReason.trim()
        : '';

    if (String(status || '').trim().toLowerCase() === 'out_for_delivery') {
        const parsedNotes = parseMultiDeliveryNotes(current?.notes);
        const assignmentError = getOutForDeliveryAssignmentError({
            recordType: 'order',
            destinations: parsedNotes.destinations,
            fallbackAssignedRiderId: current?.assigned_rider,
        });

        if (assignmentError) {
            throw new Error(assignmentError);
        }
    }

    const nextStatusTimestamps = withStatusTimestamp(current?.status_timestamps, status);

    if (status === 'cancelled' && cancellationReason) {
        nextStatusTimestamps.cancellation_reason = cancellationReason;
        nextStatusTimestamps.cancel_reason = cancellationReason;
    }

    const data = await updateOrderRecordAndReload(
        id,
        {
            status,
            status_timestamps: nextStatusTimestamps,
            cancellation_reason: status === 'cancelled'
                ? (cancellationReason || current?.cancellation_reason || null)
                : current?.cancellation_reason ?? null,
        },
        (order) => {
            const normalizedReason = status === 'cancelled'
                ? (cancellationReason || current?.cancellation_reason || null)
                : current?.cancellation_reason ?? null;

            return order?.status === status
                && order?.cancellation_reason === normalizedReason;
        }
    );

    return { success: true, order: data };
};

const updateOrderPaymentStatusDirect = async (id, status, options = {}) => {
    const { data: currentOrder, error: fetchError } = await supabase
        .from('orders')
        .select('total, amount_received')
        .eq('id', id)
        .single();

    if (fetchError) {
        throw fetchError;
    }

    const normalizedStatus = String(status || '').trim().toLowerCase();
    const orderTotal = parseMoney(currentOrder?.total);
    const hasExplicitAmountReceived = options?.amountReceived !== undefined && options?.amountReceived !== null && options?.amountReceived !== '';
    const explicitAmountReceived = hasExplicitAmountReceived
        ? Math.max(0, parseMoney(options?.amountReceived))
        : null;
    const updatePayload = { payment_status: status };

    if (hasExplicitAmountReceived) {
        updatePayload.amount_received = explicitAmountReceived;
    } else if (normalizedStatus === 'paid' && orderTotal > 0) {
        updatePayload.amount_received = orderTotal;
    }

    const data = await updateOrderRecordAndReload(
        id,
        updatePayload,
        (order) => {
            if (order?.payment_status !== status) {
                return false;
            }

            if (hasExplicitAmountReceived) {
                return Math.abs(parseMoney(order?.amount_received) - explicitAmountReceived) < 0.01;
            }

            if (normalizedStatus === 'paid' && orderTotal > 0) {
                return parseMoney(order?.amount_received) >= orderTotal;
            }

            return true;
        }
    );

    return { success: true, order: data };
};

const assignOrderRiderDirect = async (orderId, riderId, thirdPartyName = null, thirdPartyInfo = null) => {
    const updateData = riderId
        ? {
            assigned_rider: riderId,
            third_party_rider_name: null,
            third_party_rider_info: null,
        }
        : {
            assigned_rider: null,
            third_party_rider_name: thirdPartyName,
            third_party_rider_info: thirdPartyInfo,
        };

    const data = await updateOrderRecordAndReload(
        orderId,
        updateData,
        (order) => {
            const nextAssignedRider = riderId || null;
            return (order?.assigned_rider || null) === nextAssignedRider
                && (order?.third_party_rider_name || null) === (thirdPartyName || null)
                && (order?.third_party_rider_info || null) === (thirdPartyInfo || null);
        }
    );

    await maybeNotifyAssignedRider({
        entityType: 'order',
        record: data,
    });

    return { success: true, order: data };
};

const assignOrderStopRidersDirect = async (orderId, stopAssignments = []) => {
    const { data: currentOrder, error: fetchError } = await supabase
        .from('orders')
        .select('id, order_number, notes')
        .eq('id', orderId)
        .single();

    if (fetchError) {
        if (fetchError.code === '42703' && String(fetchError.message || '').includes('requests.cancellation_reason')) {
            throw new Error('The requests.cancellation_reason column is missing. Apply the latest Supabase migration first.');
        }
        throw fetchError;
    }

    const parsedNotes = parseMultiDeliveryNotes(currentOrder?.notes);
    if (!parsedNotes.destinations.length) {
        throw new Error('This order does not have multiple delivery stops to assign.');
    }

    const updatedDestinations = applyStopAssignmentsToDestinations(parsedNotes.destinations, stopAssignments);
    const assignedRiderIds = getUniqueAssignedRiderIds(updatedDestinations);

    const updatedNotes = serializeMultiDeliveryNotes({
        destinations: updatedDestinations,
        note: parsedNotes.note,
    });
    const nextAssignedRider = assignedRiderIds.length === 1 ? assignedRiderIds[0] : null;

    const { error } = await supabase
        .from('orders')
        .update({
            notes: updatedNotes,
            assigned_rider: nextAssignedRider,
            third_party_rider_name: null,
            third_party_rider_info: null,
        })
        .eq('id', orderId);

    if (error) {
        throw error;
    }

    const { data: refreshedOrder, error: refreshError } = await supabase
        .from('orders')
        .select('id, order_number, notes, assigned_rider, third_party_rider_name, third_party_rider_info')
        .eq('id', orderId)
        .maybeSingle();

    if (refreshError) {
        console.warn('Could not reload order after stop rider assignment:', refreshError.message);
    }

    const orderRecord = refreshedOrder || {
        ...currentOrder,
        notes: updatedNotes,
        assigned_rider: nextAssignedRider,
        third_party_rider_name: null,
        third_party_rider_info: null,
    };

    const persistedDestinations = parseMultiDeliveryNotes(orderRecord?.notes).destinations;
    const expectedAssignments = buildStopAssignmentLookup(stopAssignments);
    const assignmentsPersisted = Array.isArray(persistedDestinations)
        && persistedDestinations.every((destination) => {
            const unitKey = String(destination?.unit_key || '').trim();
            if (!expectedAssignments.has(unitKey)) {
                return true;
            }

            const expectedRiderId = expectedAssignments.get(unitKey);
            const actualRiderId = destination?.assigned_rider_id ? String(destination.assigned_rider_id) : null;
            return actualRiderId === expectedRiderId;
        });

    if (!refreshedOrder || !assignmentsPersisted) {
        throw new Error(
            'Different rider assignments were not saved. The updated manage-admin-workflows function still needs to be deployed to Supabase.'
        );
    }

    await maybeNotifyAssignedStopRiders({
        order: orderRecord,
        destinations: updatedDestinations,
    });

    return { success: true, order: orderRecord };
};

const completeOrderDeliveryStopDirect = async (orderId, unitKey, options = {}) => {
    const currentOrder = await getOrderById(orderId, '*, order_items(*)');
    if (!currentOrder) {
        throw new Error('Order not found.');
    }

    const parsedNotes = parseMultiDeliveryNotes(currentOrder?.notes);
    const normalizedStops = reconcileDeliveryDestinationsWithItems(
        parsedNotes.destinations,
        getOrderStopSourceItems(currentOrder)
    );

    if (!hasStopConfirmationFlow(normalizedStops)) {
        throw new Error('This order still uses the legacy delivery confirmation flow.');
    }

    if (String(currentOrder?.status || '').trim().toLowerCase() !== 'out_for_delivery') {
        throw new Error('Proof can only be uploaded once this order is marked out for delivery.');
    }

    const normalizedUnitKey = String(unitKey || '').trim();
    const stopToComplete = normalizedStops.find((stop) => stop.unit_key === normalizedUnitKey);

    if (!stopToComplete) {
        throw new Error('Delivery stop not found.');
    }

    if (stopToComplete.confirmation_owner !== 'rider') {
        throw new Error('This delivery stop is waiting for customer confirmation.');
    }

    if (stopToComplete.confirmation_status === 'confirmed') {
        return {
            success: true,
            order: {
                ...currentOrder,
                multi_delivery_destinations: normalizedStops,
            },
        };
    }

    if (!options?.proofFile?.base64 && !options?.proofFile?.uri) {
        throw new Error('Proof photo is required before completing this delivery stop.');
    }

    const fallbackAssignedRiderId = normalizedStops.length <= 1
        ? String(currentOrder?.assigned_rider || '').trim()
        : '';
    const assignedRiderId = String(
        stopToComplete?.assigned_rider_id || fallbackAssignedRiderId || ''
    ).trim();

    if (!assignedRiderId) {
        throw new Error('This delivery stop does not have an assigned rider yet.');
    }

    const actorType = String(options?.actorType || 'staff').trim().toLowerCase() === 'rider'
        ? 'rider'
        : 'staff';
    const confirmedAt = new Date().toISOString();
    const proofNote = normalizeDeliveryProofNote(options?.proofNote);
    console.log('[admin-perf] order delivery stop proof upload start', {
        orderId,
        unitKey,
    });
    const proofImageUrl = await uploadDeliveryProofImage(options.proofFile, {
        entityType: 'order',
        entityId: orderId,
        unitKey: normalizedUnitKey,
    });
    console.log('[admin-perf] order delivery stop proof upload success', {
        orderId,
        unitKey,
        hasProofImageUrl: Boolean(proofImageUrl),
    });
    const updatedDestinations = confirmDeliveryStop(normalizedStops, normalizedUnitKey, {
        actorType,
        actorUserId: options?.actorId || null,
        proofImageUrl,
        proofNote,
        confirmedAt,
    });
    const allConfirmed = areAllDeliveryStopsConfirmed(updatedDestinations);
    const updatePayload = {
        notes: serializeMultiDeliveryNotes({
            destinations: updatedDestinations,
            note: parsedNotes.note,
            metadata: parsedNotes.metadata,
        }),
    };

    if (allConfirmed) {
        updatePayload.status = 'completed';
        updatePayload.status_timestamps = withStatusTimestamp(currentOrder?.status_timestamps, 'completed');

        if (String(currentOrder?.payment_method || '').trim().toLowerCase() === 'cod') {
            updatePayload.payment_status = 'paid';
            updatePayload.amount_received = Math.max(
                parseMoney(currentOrder?.amount_received),
                parseMoney(currentOrder?.total)
            );
        }
    }

    const data = await updateOrderRecordAndReload(
        orderId,
        updatePayload,
        (order) => {
            const nextStops = reconcileDeliveryDestinationsWithItems(
                parseMultiDeliveryNotes(order?.notes).destinations,
                getOrderStopSourceItems(order)
            );
            const matchedStop = normalizeDeliveryDestinations(nextStops).find((stop) => stop.unit_key === normalizedUnitKey);

            if (!matchedStop || matchedStop.confirmation_status !== 'confirmed') {
                return false;
            }

            if (allConfirmed && order?.status !== 'completed') {
                return false;
            }

            return true;
        }
    );
    console.log('[admin-perf] order delivery stop db update success', {
        orderId,
        unitKey,
        allConfirmed,
    });

    if (currentOrder?.user_id) {
        try {
            await insertNotificationRecord(buildDeliveryStopNotificationPayload({
                entityType: 'order',
                record: currentOrder,
                stop: {
                    ...stopToComplete,
                    proof_image_url: proofImageUrl,
                    proof_note: proofNote,
                },
            }));
        } catch (error) {
            console.error('Failed to notify customer about order delivery proof:', error);
        }
    }

    return {
        success: true,
        order: {
            ...data,
            multi_delivery_destinations: updatedDestinations,
        },
    };
};

const provideQuoteDirect = async (id, price, shippingFee = 0, quoteBreakdown = null) => {
    const finalItemPrice = parseFloat(price) || 0;
    const finalShippingFee = parseFloat(shippingFee) || 0;

    const { data: existingRequest, error: fetchError } = await supabase
        .from('requests')
        .select('data, user_id, request_number, status, status_timestamps')
        .eq('id', id)
        .single();

    if (fetchError) {
        throw fetchError;
    }

    const existingStatus = String(existingRequest?.status || '').trim().toLowerCase();
    const shouldSetQuotedStatus = !existingStatus || existingStatus === 'pending';

    const updatePayload = {
        final_price: finalItemPrice + finalShippingFee,
        shipping_fee: finalShippingFee,
    };

    if (shouldSetQuotedStatus) {
        updatePayload.status = 'quoted';
        updatePayload.status_timestamps = withStatusTimestamp(existingRequest?.status_timestamps, 'quoted');
    }

    if (quoteBreakdown) {
        updatePayload.data = {
            ...parseJsonObject(existingRequest?.data),
            quote_breakdown: quoteBreakdown,
        };
    }

    const { data: request, error } = await supabase
        .from('requests')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    if (request?.user_id) {
        const { error: notificationError } = await supabase
            .from('notifications')
            .insert([{
                user_id: request.user_id,
                title: 'You have a new quote!',
                message: `A quote of PHP ${finalItemPrice.toFixed(2)} has been provided for your request #${request.request_number}. Please review and accept it.`,
                type: 'request_update',
                link: '/profile',
            }]);

        if (notificationError) {
            console.error('Failed to send quote notification:', notificationError);
        }
    }

    return { success: true, request };
};

const getMonthRange = (monthKey) => {
    const normalizedKey = String(monthKey || '').trim();
    if (!/^\d{4}-\d{2}$/.test(normalizedKey)) {
        return null;
    }

    const [yearText, monthText] = normalizedKey.split('-');
    const year = Number.parseInt(yearText, 10);
    const monthIndex = Number.parseInt(monthText, 10) - 1;

    if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
        return null;
    }

    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 1);

    return {
        key: normalizedKey,
        start,
        end,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label: start.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
    };
};

const getTodayRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return {
        key: 'today',
        start,
        end,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label: 'Today',
    };
};

const getWeekRange = () => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const start = new Date(end);
    start.setDate(end.getDate() - 7);

    return {
        key: 'week',
        start,
        end,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label: 'This Week',
    };
};

const getDateRange = (dateKey) => {
    const normalizedKey = String(dateKey || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedKey)) {
        return null;
    }

    const [yearText, monthText, dayText] = normalizedKey.split('-');
    const start = new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    if (
        Number.isNaN(start.getTime())
        || Number.isNaN(end.getTime())
        || start.getFullYear() !== Number(yearText)
        || start.getMonth() !== Number(monthText) - 1
        || start.getDate() !== Number(dayText)
    ) {
        return null;
    }

    return {
        key: normalizedKey,
        start,
        end,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label: start.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }),
    };
};

const formatDateKeyValue = (date) => {
    const parsed = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getCustomRange = (startKey, endKey) => {
    const startRange = getDateRange(startKey);
    const endRange = getDateRange(endKey);
    const fallbackRange = startRange || endRange;

    if (!fallbackRange) {
        return null;
    }

    let start = new Date((startRange || fallbackRange).start);
    let endBase = new Date((endRange || fallbackRange).start);

    if (endBase < start) {
        [start, endBase] = [endBase, start];
    }

    const end = new Date(endBase);
    end.setDate(end.getDate() + 1);

    const normalizedStartKey = formatDateKeyValue(start);
    const normalizedEndKey = formatDateKeyValue(endBase);
    const startLabel = start.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
    const endLabel = endBase.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });

    return {
        key: `range:${normalizedStartKey}:${normalizedEndKey}`,
        start,
        end,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label: normalizedStartKey === normalizedEndKey ? startLabel : `${startLabel} - ${endLabel}`,
    };
};

const normalizeSalesFilterArgs = (periodOrFilters = 'all', monthKey = null, dateKey = null, rangeStartKey = null, rangeEndKey = null) => {
    if (periodOrFilters && typeof periodOrFilters === 'object' && !Array.isArray(periodOrFilters)) {
        return {
            period: periodOrFilters.period || 'all',
            monthKey: periodOrFilters.monthKey || null,
            dateKey: periodOrFilters.dateKey || null,
            rangeStartKey: periodOrFilters.rangeStartKey || periodOrFilters.startKey || null,
            rangeEndKey: periodOrFilters.rangeEndKey || periodOrFilters.endKey || null,
        };
    }

    return {
        period: periodOrFilters || 'all',
        monthKey,
        dateKey,
        rangeStartKey,
        rangeEndKey,
    };
};

const getPeriodRange = (period = 'all', monthKey = null, dateKey = null, rangeStartKey = null, rangeEndKey = null) => {
    if (period === 'today') {
        return getTodayRange();
    }

    if (period === 'date') {
        return getDateRange(dateKey);
    }

    if (period === 'range') {
        return getCustomRange(rangeStartKey, rangeEndKey);
    }

    if (period === 'week') {
        return getWeekRange();
    }

    if (period === 'month') {
        return getMonthRange(monthKey);
    }

    return null;
};

const applyDateRangeToQuery = (query, column, range) => {
    if (!range) {
        return query;
    }

    return query
        .gte(column, range.startIso)
        .lt(column, range.endIso);
};

const isMissingTableColumnError = (error, tableName, columnName) => {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    const looksLikeMissingColumn = code === '42703'
        || code === 'PGRST204'
        || message.includes('schema cache')
        || message.includes('does not exist');

    if (!looksLikeMissingColumn) {
        return false;
    }

    return message.includes(`${tableName}.${columnName}`)
        || message.includes(`'${columnName}' column of '${tableName}'`)
        || (message.includes(tableName) && message.includes(columnName));
};

const getMissingRequestColumnFallback = (error, fallbacks, options) => (
    fallbacks.find(([columnName, optionKey]) => (
        options[optionKey] !== false
        && isMissingTableColumnError(error, 'requests', columnName)
    ))
);

const CREDIT_PAYMENT_STATUSES = new Set(['partial', 'to_pay', 'waiting_for_confirmation', 'failed']);
const UPCOMING_ORDER_STATUSES = new Set(['pending', 'processing', 'ready_for_pickup', 'out_for_delivery']);
const UPCOMING_REQUEST_STATUSES = new Set(['pending', 'quoted', 'accepted', 'processing', 'ready_for_pickup', 'out_for_delivery']);
const CLOSED_ORDER_STATUSES = new Set(['cancelled']);
const CLOSED_REQUEST_STATUSES = new Set(['cancelled', 'declined']);

const buildRequestSelectColumns = (baseColumns = [], optionalColumns = [], includeUsers = false) => {
    const columns = [...baseColumns];

    optionalColumns.forEach(({ enabled, column }) => {
        if (enabled !== false && column) {
            columns.push(column);
        }
    });

    if (includeUsers) {
        columns.push(`
            users (
                name,
                email
            )
        `);
    }

    return columns.join(', ');
};

const getMissingTableColumnFallback = (error, tableName, fallbacks, options) => (
    fallbacks.find(([columnName, optionKey]) => (
        options[optionKey] !== false
        && isMissingTableColumnError(error, tableName, columnName)
    ))
);

const ADMIN_REQUEST_QUERY_SESSION_CACHE = {
    requestOptionOverrides: {},
    disableEmbeddedUsers: false,
    userLookupOptionOverrides: {},
};

const ADMIN_ORDER_QUERY_SESSION_CACHE = {
    orderOptionOverrides: {},
    disableEmbeddedUsers: false,
};

const ORDER_QUERY_OPTION_FALLBACKS = [
    ['notes', 'includeNotes', 'notes'],
    ['cancellation_reason', 'includeCancellationReason', 'cancellation_reason'],
    ['payment_status', 'includePaymentStatus', 'payment_status'],
    ['payment_method', 'includePaymentMethod', 'payment_method'],
    ['receipt_url', 'includeReceiptUrl', 'receipt_url'],
    ['gcash_reference_number', 'includeGcashReferenceNumber', 'gcash_reference_number'],
    ['amount_received', 'includeAmountReceived', 'amount_received'],
    ['additional_receipts', 'includeAdditionalReceipts', 'additional_receipts'],
    ['assigned_rider', 'includeAssignedRider', 'assigned_rider'],
];

const ORDER_EMBEDDED_USER_FALLBACKS = [
    ['email', 'includeUserEmail', 'users.email'],
    ['phone', 'includeUserPhone', 'users.phone'],
];

const REQUEST_QUERY_OPTION_FALLBACKS = [
    ['image_url', 'includeImageUrl', 'image_url'],
    ['notes', 'includeNotes', 'notes'],
    ['cancellation_reason', 'includeCancellationReason', 'cancellation_reason'],
    ['delivery_method', 'includeDeliveryMethod', 'delivery_method'],
    ['pickup_time', 'includePickupTime', 'pickup_time'],
    ['final_price', 'includeFinalPrice', 'final_price'],
    ['shipping_fee', 'includeShippingFee', 'shipping_fee'],
    ['payment_status', 'includePaymentStatus', 'payment_status'],
    ['payment_method', 'includePaymentMethod', 'payment_method'],
    ['receipt_url', 'includeReceiptUrl', 'receipt_url'],
    ['gcash_reference_number', 'includeGcashReferenceNumber', 'gcash_reference_number'],
    ['amount_received', 'includeAmountReceived', 'amount_received'],
    ['additional_receipts', 'includeAdditionalReceipts', 'additional_receipts'],
    ['assigned_rider', 'includeAssignedRider', 'assigned_rider'],
    ['status_timestamps', 'includeStatusTimestamps', 'status_timestamps'],
];

const REQUEST_EMBEDDED_USER_FALLBACKS = [
    ['email', 'includeUserEmail', 'users.email'],
    ['phone', 'includeUserPhone', 'users.phone'],
];

const REQUEST_USER_LOOKUP_FALLBACKS = [
    ['email', 'includeEmail', 'users.email'],
    ['phone', 'includePhone', 'users.phone'],
];

const isUsersEmbedRelationshipError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    if (!message.includes('users')) {
        return false;
    }

    return message.includes('relationship')
        || message.includes('embedded resource')
        || message.includes('foreign key')
        || message.includes('schema cache')
        || message.includes('could not find')
        || message.includes('not found in the schema cache');
};

const buildAdminRequestSelectColumns = (options = {}) => {
    const columns = [
        'id',
        'request_number',
        'user_id',
        'type',
        'status',
        'contact_number',
        ...(options.includeImageUrl !== false ? ['image_url'] : []),
        ...(options.includeNotes !== false ? ['notes'] : []),
        ...(options.includeCancellationReason !== false ? ['cancellation_reason'] : []),
        'data',
        'created_at',
        ...(options.includeDeliveryMethod !== false ? ['delivery_method'] : []),
        ...(options.includePickupTime !== false ? ['pickup_time'] : []),
        ...(options.includeFinalPrice !== false ? ['final_price'] : []),
        ...(options.includeShippingFee !== false ? ['shipping_fee'] : []),
        ...(options.includePaymentStatus !== false ? ['payment_status'] : []),
        ...(options.includePaymentMethod !== false ? ['payment_method'] : []),
        ...(options.includeReceiptUrl !== false ? ['receipt_url'] : []),
        ...(options.includeGcashReferenceNumber !== false ? ['gcash_reference_number'] : []),
        ...(options.includeAmountReceived !== false ? ['amount_received'] : []),
        ...(options.includeAdditionalReceipts !== false ? ['additional_receipts'] : []),
        ...(options.includeAssignedRider !== false ? ['assigned_rider'] : []),
        ...(options.includeStatusTimestamps !== false ? ['status_timestamps'] : []),
    ];

    if (options.includeUsers !== false) {
        const userColumns = [
            'id',
            'name',
            ...(options.includeUserEmail !== false ? ['email'] : []),
            ...(options.includeUserPhone !== false ? ['phone'] : []),
        ];

        columns.push(`users (${userColumns.join(', ')})`);
    }

    return columns.join(', ');
};

const buildAdminRequestUserSelectColumns = (options = {}) => [
    'id',
    'name',
    ...(options.includeEmail !== false ? ['email'] : []),
    ...(options.includePhone !== false ? ['phone'] : []),
].join(', ');

const fetchAdminRequestUsersByIds = async (userIds = []) => {
    const normalizedIds = Array.from(new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean)));
    if (!normalizedIds.length) {
        return new Map();
    }

    let queryOptions = {
        includeEmail: true,
        includePhone: true,
        ...ADMIN_REQUEST_QUERY_SESSION_CACHE.userLookupOptionOverrides,
    };

    const runUserLookup = (options = {}) => supabase
        .from('users')
        .select(buildAdminRequestUserSelectColumns(options))
        .in('id', normalizedIds);

    let { data: users, error } = await runUserLookup(queryOptions);

    let shouldRetry = true;
    while (error && shouldRetry) {
        shouldRetry = false;

        const missingUserColumn = getMissingTableColumnFallback(
            error,
            'users',
            REQUEST_USER_LOOKUP_FALLBACKS,
            queryOptions
        );

        if (!missingUserColumn) {
            break;
        }

        const [, optionKey, columnLabel] = missingUserColumn;
        console.warn(`Users table is missing the ${columnLabel} column; retrying secondary request user lookup without it.`);
        queryOptions = { ...queryOptions, [optionKey]: false };
        ADMIN_REQUEST_QUERY_SESSION_CACHE.userLookupOptionOverrides[optionKey] = false;
        ({ data: users, error } = await runUserLookup(queryOptions));
        shouldRetry = Boolean(error);
    }

    if (error) {
        console.warn('Unable to hydrate request users from fallback lookup:', error.message || error);
        return new Map();
    }

    return (Array.isArray(users) ? users : []).reduce((userMap, user) => {
        if (user?.id != null) {
            userMap.set(String(user.id), user);
        }
        return userMap;
    }, new Map());
};

const parseMoney = (value) => {
    if (value === null || value === undefined || value === '') {
        return 0;
    }

    const normalized = typeof value === 'number'
        ? value
        : String(value).replace(/[^\d.-]/g, '');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeGcashReferenceValue = (value) => String(value || '').trim();

const normalizeAdditionalReceiptEntriesForAdmin = (value) => (
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
                    reference_number: normalizeGcashReferenceValue(
                        entry.reference_number || entry.referenceNumber || ''
                    ),
                    uploaded_at: entry.uploaded_at || entry.uploadedAt || null,
                };
            })
            .filter((entry) => entry?.url)
        : []
);

const getOrderPaymentMetadataFromNotes = (notes) => {
    const parsedNotes = parseMultiDeliveryNotes(notes);
    const paymentMetadata = parsedNotes?.metadata?.payment;

    if (!paymentMetadata || typeof paymentMetadata !== 'object' || Array.isArray(paymentMetadata)) {
        return {
            gcash_reference_number: '',
            additional_receipts: [],
        };
    }

    return {
        gcash_reference_number: normalizeGcashReferenceValue(
            paymentMetadata.gcash_reference_number || paymentMetadata.gcashReferenceNumber || ''
        ),
        additional_receipts: normalizeAdditionalReceiptEntriesForAdmin(
            paymentMetadata.additional_receipts || paymentMetadata.additionalReceipts || []
        ),
    };
};

const getRequestTentativeAmount = (request) => {
    const requestData = parseJsonObject(request?.data);
    const breakdown = requestData?.tentativeBreakdown || requestData?.tentative_breakdown || {};

    const candidates = [
        breakdown?.subtotalMax,
        breakdown?.subtotal_max,
        breakdown?.subtotalMin,
        breakdown?.subtotal_min,
        requestData?.tentativeTotalMax,
        requestData?.tentative_total_max,
        requestData?.tentativeTotalMin,
        requestData?.tentative_total_min,
        requestData?.estimatedTotal,
        requestData?.estimated_total,
    ].map(parseMoney).filter((value) => value > 0);

    return candidates.length ? Math.max(...candidates) : 0;
};

const getRequestShippingFeeAmount = (request = {}) => {
    const requestData = parseJsonObject(request?.data);
    const quoteBreakdown = parseJsonObject(requestData?.quote_breakdown || requestData?.quoteBreakdown);
    const quoteSummary = summarizeCustomOrderQuoteBreakdown(
        quoteBreakdown,
        request?.shipping_fee ?? requestData?.shipping_fee ?? requestData?.shippingFee ?? 0
    );

    return [
        quoteSummary?.shipping,
        quoteBreakdown?.shipping_fee,
        quoteBreakdown?.shippingFee,
        request?.shipping_fee,
        requestData?.shipping_fee,
        requestData?.shippingFee,
    ].map(parseMoney).find((amount) => amount > 0) || 0;
};

const parseRequestQuantity = (value, fallback = 0) => {
    const parsed = Number.parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getRequestItemOriginalQuantity = (item = {}) => {
    const quantityCandidates = [
        item?.original_quantity,
        item?.quantity,
        item?.qty,
        item?.arrangementQuantity,
        item?.arrangement_quantity,
    ];

    for (const candidate of quantityCandidates) {
        const parsed = parseRequestQuantity(candidate, 0);
        if (parsed > 0) {
            return parsed;
        }
    }

    return 1;
};

const getRequestItemCancelledQuantity = (item = {}) => {
    const originalQuantity = getRequestItemOriginalQuantity(item);
    const cancelledQuantity = parseRequestQuantity(
        item?.cancelled_quantity ?? item?.cancelledQuantity,
        0
    );

    return Math.min(originalQuantity, cancelledQuantity);
};

const getRequestItemRemainingQuantity = (item = {}) => (
    Math.max(0, getRequestItemOriginalQuantity(item) - getRequestItemCancelledQuantity(item))
);

const isCustomizedRequestItem = (item = {}, request = {}) => Boolean(
    request?.type === 'customized'
    || item?.bundleSize
    || Array.isArray(item?.flowers)
    || item?.flower
    || item?.wrapper
    || item?.ribbon
    || item?.previewComposition
    || item?.preview_composition
);

const getRequestItemUnitAmount = (item = {}, request = {}) => {
    const originalQuantity = Math.max(getRequestItemOriginalQuantity(item), 1);
    const totalPriceCandidates = [
        item?.total_price,
        item?.line_total,
        item?.lineTotal,
        item?.total,
        item?.estimatedPrice,
        item?.estimated_price,
        item?.final_price,
        isCustomizedRequestItem(item, request) ? item?.price : null,
    ];

    for (const candidate of totalPriceCandidates) {
        const parsed = parseMoney(candidate);
        if (parsed > 0) {
            return parsed / originalQuantity;
        }
    }

    const unitPriceCandidates = [
        item?.unit_price,
        item?.unitPrice,
        item?.price,
    ];

    for (const candidate of unitPriceCandidates) {
        if (candidate === null || candidate === undefined || candidate === '') {
            continue;
        }

        const parsed = parseMoney(candidate);
        if (parsed >= 0) {
            return parsed;
        }
    }

    return 0;
};

const getRequestSourceSubtotal = (request = {}) => {
    const requestData = parseJsonObject(request?.data);
    const quoteBreakdown = parseJsonObject(requestData?.quote_breakdown || requestData?.quoteBreakdown);
    const quoteSummary = summarizeCustomOrderQuoteBreakdown(quoteBreakdown);

    if (quoteSummary.lineItems.length) {
        return quoteSummary.subtotal;
    }

    const sourceItems = Array.isArray(requestData?.items)
        ? requestData.items.filter(Boolean)
        : [];

    if (sourceItems.length) {
        const hasCancelledItems = sourceItems.some((item) => getRequestItemCancelledQuantity(item) > 0);
        const hasActiveItems = sourceItems.some((item) => getRequestItemRemainingQuantity(item) > 0);

        if (hasCancelledItems && !hasActiveItems) {
            return 0;
        }

        return sourceItems.reduce((sum, item) => {
            const quantity = getRequestItemRemainingQuantity(item);
            const price = getRequestItemUnitAmount(item, request);
            return sum + (price * quantity);
        }, 0);
    }

    return 0;
};

const getRequestTotalAmount = (request, options = {}) => {
    const requestData = parseJsonObject(request?.data);
    const quoteBreakdown = parseJsonObject(requestData?.quote_breakdown || requestData?.quoteBreakdown);
    const quoteSummary = summarizeCustomOrderQuoteBreakdown(
        quoteBreakdown,
        request?.shipping_fee ?? requestData?.shipping_fee ?? requestData?.shippingFee ?? 0
    );
    const sourceItems = Array.isArray(requestData?.items)
        ? requestData.items.filter(Boolean)
        : [];
    const hasCancelledItems = sourceItems.some((item) => getRequestItemCancelledQuantity(item) > 0);
    const hasActiveItems = sourceItems.some((item) => getRequestItemRemainingQuantity(item) > 0);
    const sourceSubtotal = getRequestSourceSubtotal(request);
    const shippingFee = getRequestShippingFeeAmount(request);

    if (hasCancelledItems) {
        if (!hasActiveItems) {
            return 0;
        }

        if (quoteSummary.lineItems.length) {
            return sourceSubtotal + quoteSummary.shipping;
        }

        return sourceSubtotal + shippingFee;
    }

    const finalPrice = [
        hasCancelledItems ? null : request?.final_price,
        hasCancelledItems ? null : requestData?.final_price,
        hasCancelledItems ? null : requestData?.finalPrice,
        quoteSummary.lineItems.length ? quoteSummary.total : null,
        quoteBreakdown?.computed_total,
    ].map(parseMoney).find((amount) => amount > 0) || 0;
    if (finalPrice > 0) {
        return finalPrice;
    }

    if (sourceSubtotal > 0) {
        return sourceSubtotal + shippingFee;
    }

    const estimatedPrice = [
        request?.estimated_price,
        requestData?.estimated_price,
        requestData?.estimatedPrice,
        requestData?.estimated_total,
        requestData?.estimatedTotal,
    ].map(parseMoney).find((amount) => amount > 0) || 0;
    if (estimatedPrice > 0) {
        return estimatedPrice;
    }

    return options.allowTentative ? getRequestTentativeAmount(request) : 0;
};

const getTransactionTextValue = (value) => {
    if (Array.isArray(value)) {
        return value.map(getTransactionTextValue).filter(Boolean).join(', ');
    }

    if (value && typeof value === 'object') {
        return getTransactionTextValue(value.name || value.label || value.title || value.value);
    }

    return String(value ?? '').trim();
};

const getFirstTransactionText = (...values) => {
    for (const value of values) {
        const text = getTransactionTextValue(value);
        if (text) {
            return text;
        }
    }

    return '';
};

const getTransactionQuantity = (value) => {
    const parsed = Number.parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const buildRequestItemDescription = (item = {}) => {
    const arrangement = getFirstTransactionText(
        item?.arrangementSummary,
        item?.arrangementType,
        item?.arrangement_type,
        Array.isArray(item?.arrangementTypes) ? item.arrangementTypes.join(', ') : null
    );
    const occasion = getFirstTransactionText(item?.occasion, item?.otherOccasion);
    const flowers = getFirstTransactionText(item?.flowers, item?.flower, item?.selectedFlowers);
    const bundleSize = getFirstTransactionText(item?.bundleSize ? `${item.bundleSize} stems` : null);

    return [
        arrangement,
        occasion,
        bundleSize,
        flowers ? `Flowers: ${flowers}` : null,
    ].filter(Boolean).join(' | ');
};

const getRequestTransactionItems = (request = {}, saleAmount = 0) => {
    const requestData = parseJsonObject(request?.data);
    const quoteBreakdown = parseJsonObject(requestData?.quote_breakdown);
    const quoteLineItems = normalizeCustomOrderQuoteLineItems(quoteBreakdown)
        .filter((row) => row.type !== 'delivery');

    if (quoteLineItems.length) {
        return quoteLineItems.map((row, index) => {
            const quantity = row?.showQuantity ? Math.max(1, row?.quantity || 1) : 1;
            const lineTotal = parseMoney(row?.amount);
            const unitPrice = row?.showQuantity
                ? parseMoney(row?.unitAmount)
                : lineTotal;

            return {
                name: getFirstTransactionText(row?.label, row?.product_name, row?.productName, row?.name) || `Charge ${index + 1}`,
                quantity,
                price: unitPrice,
                lineTotal,
                description: [
                    getCustomOrderQuoteTypeLabel(row?.type),
                    getFirstTransactionText(row?.arrangementGroup, row?.arrangement_group),
                    getFirstTransactionText(row?.reason, row?.notes, row?.description),
                ].filter(Boolean).join(' | '),
            };
        });
    }

    const sourceItems = Array.isArray(requestData?.items)
        ? requestData.items.filter(Boolean)
        : [];

    if (sourceItems.length) {
        return sourceItems.map((item, index) => {
            const quantity = getRequestItemRemainingQuantity(item);
            const price = getRequestItemUnitAmount(item, request);
            const fallbackName = request?.type === 'customized'
                ? `Customizer Studio ${index + 1}`
                : `Custom Order ${index + 1}`;

            return {
                name: getFirstTransactionText(
                    item?.name,
                    item?.arrangementSummary,
                    item?.arrangementType,
                    item?.arrangement_type,
                    item?.bundleSize ? `Customized Bouquet (${item.bundleSize} stems)` : null,
                    item?.occasion
                ) || fallbackName,
                quantity,
                price,
                lineTotal: price * quantity,
                description: buildRequestItemDescription(item),
            };
        }).filter((item) => item.quantity > 0);
    }

    const fallbackName = getFirstTransactionText(
        requestData?.name,
        requestData?.summary_label,
        requestData?.bundleSize ? `Customized Bouquet (${requestData.bundleSize} stems)` : null,
        requestData?.arrangementSummary,
        requestData?.occasion
    );

    if (fallbackName || saleAmount > 0) {
        return [{
            name: fallbackName || 'Request sale',
            quantity: 1,
            price: saleAmount,
            lineTotal: saleAmount,
            description: '',
        }];
    }

    return [];
};

const getRequestTransactionDetails = (request = {}) => {
    const requestData = parseJsonObject(request?.data);
    const sourceItems = Array.isArray(requestData?.items) ? requestData.items.filter(Boolean) : [];
    const firstItem = sourceItems[0] || {};
    const address = parseJsonObject(requestData?.address);
    const finalPrice = getRequestTotalAmount(request);
    const shippingFee = getRequestShippingFeeAmount(request);
    const storedItemCount = parseMoney(requestData?.item_count ?? requestData?.itemCount);
    const hasCancelledItems = sourceItems.some((item) => getRequestItemCancelledQuantity(item) > 0);
    const derivedItemCount = sourceItems.reduce(
        (sum, item) => sum + getRequestItemRemainingQuantity(item),
        0
    );

    return {
        status: request?.status || requestData?.status || '',
        paymentStatus: request?.payment_status || requestData?.payment_status || '',
        paymentMethod: request?.payment_method || requestData?.payment_method || '',
        amountReceived: parseMoney(request?.amount_received ?? requestData?.amount_received),
        finalPrice,
        shippingFee,
        deliveryMethod: request?.delivery_method || requestData?.delivery_method || '',
        pickupTime: request?.pickup_time || requestData?.pickup_time || '',
        itemCount: sourceItems.length
            ? (hasCancelledItems ? derivedItemCount : (storedItemCount > 0 ? storedItemCount : derivedItemCount))
            : null,
        recipientName: getFirstTransactionText(
            firstItem?.recipientName,
            firstItem?.recipient_name,
            requestData?.recipientName,
            requestData?.recipient_name,
            address?.name
        ),
        occasion: getFirstTransactionText(firstItem?.occasion, firstItem?.otherOccasion, requestData?.occasion),
        eventDate: getFirstTransactionText(firstItem?.eventDate, firstItem?.event_date, requestData?.eventDate, requestData?.event_date),
        eventTime: getFirstTransactionText(firstItem?.eventTime, firstItem?.event_time, requestData?.eventTime, requestData?.event_time),
        venue: getFirstTransactionText(
            firstItem?.venue,
            firstItem?.delivery_address,
            requestData?.venue,
            requestData?.delivery_address,
            address?.address_line,
            address?.street,
            address?.barangay
        ),
        specialInstructions: getFirstTransactionText(
            firstItem?.specialInstructions,
            firstItem?.special_instructions,
            firstItem?.notes,
            requestData?.specialInstructions,
            requestData?.special_instructions
        ),
    };
};

const toAbsolutePublicImageUrl = (value) => {
    const text = String(value || '').trim();
    if (!text) {
        return null;
    }

    if (/^(https?:\/\/|data:)/i.test(text)) {
        return text;
    }

    return `${BASE_URL}${text.startsWith('/') ? text : `/${text}`}`;
};

const normalizeBestSellerName = (value) => String(value || '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getFlowerNamesFromValue = (value) => {
    if (!value) {
        return [];
    }

    const names = [];
    const pushName = (candidate) => {
        const normalized = normalizeBestSellerName(candidate);
        if (normalized && !names.includes(normalized)) {
            names.push(normalized);
        }
    };

    if (Array.isArray(value)) {
        value.forEach((entry) => {
            if (!entry) return;
            if (typeof entry === 'string') {
                pushName(entry);
                return;
            }

            pushName(entry.name || entry.label || entry.value || entry.title);
        });
        return names;
    }

    if (typeof value === 'string') {
        value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .forEach(pushName);
        return names;
    }

    if (typeof value === 'object') {
        pushName(value.name || value.label || value.value || value.title);
    }

    return names;
};

const buildFlowerImageLookup = (flowers = []) => {
    const imageLookup = new Map();

    (Array.isArray(flowers) ? flowers : []).forEach((flower) => {
        const normalizedName = normalizeBestSellerName(
            flower?.name || flower?.label || flower?.value || flower?.title
        );
        const imageUrl = toAbsolutePublicImageUrl(
            flower?.image_url
            || flower?.img
            || flower?.stemImg
            || flower?.stem_image_url
            || flower?.layerImg
            || flower?.layer_image_url
        );

        if (normalizedName && imageUrl && !imageLookup.has(normalizedName)) {
            imageLookup.set(normalizedName, imageUrl);
        }
    });

    return imageLookup;
};

const mergeFlowerImageLookups = (...lookups) => {
    const mergedLookup = new Map();

    lookups.forEach((lookup) => {
        if (!(lookup instanceof Map)) {
            return;
        }

        lookup.forEach((value, key) => {
            if (key && value && !mergedLookup.has(key)) {
                mergedLookup.set(key, value);
            }
        });
    });

    return mergedLookup;
};

const buildFlowerImageLookupFromCatalogRows = (rows = []) => buildFlowerImageLookup(
    (Array.isArray(rows) ? rows : []).map((row) => ({
        name: row?.name,
        image_url: row?.image_url
            || row?.preview_image_url
            || row?.stem_image_url
            || row?.layer_image_url,
        img: row?.img,
        stemImg: row?.stemImg,
        layerImg: row?.layerImg,
    }))
);

const addFlowerBreakdownEntry = (breakdownMap, name, quantity, imageUrl = null) => {
    const normalizedName = normalizeBestSellerName(name);
    const safeQuantity = parseMoney(quantity);

    if (!normalizedName || safeQuantity <= 0) {
        return;
    }

    const current = breakdownMap.get(normalizedName) || {
        name: normalizedName,
        quantity: 0,
        image_url: null,
    };

    current.quantity += safeQuantity;
    if (!current.image_url && imageUrl) {
        current.image_url = toAbsolutePublicImageUrl(imageUrl);
    }

    breakdownMap.set(normalizedName, current);
};

const addFlowerBreakdownFromObject = (breakdownMap, source, imageLookup = new Map()) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return;
    }

    Object.entries(source).forEach(([name, quantity]) => {
        const normalizedName = normalizeBestSellerName(name);
        addFlowerBreakdownEntry(
            breakdownMap,
            normalizedName,
            quantity,
            imageLookup.get(normalizedName) || null
        );
    });
};

const addRoundRobinFlowerBreakdown = (breakdownMap, flowerNames = [], totalQuantity = 0, imageLookup = new Map()) => {
    const normalizedNames = Array.from(
        new Set((Array.isArray(flowerNames) ? flowerNames : [])
            .map((name) => normalizeBestSellerName(name))
            .filter(Boolean))
    );

    if (!normalizedNames.length) {
        return;
    }

    const parsedQuantity = Math.round(parseMoney(totalQuantity));
    const safeTotalQuantity = parsedQuantity > 0 ? parsedQuantity : normalizedNames.length;

    for (let index = 0; index < safeTotalQuantity; index += 1) {
        const name = normalizedNames[index % normalizedNames.length];
        addFlowerBreakdownEntry(
            breakdownMap,
            name,
            1,
            imageLookup.get(name) || null
        );
    }
};

const getArrangementSelectionFlowerTotal = (selection = {}) => {
    const directTotal = Math.round(parseMoney(
        selection?.total_flowers
        ?? selection?.totalFlowers
    ));

    if (directTotal > 0) {
        return directTotal;
    }

    const flowersPerArrangement = parseMoney(
        selection?.flowers_per_arrangement
        ?? selection?.flowersPerArrangement
    );
    const quantity = parseMoney(selection?.quantity ?? selection?.arrangement_quantity);

    if (flowersPerArrangement > 0) {
        return Math.round(flowersPerArrangement * (quantity > 0 ? quantity : 1));
    }

    return 0;
};

const getRequestItemFlowerTotal = (item = {}) => {
    const directTotal = Math.round(parseMoney(
        item?.totalFlowers
        ?? item?.total_flowers
        ?? item?.total_flower_count
        ?? item?.flowerQuantity
        ?? item?.flower_quantity
        ?? item?.bundleSize
    ));

    if (directTotal > 0) {
        return directTotal;
    }

    const arrangementSelections = Array.isArray(item?.arrangementSelections)
        ? item.arrangementSelections
        : [];

    const arrangementTotal = arrangementSelections.reduce(
        (sum, selection) => sum + getArrangementSelectionFlowerTotal(selection),
        0
    );

    return arrangementTotal > 0 ? arrangementTotal : 0;
};

const getRequestBestSellerItems = (request = {}) => {
    const requestData = parseJsonObject(request?.data);

    if (Array.isArray(requestData?.items) && requestData.items.length) {
        return requestData.items.filter(Boolean);
    }

    const hasLegacyItemData = Boolean(
        requestData?.bundleSize
        || requestData?.flower
        || requestData?.flowers
        || requestData?.flowerQuantities
        || requestData?.flower_quantities
        || requestData?.selectedFlowers
        || requestData?.customerPreferredFlowers
        || requestData?.customer_preferred_flowers
        || (Array.isArray(requestData?.arrangementSelections) && requestData.arrangementSelections.length)
    );

    return hasLegacyItemData ? [requestData] : [];
};

const buildCustomizedFlowerBreakdown = (item = {}, fallbackImageLookup = new Map()) => {
    const breakdownMap = new Map();
    const flowerEntries = Array.isArray(item?.flowers)
        ? item.flowers
        : item?.flower
            ? [item.flower]
            : [];
    const imageLookup = mergeFlowerImageLookups(
        buildFlowerImageLookup(flowerEntries),
        fallbackImageLookup
    );
    const flowerAllocations = Array.isArray(item?.flowerAllocations)
        ? item.flowerAllocations
        : (Array.isArray(item?.flower_allocations) ? item.flower_allocations : []);

    if (flowerAllocations.length) {
        flowerAllocations.forEach((allocation) => {
            const stockId = String(
                allocation?.stock_product_id
                ?? allocation?.id
                ?? allocation?.flowerId
                ?? ''
            ).trim();
            const matchedFlower = flowerEntries.find((flower) => (
                String(flower?.id ?? flower?.stock_product_id ?? '').trim() === stockId
            ));
            const flowerName = matchedFlower?.name
                || allocation?.name
                || allocation?.flowerName
                || allocation?.label;

            addFlowerBreakdownEntry(
                breakdownMap,
                flowerName,
                allocation?.quantity,
                matchedFlower?.image_url
                || matchedFlower?.img
                || matchedFlower?.stemImg
                || matchedFlower?.layerImg
                || imageLookup.get(normalizeBestSellerName(flowerName))
            );
        });
    }

    if (!breakdownMap.size) {
        const flowerNames = flowerEntries.length
            ? flowerEntries.map((flower) => flower?.name)
            : getFlowerNamesFromValue(item?.flowers || item?.flower || item?.selectedFlowers);
        addRoundRobinFlowerBreakdown(
            breakdownMap,
            flowerNames,
            item?.bundleSize,
            imageLookup
        );
    }

    return Array.from(breakdownMap.values());
};

const buildBookingFlowerBreakdown = (item = {}, fallbackImageLookup = new Map()) => {
    const breakdownMap = new Map();
    const imageLookup = mergeFlowerImageLookups(
        buildFlowerImageLookup(Array.isArray(item?.flowers) ? item.flowers : []),
        fallbackImageLookup
    );

    addFlowerBreakdownFromObject(
        breakdownMap,
        item?.flowerQuantities || item?.flower_quantities || item?.flowerBreakdown,
        imageLookup
    );

    if (!breakdownMap.size) {
        const arrangementSelections = Array.isArray(item?.arrangementSelections)
            ? item.arrangementSelections
            : [];

        arrangementSelections.forEach((selection) => {
            const selectionFlowerQuantities = selection?.flowerQuantities
                || selection?.flower_quantities
                || selection?.flowerBreakdown;

            if (selectionFlowerQuantities) {
                addFlowerBreakdownFromObject(breakdownMap, selectionFlowerQuantities, imageLookup);
                return;
            }

            const selectionFlowerNames = getFlowerNamesFromValue(
                selection?.preferredFlowerNames
                ?? selection?.preferredFlowers
                ?? selection?.preferred_flowers
                ?? selection?.customerPreferredFlowers
                ?? selection?.customer_preferred_flowers
                ?? selection?.selectedFlowers
                ?? selection?.flowers
            );
            addRoundRobinFlowerBreakdown(
                breakdownMap,
                selectionFlowerNames,
                getArrangementSelectionFlowerTotal(selection),
                imageLookup
            );
        });
    }

    if (!breakdownMap.size) {
        const fallbackFlowerNames = getFlowerNamesFromValue(
            item?.customerPreferredFlowers
            ?? item?.customer_preferred_flowers
            ?? item?.preferredFlowers
            ?? item?.preferred_flowers
            ?? item?.selectedFlowers
            ?? item?.flowers
            ?? item?.flower
        );

        addRoundRobinFlowerBreakdown(
            breakdownMap,
            fallbackFlowerNames,
            getRequestItemFlowerTotal(item),
            imageLookup
        );
    }

    return Array.from(breakdownMap.values());
};

const getRequestItemLineAmount = (item = {}, request = {}) => {
    const remainingQuantity = getRequestItemRemainingQuantity(item);
    if (remainingQuantity <= 0) {
        return 0;
    }

    const unitAmount = getRequestItemUnitAmount(item, request);
    if (unitAmount > 0) {
        return unitAmount * remainingQuantity;
    }

    return 0;
};

const getRequestBestSellerFlowerEntries = (request = {}, saleAmount = 0, fallbackImageLookup = new Map()) => {
    const requestType = String(request?.type || '').trim().toLowerCase();
    if (!['booking', 'customized'].includes(requestType)) {
        return [];
    }

    const sourceItems = getRequestBestSellerItems(request);
    if (!sourceItems.length) {
        return [];
    }

    const requestSubtotalFallback = Math.max(
        0,
        parseMoney(saleAmount)
        || (getRequestTotalAmount(request) - getRequestShippingFeeAmount(request))
    );

    return sourceItems.flatMap((item) => {
        const flowerEntries = requestType === 'customized'
            ? buildCustomizedFlowerBreakdown(item, fallbackImageLookup)
            : buildBookingFlowerBreakdown(item, fallbackImageLookup);
        const totalFlowerQuantity = flowerEntries.reduce((sum, entry) => sum + parseMoney(entry.quantity), 0);

        if (totalFlowerQuantity <= 0) {
            return [];
        }

        let itemLineAmount = getRequestItemLineAmount(item, request);
        if (itemLineAmount <= 0 && sourceItems.length === 1) {
            itemLineAmount = requestSubtotalFallback;
        }

        return flowerEntries.map((entry) => ({
            name: entry.name,
            image_url: entry.image_url || null,
            request_type: requestType,
            quantity: parseMoney(entry.quantity),
            revenue: itemLineAmount > 0
                ? (itemLineAmount * parseMoney(entry.quantity)) / totalFlowerQuantity
                : 0,
        }));
    });
};

const addBestSellerAggregate = (aggregateMap, entry = {}) => {
    const itemKey = String(entry?.item_key || '').trim();
    const quantity = parseMoney(entry?.total_sold);
    const revenue = parseMoney(entry?.total_revenue);

    if (!itemKey || quantity <= 0) {
        return;
    }

    const current = aggregateMap.get(itemKey) || {
        item_key: itemKey,
        product_id: entry?.product_id || null,
        name: entry?.name || 'Unknown',
        image_url: entry?.image_url || null,
        entry_type: entry?.entry_type || 'catalog_product',
        source_label: entry?.source_label || 'Catalog Product',
        total_sold: 0,
        total_revenue: 0,
    };

    current.total_sold += quantity;
    current.total_revenue += revenue;
    if (!current.image_url && entry?.image_url) {
        current.image_url = entry.image_url;
    }

    aggregateMap.set(itemKey, current);
};

const getTransactionStatusDate = (record = {}) => {
    const timestamps = parseJsonObject(record?.status_timestamps);
    const candidates = [
        record?.sale_date,
        timestamps?.claimed,
        timestamps?.completed,
        timestamps?.paid,
        record?.updated_at,
        record?.created_at,
    ];

    for (const candidate of candidates) {
        if (!candidate) continue;
        const parsed = new Date(candidate);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    return null;
};

const isDateInRange = (dateValue, range) => {
    if (!range) {
        return true;
    }

    const parsed = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
        return false;
    }

    return parsed >= range.start && parsed < range.end;
};

const getRemainingBalance = (totalAmount, amountReceived) => {
    return Math.max(0, parseMoney(totalAmount) - parseMoney(amountReceived));
};

const getOutstandingBalance = (totalAmount, amountReceived, paymentStatus) => {
    const normalizedStatus = String(paymentStatus || '').trim().toLowerCase();

    if (normalizedStatus === 'paid') {
        return 0;
    }

    return getRemainingBalance(totalAmount, amountReceived);
};

const getCollectedCashAmount = (totalAmount, amountReceived, paymentStatus) => {
    const safeTotal = parseMoney(totalAmount);
    const safeReceived = parseMoney(amountReceived);
    const normalizedStatus = String(paymentStatus || '').trim().toLowerCase();

    if (normalizedStatus === 'paid') {
        return safeTotal > 0 ? safeTotal : safeReceived;
    }

    if (safeTotal <= 0) {
        return safeReceived;
    }

    return Math.min(safeTotal, safeReceived);
};

const addLiveSaleRow = (rows, dateValue, amount) => {
    const saleAmount = parseMoney(amount);
    if (!dateValue || saleAmount <= 0) {
        return;
    }

    rows.push({
        sale_date: dateValue,
        total_amount: saleAmount,
    });
};

const sumSaleRowsInRange = (rows = [], range = null) => rows.reduce((sum, sale) => {
    const saleDate = new Date(sale.sale_date);
    const saleAmount = parseMoney(sale.total_amount);

    if (Number.isNaN(saleDate.getTime()) || saleAmount <= 0) {
        return sum;
    }

    if (!range) {
        return sum + saleAmount;
    }

    return saleDate >= range.start && saleDate < range.end ? sum + saleAmount : sum;
}, 0);

const getOrderLiveSaleAmount = (order = {}) => {
    const status = String(order?.status || '').trim().toLowerCase();
    if (CLOSED_ORDER_STATUSES.has(status)) {
        return 0;
    }

    return getCollectedCashAmount(
        order?.total,
        order?.amount_received,
        order?.payment_status
    );
};

const getRequestLiveSaleAmount = (request = {}) => {
    const status = String(request?.status || '').trim().toLowerCase();
    if (CLOSED_REQUEST_STATUSES.has(status)) {
        return 0;
    }

    const requestDetails = getRequestTransactionDetails(request);
    return getCollectedCashAmount(
        getRequestTotalAmount(request),
        requestDetails.amountReceived,
        requestDetails.paymentStatus
    );
};

const getRequestScheduleDate = (request) => {
    const requestData = parseJsonObject(request?.data);
    const dateValue = request?.event_date
        || requestData?.dateNeeded
        || requestData?.date_needed
        || requestData?.eventDate
        || requestData?.event_date
        || null;

    if (!dateValue) {
        return null;
    }

    const parsed = new Date(dateValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const updateRequestStatusDirect = async (id, status, options = {}) => {
    const { data: current, error: fetchError } = await supabase
        .from('requests')
        .select('status_timestamps, data, user_id, request_number, cancellation_reason, assigned_rider')
        .eq('id', id)
        .single();

    if (fetchError) {
        throw fetchError;
    }

    const updatePayload = {
        status,
        status_timestamps: withStatusTimestamp(current?.status_timestamps, status),
    };
    const cancellationReason = typeof options?.cancellationReason === 'string'
        ? options.cancellationReason.trim()
        : '';

    if (String(status || '').trim().toLowerCase() === 'out_for_delivery') {
        const currentData = parseJsonObject(current?.data);
        const assignmentError = getOutForDeliveryAssignmentError({
            recordType: 'request',
            destinations: currentData?.multi_delivery_destinations || [],
            fallbackAssignedRiderId: current?.assigned_rider,
            items: Array.isArray(currentData?.items) ? currentData.items : [],
        });

        if (assignmentError) {
            throw new Error(assignmentError);
        }
    }

    if (status === 'cancelled' || status === 'declined') {
        updatePayload.cancellation_reason = cancellationReason || current?.cancellation_reason || null;
    }

    if (options?.dataPatch && typeof options.dataPatch === 'object') {
        updatePayload.data = {
            ...parseJsonObject(current?.data),
            ...options.dataPatch,
        };
    }

    const { data, error } = await supabase
        .from('requests')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    const shouldReleaseStock = status === 'cancelled' || status === 'declined';
    let requestRecord = data;

    if (shouldReleaseStock) {
        const released = await syncRequestStockAllocationState(id, current?.data, 'release');
        if (released) {
            const { data: refreshedRequest, error: refreshError } = await supabase
                .from('requests')
                .select('*')
                .eq('id', id)
                .single();

            if (refreshError) {
                throw refreshError;
            }

            requestRecord = refreshedRequest;
        }
    }

    if (options?.notification && requestRecord?.user_id) {
        const notificationConfig = options.notification;
        const { error: notificationError } = await supabase
            .from('notifications')
            .insert([{
                user_id: requestRecord.user_id,
                title: notificationConfig.title || 'Request status updated',
                message: notificationConfig.message || `Your request #${requestRecord.request_number || current?.request_number || id} is now ${status}.`,
                type: notificationConfig.type || 'request_update',
                link: notificationConfig.link || '/profile',
            }]);

        if (notificationError) {
            console.error('Failed to send request status notification:', notificationError);
        }
    }

    return { success: true, request: requestRecord };
};

const updateRequestPaymentStatusDirect = async (requestId, requestType, status) => {
    const { data: currentRequest, error: fetchError } = await supabase
        .from('requests')
        .select('status, status_timestamps, type, data')
        .eq('id', requestId)
        .single();

    if (fetchError) {
        throw fetchError;
    }

    const resolvedRequestType = requestType || currentRequest?.type || null;
    const updatePayload = { payment_status: status };

    if (resolvedRequestType === 'customized') {
        updatePayload.data = {
            ...parseJsonObject(currentRequest?.data),
            payment_status: status,
        };
    }

    if (status === 'paid' && currentRequest?.status === 'accepted') {
        updatePayload.status = 'processing';
        updatePayload.status_timestamps = withStatusTimestamp(currentRequest?.status_timestamps, 'processing');
    }

    const { data, error } = await supabase
        .from('requests')
        .update(updatePayload)
        .eq('id', requestId)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return { success: true, request: data };
};

const assignRequestRiderDirect = async (requestId, riderId, thirdPartyName = null, thirdPartyInfo = null) => {
    const updateData = riderId
        ? {
            assigned_rider: riderId,
            third_party_rider_name: null,
            third_party_rider_info: null,
        }
        : {
            assigned_rider: null,
            third_party_rider_name: thirdPartyName,
            third_party_rider_info: thirdPartyInfo,
        };

    const { data, error } = await supabase
        .from('requests')
        .update(updateData)
        .eq('id', requestId)
        .select()
        .single();

    if (error) {
        throw error;
    }

    await maybeNotifyAssignedRider({
        entityType: 'request',
        record: data,
    });

    return { success: true, request: data };
};

const assignRequestStopRidersDirect = async (requestId, stopAssignments = []) => {
    const { data: currentRequest, error: fetchError } = await supabase
        .from('requests')
        .select('id, request_number, data, assigned_rider, third_party_rider_name, third_party_rider_info')
        .eq('id', requestId)
        .single();

    if (fetchError) {
        throw fetchError;
    }

    const currentData = parseJsonObject(currentRequest?.data);
    const currentDestinations = Array.isArray(currentData?.multi_delivery_destinations)
        ? currentData.multi_delivery_destinations
        : [];

    if (!currentDestinations.length) {
        throw new Error('This request does not have multiple delivery stops to assign.');
    }

    const updatedDestinations = applyStopAssignmentsToDestinations(currentDestinations, stopAssignments);
    const assignedRiderIds = getUniqueAssignedRiderIds(updatedDestinations);
    const nextAssignedRider = assignedRiderIds.length === 1 ? assignedRiderIds[0] : null;
    const updatedData = {
        ...currentData,
        multi_delivery_destinations: updatedDestinations,
    };

    const { error } = await supabase
        .from('requests')
        .update({
            data: updatedData,
            assigned_rider: nextAssignedRider,
            third_party_rider_name: null,
            third_party_rider_info: null,
        })
        .eq('id', requestId);

    if (error) {
        throw error;
    }

    const { data: refreshedRequest, error: refreshError } = await supabase
        .from('requests')
        .select('id, request_number, data, assigned_rider, third_party_rider_name, third_party_rider_info')
        .eq('id', requestId)
        .maybeSingle();

    if (refreshError) {
        console.warn('Could not reload request after stop rider assignment:', refreshError.message);
    }

    const requestRecord = refreshedRequest || {
        ...currentRequest,
        data: updatedData,
        assigned_rider: nextAssignedRider,
        third_party_rider_name: null,
        third_party_rider_info: null,
    };

    const persistedData = parseJsonObject(requestRecord?.data);
    const persistedDestinations = Array.isArray(persistedData?.multi_delivery_destinations)
        ? persistedData.multi_delivery_destinations
        : [];
    const expectedAssignments = buildStopAssignmentLookup(stopAssignments);
    const assignmentsPersisted = Array.isArray(persistedDestinations)
        && persistedDestinations.every((destination) => {
            const unitKey = String(destination?.unit_key || '').trim();
            if (!expectedAssignments.has(unitKey)) {
                return true;
            }

            const expectedRiderId = expectedAssignments.get(unitKey);
            const actualRiderId = destination?.assigned_rider_id ? String(destination.assigned_rider_id) : null;
            return actualRiderId === expectedRiderId;
        });

    if (!refreshedRequest || !assignmentsPersisted) {
        throw new Error(
            'Different rider assignments were not saved. The updated manage-admin-workflows function still needs to be deployed to Supabase.'
        );
    }

    await maybeNotifyAssignedRequestStopRiders({
        request: requestRecord,
        destinations: updatedDestinations,
    });

    return { success: true, request: requestRecord };
};

const completeRequestDeliveryStopDirect = async (requestId, unitKey, options = {}) => {
    const { data: currentRequest, error: fetchError } = await supabase
        .from('requests')
        .select('*')
        .eq('id', requestId)
        .single();

    if (fetchError) {
        throw fetchError;
    }

    const currentData = parseJsonObject(currentRequest?.data);
    const normalizedStops = reconcileDeliveryDestinationsWithItems(
        currentData?.multi_delivery_destinations || [],
        Array.isArray(currentData?.items) ? currentData.items : []
    );

    if (!hasStopConfirmationFlow(normalizedStops)) {
        throw new Error('This request still uses the legacy delivery confirmation flow.');
    }

    if (String(currentRequest?.status || '').trim().toLowerCase() !== 'out_for_delivery') {
        throw new Error('Proof can only be uploaded once this request is marked out for delivery.');
    }

    const normalizedUnitKey = String(unitKey || '').trim();
    const stopToComplete = normalizedStops.find((stop) => stop.unit_key === normalizedUnitKey);

    if (!stopToComplete) {
        throw new Error('Delivery stop not found.');
    }

    if (stopToComplete.confirmation_owner !== 'rider') {
        throw new Error('This delivery stop is waiting for customer confirmation.');
    }

    if (stopToComplete.confirmation_status === 'confirmed') {
        return {
            success: true,
            request: {
                ...currentRequest,
                data: {
                    ...currentData,
                    multi_delivery_destinations: normalizedStops,
                },
            },
        };
    }

    if (!options?.proofFile?.base64 && !options?.proofFile?.uri) {
        throw new Error('Proof photo is required before completing this delivery stop.');
    }

    const fallbackAssignedRiderId = normalizedStops.length <= 1
        ? String(currentRequest?.assigned_rider || '').trim()
        : '';
    const assignedRiderId = String(
        stopToComplete?.assigned_rider_id || fallbackAssignedRiderId || ''
    ).trim();

    if (!assignedRiderId) {
        throw new Error('This delivery stop does not have an assigned rider yet.');
    }

    const actorType = String(options?.actorType || 'staff').trim().toLowerCase() === 'rider'
        ? 'rider'
        : 'staff';
    const confirmedAt = new Date().toISOString();
    const proofNote = normalizeDeliveryProofNote(options?.proofNote);
    console.log('[admin-perf] request delivery stop proof upload start', {
        requestId,
        unitKey,
    });
    const proofImageUrl = await uploadDeliveryProofImage(options.proofFile, {
        entityType: String(currentRequest?.type || 'request').trim().toLowerCase() || 'request',
        entityId: requestId,
        unitKey: normalizedUnitKey,
    });
    console.log('[admin-perf] request delivery stop proof upload success', {
        requestId,
        unitKey,
        hasProofImageUrl: Boolean(proofImageUrl),
    });
    const updatedDestinations = confirmDeliveryStop(normalizedStops, normalizedUnitKey, {
        actorType,
        actorUserId: options?.actorId || null,
        proofImageUrl,
        proofNote,
        confirmedAt,
    });
    const allConfirmed = areAllDeliveryStopsConfirmed(updatedDestinations);
    const nextData = {
        ...currentData,
        multi_delivery_destinations: updatedDestinations,
    };
    const updatePayload = {
        data: nextData,
    };

    if (allConfirmed) {
        updatePayload.status = 'completed';
        updatePayload.status_timestamps = withStatusTimestamp(currentRequest?.status_timestamps, 'completed');

        if (String(currentRequest?.payment_method || currentData?.payment_method || '').trim().toLowerCase() === 'cod') {
            const paidAmount = Math.max(
                parseMoney(currentRequest?.amount_received),
                parseMoney(currentRequest?.final_price || currentData?.final_price)
            );

            updatePayload.payment_status = 'paid';
            updatePayload.amount_received = paidAmount;

            if (String(currentRequest?.type || '').trim().toLowerCase() === 'customized') {
                updatePayload.data = {
                    ...nextData,
                    payment_status: 'paid',
                };
            }
        }
    }

    const { data, error } = await supabase
        .from('requests')
        .update(updatePayload)
        .eq('id', requestId)
        .select('*')
        .single();

    if (error) {
        console.error('[admin-perf] request delivery stop db update failed', {
            requestId,
            unitKey,
            message: error.message,
            code: error.code,
        });
        throw error;
    }
    console.log('[admin-perf] request delivery stop db update success', {
        requestId,
        unitKey,
        allConfirmed,
    });

    const persistedData = parseJsonObject(data?.data);
    const persistedStops = reconcileDeliveryDestinationsWithItems(
        persistedData?.multi_delivery_destinations || [],
        Array.isArray(persistedData?.items) ? persistedData.items : []
    );
    const persistedStop = persistedStops.find((stop) => stop.unit_key === normalizedUnitKey);

    if (!persistedStop || persistedStop.confirmation_status !== 'confirmed') {
        throw new Error('The delivery stop confirmation was not saved.');
    }

    if (allConfirmed && data?.status !== 'completed') {
        throw new Error('The request was not marked as completed after the final stop confirmation.');
    }

    if (currentRequest?.user_id) {
        try {
            await insertNotificationRecord(buildDeliveryStopNotificationPayload({
                entityType: 'request',
                record: currentRequest,
                stop: {
                    ...stopToComplete,
                    proof_image_url: proofImageUrl,
                    proof_note: proofNote,
                },
            }));
        } catch (error) {
            console.error('Failed to notify customer about request delivery proof:', error);
        }
    }

    return {
        success: true,
        request: {
            ...data,
            data: {
                ...parseJsonObject(data?.data),
                multi_delivery_destinations: updatedDestinations,
            },
        },
    };
};

const getRefundRequestMap = async (fieldName, ids = []) => {
    const normalizedIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
    if (!normalizedIds.length) {
        return new Map();
    }

    const { data, error } = await supabase
        .from('refund_requests')
        .select('*')
        .in(fieldName, normalizedIds)
        .order('created_at', { ascending: false });

    if (error) {
        if (error.code === '42P01') {
            return new Map();
        }
        throw error;
    }

    return (Array.isArray(data) ? data : []).reduce((refundMap, refundRequest) => {
        const key = refundRequest?.[fieldName];
        if (key != null && !refundMap.has(key)) {
            refundMap.set(key, refundRequest);
        }
        return refundMap;
    }, new Map());
};

const insertRefundNotificationDirect = async ({ userId, title, message, link }) => {
    if (!userId) {
        return;
    }

    const { error } = await supabase
        .from('notifications')
        .insert([{
            user_id: userId,
            title,
            message,
            type: 'refund_request',
            link: link || '/profile',
        }]);

    if (error) {
        console.error('Failed to create refund notification:', error);
    }
};

const approveRefundRequestDirect = async (refundId, options = {}) => {
    const actorId = options?.actorId || null;
    const adminNote = typeof options?.adminNote === 'string' ? options.adminNote.trim() : '';
    const refundAmount = Number.parseFloat(options?.refundAmount);

    const updatePayload = {
        status: 'approved',
        admin_note: adminNote || null,
        rejection_reason: null,
        approved_by: actorId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    if (Number.isFinite(refundAmount) && refundAmount > 0) {
        updatePayload.refund_amount = refundAmount;
    }

    const { data, error } = await supabase
        .from('refund_requests')
        .update(updatePayload)
        .eq('id', refundId)
        .select()
        .single();

    if (error) {
        throw error;
    }

    await insertRefundNotificationDirect({
        userId: data.customer_id,
        title: 'Refund approved',
        message: 'Your refund request was approved. Please submit your GCash account details so our staff can process it.',
    });

    return { success: true, refundRequest: data };
};

const rejectRefundRequestDirect = async (refundId, options = {}) => {
    const rejectionReason = typeof options?.rejectionReason === 'string' && options.rejectionReason.trim()
        ? options.rejectionReason.trim()
        : 'Refund request was not approved.';

    const { data, error } = await supabase
        .from('refund_requests')
        .update({
            status: 'rejected',
            rejection_reason: rejectionReason,
            admin_note: typeof options?.adminNote === 'string' ? options.adminNote.trim() || null : null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', refundId)
        .select()
        .single();

    if (error) {
        throw error;
    }

    await insertRefundNotificationDirect({
        userId: data.customer_id,
        title: 'Refund request rejected',
        message: rejectionReason,
    });

    return { success: true, refundRequest: data };
};

const startRefundProcessingDirect = async (refundId, options = {}) => {
    const { data, error } = await supabase
        .from('refund_requests')
        .update({
            status: 'processing',
            processing_started_by: options?.actorId || null,
            processing_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', refundId)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return { success: true, refundRequest: data };
};

const completeRefundRequestDirect = async (refundId, options = {}) => {
    const refundReference = typeof options?.refundReference === 'string'
        ? options.refundReference.trim()
        : '';

    const { data, error } = await supabase
        .from('refund_requests')
        .update({
            status: 'refunded',
            refund_reference: refundReference || null,
            processed_by: options?.actorId || null,
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', refundId)
        .select()
        .single();

    if (error) {
        throw error;
    }

    await insertRefundNotificationDirect({
        userId: data.customer_id,
        title: 'Refund completed',
        message: refundReference
            ? `Your refund has been completed. Reference: ${refundReference}.`
            : 'Your refund has been completed.',
    });

    return { success: true, refundRequest: data };
};

// Products API
const clampDiscountPercentage = (value) => {
    const numericValue = parseFloat(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;
    if (numericValue >= 100) return 100;

    return Math.round(numericValue * 100) / 100;
};

const roundCurrencyValue = (value) => Math.round(((parseFloat(value) || 0) + Number.EPSILON) * 100) / 100;

const computeDiscountedPrice = (originalPrice, discountPercentage) => {
    const safeOriginalPrice = Math.max(0, roundCurrencyValue(originalPrice));
    const safeDiscountPercentage = clampDiscountPercentage(discountPercentage);

    if (safeDiscountPercentage <= 0) {
        return safeOriginalPrice;
    }

    return roundCurrencyValue(safeOriginalPrice * (1 - safeDiscountPercentage / 100));
};

const normalizeProductDiscountFields = (product) => {
    const originalPrice = Math.max(0, roundCurrencyValue(product?.original_price ?? product?.price ?? 0));
    const discountPercentage = clampDiscountPercentage(product?.discount_percentage ?? 0);
    const discountedPrice = discountPercentage > 0
        ? roundCurrencyValue(product?.discounted_price ?? computeDiscountedPrice(originalPrice, discountPercentage))
        : originalPrice;
    const freeShippingPromoAmount = Math.max(0, roundCurrencyValue(product?.free_shipping_min_order_amount ?? 0));

    return {
        ...product,
        original_price: originalPrice,
        discount_percentage: discountPercentage,
        discounted_price: discountedPrice,
        effective_price: discountPercentage > 0 ? discountedPrice : originalPrice,
        free_shipping_min_order_amount: freeShippingPromoAmount,
    };
};

const PRODUCT_SELECT_WITH_DISCOUNTS = `
                id,
                name,
                description,
                price,
                original_price,
                discount_percentage,
                discounted_price,
                category_id,
                image_url,
                stock_quantity,
                is_free_shipping,
                free_shipping_min_order_amount,
                is_active,
                categories ( name )
            `;

const PRODUCT_SELECT_WITH_DISCOUNTS_LEGACY_SHIPPING = `
                id,
                name,
                description,
                price,
                original_price,
                discount_percentage,
                discounted_price,
                category_id,
                image_url,
                stock_quantity,
                is_free_shipping,
                free_shipping_min_order_amount,
                is_active,
                categories ( name )
            `;

const PRODUCT_SELECT_LEGACY = `
                id,
                name,
                description,
                price,
                category_id,
                image_url,
                stock_quantity,
                is_active,
                categories ( name )
            `;

const shouldRetryLegacyProductQuery = (error) => {
    const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    const code = `${error?.code || ''}`.toLowerCase();

    return (
        !!error &&
        (
            error?.status === 400 ||
            error?.status === 406 ||
            code === 'pgrst204' ||
            code === '42703' ||
            message.includes('original_price') ||
            message.includes('discount_percentage') ||
            message.includes('discounted_price') ||
            message.includes('is_free_shipping') ||
            message.includes('free_shipping_min_order_amount') ||
            message.includes('could not find the') ||
            message.includes('column') && (
                message.includes('original_price') ||
                message.includes('discount_percentage') ||
                message.includes('discounted_price') ||
                message.includes('is_free_shipping') ||
                message.includes('free_shipping_min_order_amount')
            )
        )
    );
};

const isMissingProductColumns = (error, columns = []) => {
    const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return columns.some((column) => message.includes(column.toLowerCase()));
};

const buildProductsQuery = ({
    params,
    includeDiscountFields = true,
    includeFreeShippingField = true,
}) => {
    let selectColumns = PRODUCT_SELECT_LEGACY;

    if (includeDiscountFields && includeFreeShippingField) {
        selectColumns = PRODUCT_SELECT_WITH_DISCOUNTS;
    } else if (includeDiscountFields) {
        selectColumns = PRODUCT_SELECT_WITH_DISCOUNTS_LEGACY_SHIPPING;
    }

    let query = supabase
        .from('products')
        .select(selectColumns);

    if (!params?.includeInactive) {
        query = query.eq('is_active', true);
    }

    if (params?.category_id) {
        query = query.eq('category_id', parseInt(params.category_id, 10));
    }

    return query;
};

const formatProductsForAdmin = (products = []) => (
    products.map(p => normalizeProductDiscountFields({
        ...p,
        category_name: p.categories ? p.categories.name : 'Uncategorized'
    }))
);

const buildProductPayload = ({
    formData,
    imageUrl,
    includeDiscountFields = true,
    includeFreeShippingField = true,
}) => {
    const originalPrice = Math.max(0, roundCurrencyValue(formData.price));
    const discountPercentage = clampDiscountPercentage(formData.discount_percentage);
    const discountedPrice = computeDiscountedPrice(originalPrice, discountPercentage);
    const freeShippingPromoAmount = Math.max(0, roundCurrencyValue(formData.free_shipping_min_order_amount));
    const payload = {
        name: formData.name,
        price: originalPrice,
        stock_quantity: parseInt(formData.stock_quantity, 10) || 0,
        description: formData.description || '',
        category_id: parseInt(formData.category_id, 10),
        image_url: imageUrl,
        is_active: formData.is_active !== false,
    };

    if (includeFreeShippingField) {
        payload.is_free_shipping = formData.is_free_shipping === true;
        payload.free_shipping_min_order_amount = formData.is_free_shipping === true ? freeShippingPromoAmount : 0;
    }

    if (includeDiscountFields) {
        payload.original_price = originalPrice;
        payload.discount_percentage = discountPercentage;
        payload.discounted_price = discountedPrice;
    }

    return payload;
};

export const productAPI = {
    getAll: async (params) => {
        let { data: products, error } = await buildProductsQuery({
            params,
            includeDiscountFields: true,
            includeFreeShippingField: true,
        });

        if (error && shouldRetryLegacyProductQuery(error)) {
            console.warn('Extended product query failed. Falling back to the compatible catalogue query until the latest migrations are applied.', error);
            const missingDiscountFields = isMissingProductColumns(error, ['original_price', 'discount_percentage', 'discounted_price']);
            const missingFreeShippingField = isMissingProductColumns(error, ['is_free_shipping', 'free_shipping_min_order_amount']);

            ({ data: products, error } = await buildProductsQuery({
                params,
                includeDiscountFields: !missingDiscountFields,
                includeFreeShippingField: !missingFreeShippingField,
            }));
        }

        if (error) {
            console.error('Error fetching products:', error);
            return { data: { products: [] } };
        }

        const formattedProducts = formatProductsForAdmin(products);

        return { data: { products: formattedProducts || [] } };
    },

    getById: async (id) => {
        const { data: product, error } = await supabase
            .from('products')
            .select(`*, categories ( name )`)
            .eq('id', parseInt(id, 10))
            .single();

        if (error) {
            console.error('Error fetching product:', error);
            return { data: null };
        }

        const formattedProduct = {
            ...normalizeProductDiscountFields(product),
            category_name: product.categories ? product.categories.name : 'Uncategorized'
        };

        return { data: formattedProduct };
    },

    create: async (formData) => {
        let imageUrl = null;
        const imageFile = formData.image;

        if (imageFile && (imageFile.base64 || imageFile.uri)) {
            try {
                imageUrl = await uploadNormalizedImageToBucket(imageFile, {
                    bucket: 'product-images',
                    fileNamePrefix: 'product',
                    upsert: false,
                    label: 'product image',
                });
            } catch (error) {
                console.error('Error processing image:', error);
                throw new Error('Failed to upload image: ' + error.message);
            }
        }

        const productToInsert = buildProductPayload({
            formData,
            imageUrl,
            includeDiscountFields: true,
            includeFreeShippingField: true,
        });

        let { data: newProduct, error } = await supabase
            .from('products')
            .insert(productToInsert)
            .select()
            .single();

        if (error && shouldRetryLegacyProductQuery(error)) {
            const missingDiscountFields = isMissingProductColumns(error, ['original_price', 'discount_percentage', 'discounted_price']);
            const missingFreeShippingField = isMissingProductColumns(error, ['is_free_shipping', 'free_shipping_min_order_amount']);

            if (clampDiscountPercentage(formData.discount_percentage) > 0) {
                throw new Error('Discount fields are not available in the database yet. Please apply migration 20260330120000_add_product_discounts.sql first.');
            }

            if (missingFreeShippingField && formData.is_free_shipping === true) {
                throw new Error('Free shipping promo fields are not available in the database yet. Please apply migration 20260405210000_add_product_free_shipping_promo_amount.sql first.');
            }

            ({ data: newProduct, error } = await supabase
                .from('products')
                .insert(buildProductPayload({
                    formData,
                    imageUrl,
                    includeDiscountFields: !missingDiscountFields,
                    includeFreeShippingField: !missingFreeShippingField,
                }))
                .select()
                .single());
        }

        if (error) {
            console.error('Database insert error:', error);
            throw error;
        }

        return { data: newProduct };
    },

    update: async function (id, formData) {
        let imageUrl = formData.image_url_hidden;
        const imageFile = formData.image;

        if (imageFile && (imageFile.base64 || imageFile.uri) && !String(imageFile.uri || '').startsWith('http')) {
            try {
                imageUrl = await uploadNormalizedImageToBucket(imageFile, {
                    bucket: 'product-images',
                    fileNamePrefix: 'product',
                    upsert: true,
                    label: 'product image',
                });
            } catch (error) {
                console.error('Error processing image for update:', error);
                throw new Error('Failed to upload image for update: ' + error.message);
            }
        } else if (imageFile && imageFile.uri && imageFile.uri.startsWith('http')) {
            imageUrl = imageFile.uri;
        }

        const productToUpdate = buildProductPayload({
            formData,
            imageUrl,
            includeDiscountFields: true,
            includeFreeShippingField: true,
        });

        Object.keys(productToUpdate).forEach(key => (productToUpdate[key] === undefined || Number.isNaN(productToUpdate[key])) && delete productToUpdate[key]);

        let { data: updatedProduct, error } = await supabase
            .from('products')
            .update(productToUpdate)
            .eq('id', parseInt(id, 10))
            .select()
            .single();

        if (error && shouldRetryLegacyProductQuery(error)) {
            const missingDiscountFields = isMissingProductColumns(error, ['original_price', 'discount_percentage', 'discounted_price']);
            const missingFreeShippingField = isMissingProductColumns(error, ['is_free_shipping', 'free_shipping_min_order_amount']);

            if (clampDiscountPercentage(formData.discount_percentage) > 0) {
                throw new Error('Discount fields are not available in the database yet. Please apply migration 20260330120000_add_product_discounts.sql first.');
            }

            if (missingFreeShippingField && formData.is_free_shipping === true) {
                throw new Error('Free shipping promo fields are not available in the database yet. Please apply migration 20260405210000_add_product_free_shipping_promo_amount.sql first.');
            }

            const legacyProductUpdate = buildProductPayload({
                formData,
                imageUrl,
                includeDiscountFields: !missingDiscountFields,
                includeFreeShippingField: !missingFreeShippingField,
            });
            Object.keys(legacyProductUpdate).forEach(key => (legacyProductUpdate[key] === undefined || Number.isNaN(legacyProductUpdate[key])) && delete legacyProductUpdate[key]);

            ({ data: updatedProduct, error } = await supabase
                .from('products')
                .update(legacyProductUpdate)
                .eq('id', parseInt(id, 10))
                .select()
                .single());
        }

        if (error) {
            console.error('Error updating product:', error);
            throw error;
        }

        return { data: updatedProduct };
    },

    deleteProduct: async (id) => {
        // First, delete all order_items referencing this product
        const { error: orderItemsError } = await supabase
            .from('order_items')
            .delete()
            .eq('product_id', parseInt(id, 10));

        if (orderItemsError) {
            console.error('Error deleting associated order items:', orderItemsError);
            throw orderItemsError;
        }

        // Then, delete the product itself
        const { error: productError } = await supabase
            .from('products')
            .delete()
            .eq('id', parseInt(id, 10));

        if (productError) {
            console.error('Error deleting product:', productError);
            throw productError;
        }

        return { data: { success: true } };
    },

};

// Categories API
export const categoryAPI = {
    getAll: async () => {
        let { data: categories, error } = await supabase
            .from('categories')
            .select('*')
            .eq('is_active', true);

        if (error) {
            console.error('Error fetching categories:', error);
            return { data: { categories: [] } };
        }

        return { data: { categories: categories || [] } };
    },

    createCategory: async (name) => {
        // Auto-generate a URL-friendly slug from the name.
        // The DB requires slug as NOT NULL UNIQUE.
        const slug = name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s-]/g, '')  // remove special chars
            .replace(/\s+/g, '-')           // spaces Ã¢â€ â€™ hyphens
            .replace(/-+/g, '-');           // collapse multiple hyphens

        const { data, error } = await supabase
            .from('categories')
            .insert({ name, slug, is_active: true })
            .select()
            .single();

        if (error) {
            throw error;
        }

        return { data };
    },

    updateCategory: async (id, name) => {
        const slug = name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');

        const { data, error } = await supabase
            .from('categories')
            .update({ name, slug })
            .eq('id', parseInt(id, 10))
            .select()
            .single();

        if (error) {
            throw error;
        }

        return { data };
    },

    deleteCategory: async (id) => {
        const { error } = await supabase
            .from('categories')
            .delete()
            .eq('id', parseInt(id, 10));

        if (error) {
            throw error;
        }

        return { data: { success: true } };
    }
};

// Orders API
export const orderAPI = {
    getAll: async (params) => adminAPI.getAllOrders(params)
};

const STAFF_ROLES = new Set(['admin', 'employee']);

const isStaffRole = (role) => STAFF_ROLES.has(role);

const getStaffProfile = async (user) => {
    const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role, name, phone')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) {
        console.error('Error fetching user profile:', profileError);
    }

    if (profile) {
        return profile;
    }
    return null;
};

const buildStaffSessionPayload = async (session) => {
    const profile = await getStaffProfile(session.user);

    if (!profile) {
        await supabase.auth.signOut();
        throw new Error('Could not verify user role. Your account might not be set up correctly.');
    }

    if (!isStaffRole(profile.role)) {
        await supabase.auth.signOut();
        throw new Error('Access Denied: You do not have permission to access this dashboard.');
    }

    return {
        user: {
            ...session.user,
            ...profile,
        },
    };
};

// Auth API - using Supabase for real authentication
export const authAPI = {
    staffLogin: async ({ email, password }) => {
        const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (signInError) {
            console.error('Supabase sign-in error:', signInError);
            throw signInError;
        }

        if (!sessionData.user || !sessionData.session) {
            throw new Error('Login failed: No user data returned.');
        }

        return {
            data: await buildStaffSessionPayload(sessionData.session),
        };
    },

    adminLogin: async (credentials) => authAPI.staffLogin(credentials),

    logout: async () => {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) {
            console.error('Error logging out from Supabase:', error);
        }

        try {
            const allKeys = await AsyncStorage.getAllKeys();
            const supabaseSessionKeys = allKeys.filter((key) => (
                /^sb-.*-auth-token$/.test(key) || key === 'supabase.auth.token'
            ));

            const keysToRemove = [...new Set(['token', 'currentUser', ...supabaseSessionKeys])];
            await AsyncStorage.multiRemove(keysToRemove);
        } catch (storageError) {
            console.error('Error clearing local auth storage:', storageError);
        }

        return { data: { success: true } };
    },

    changePassword: async (data) => {
        return { data: { success: true, message: 'Password changed successfully' } };
    },

    getMe: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { data: null };

        const profile = await getStaffProfile(user);

        if (!profile || !isStaffRole(profile.role)) {
            await supabase.auth.signOut();
            return { data: null };
        }

        return { data: { ...user, ...profile } };
    },

};

// Admin API - Supabase-backed admin operations
export const adminAPI = {
    getAllOrders: async (params) => {
        const buildOrdersQuery = ({
            includeNotes = true,
            includeCancellationReason = true,
            includePaymentStatus = true,
            includePaymentMethod = true,
            includeReceiptUrl = true,
            includeGcashReferenceNumber = true,
            includeAmountReceived = true,
            includeAdditionalReceipts = true,
            includeAssignedRider = true,
            includeUsers = true,
            includeUserEmail = true,
            includeUserPhone = true,
        } = {}) => {
            const userColumns = [
                'id',
                'name',
                ...(includeUserEmail !== false ? ['email'] : []),
                ...(includeUserPhone !== false ? ['phone'] : []),
            ];
            const columns = [
                'id',
                'user_id',
                'created_at',
                'order_number',
                'status',
                ...(includeAssignedRider ? ['assigned_rider'] : []),
                ...(includePaymentStatus ? ['payment_status'] : []),
                ...(includePaymentMethod ? ['payment_method'] : []),
                ...(includeReceiptUrl ? ['receipt_url'] : []),
                ...(includeGcashReferenceNumber ? ['gcash_reference_number'] : []),
                ...(includeAdditionalReceipts ? ['additional_receipts'] : []),
                'pickup_time',
                'total',
                'subtotal',
                'shipping_fee',
                ...(includeCancellationReason ? ['cancellation_reason'] : []),
                'delivery_method',
                ...(includeNotes ? ['notes'] : []),
                'shipping_address: addresses!address_id(*)',
                ...(includeUsers ? [`users (${userColumns.join(', ')})`] : []),
                `order_items (
                    id,
                    product_id,
                    quantity,
                    cancelled_quantity,
                    cancellation_history,
                    price,
                    name,
                    image_url,
                    products (
                        name,
                        image_url
                    )
                )`,
                'third_party_rider_name',
                'third_party_rider_info',
                ...(includeAmountReceived ? ['amount_received'] : []),
            ];
            let query = supabase
                .from('orders')
                .select(columns.join(', '))
                .order('created_at', { ascending: false });

            if (params?.status) {
                query = query.eq('status', params.status);
            }

            return query;
        };

        let queryOptions = {
            includeNotes: true,
            includeCancellationReason: true,
            includePaymentStatus: true,
            includePaymentMethod: true,
            includeReceiptUrl: true,
            includeGcashReferenceNumber: true,
            includeAmountReceived: true,
            includeAdditionalReceipts: true,
            includeAssignedRider: true,
            includeUsers: true,
            includeUserEmail: true,
            includeUserPhone: true,
            ...ADMIN_ORDER_QUERY_SESSION_CACHE.orderOptionOverrides,
        };
        const shouldIncludeUsers = ADMIN_ORDER_QUERY_SESSION_CACHE.disableEmbeddedUsers !== true;
        if (!shouldIncludeUsers) {
            queryOptions = {
                ...queryOptions,
                includeUsers: false,
                includeUserEmail: false,
                includeUserPhone: false,
            };
        }

        let { data: orders, error } = await buildOrdersQuery(queryOptions);

        let shouldRetry = true;
        while (error && shouldRetry) {
            shouldRetry = false;

            const missingOrderColumn = getMissingTableColumnFallback(
                error,
                'orders',
                ORDER_QUERY_OPTION_FALLBACKS,
                queryOptions
            );

            if (missingOrderColumn) {
                const [, optionKey, columnLabel] = missingOrderColumn;
                console.warn(`Orders table is missing the ${columnLabel} column; retrying admin order fetch without it.`);
                queryOptions = { ...queryOptions, [optionKey]: false };
                ADMIN_ORDER_QUERY_SESSION_CACHE.orderOptionOverrides[optionKey] = false;
                ({ data: orders, error } = await buildOrdersQuery(queryOptions));
                shouldRetry = Boolean(error);
                continue;
            }

            const missingEmbeddedUserColumn = queryOptions.includeUsers !== false
                ? getMissingTableColumnFallback(
                    error,
                    'users',
                    ORDER_EMBEDDED_USER_FALLBACKS,
                    queryOptions
                )
                : null;

            if (missingEmbeddedUserColumn) {
                const [, optionKey, columnLabel] = missingEmbeddedUserColumn;
                console.warn(`Orders user join is missing the ${columnLabel} column; retrying admin order fetch without it.`);
                queryOptions = { ...queryOptions, [optionKey]: false };
                ADMIN_ORDER_QUERY_SESSION_CACHE.orderOptionOverrides[optionKey] = false;
                ({ data: orders, error } = await buildOrdersQuery(queryOptions));
                shouldRetry = Boolean(error);
                continue;
            }

            if (queryOptions.includeUsers !== false && shouldIncludeUsers && isUsersEmbedRelationshipError(error)) {
                console.warn('Orders query cannot embed users in this schema; retrying admin order fetch with a secondary user lookup.');
                queryOptions = {
                    ...queryOptions,
                    includeUsers: false,
                    includeUserEmail: false,
                    includeUserPhone: false,
                };
                ADMIN_ORDER_QUERY_SESSION_CACHE.disableEmbeddedUsers = true;
                ({ data: orders, error } = await buildOrdersQuery(queryOptions));
                shouldRetry = Boolean(error);
            }
        }

        if (error) {
            console.error('Supabase query error for orders:', error);
            throw error;
        }

        let fallbackUserMap = new Map();
        if (shouldIncludeUsers && queryOptions.includeUsers === false) {
            fallbackUserMap = await fetchAdminRequestUsersByIds((orders || []).map((order) => order?.user_id));
        }

        const formattedOrders = orders.map(order => {
            const parsedNotes = parseMultiDeliveryNotes(order.notes);
            const orderNotesPaymentMetadata = getOrderPaymentMetadataFromNotes(order.notes);
            const embeddedUser = Array.isArray(order.users) ? order.users[0] || {} : (order.users || {});
            const fallbackUser = fallbackUserMap.get(String(order.user_id)) || {};
            const customerName = embeddedUser?.name || fallbackUser?.name || 'N/A';
            const customerEmail = embeddedUser?.email || fallbackUser?.email || 'N/A';
            const customerPhone = embeddedUser?.phone || fallbackUser?.phone || 'N/A';

            const items = order.order_items.map(item => {
                const originalQuantity = Number(item.quantity || 0);
                const cancelledQuantity = Number(item.cancelled_quantity || 0);
                const remainingQuantity = Math.max(0, originalQuantity - cancelledQuantity);
                const cancellationHistory = Array.isArray(item.cancellation_history) ? item.cancellation_history : [];
                const latestCancellationEntry = getLatestCancellationEntry(cancellationHistory);

                return {
                    id: item.id,
                    product_id: item.product_id,
                    quantity: remainingQuantity,
                    original_quantity: originalQuantity,
                    cancelled_quantity: cancelledQuantity,
                    remaining_quantity: remainingQuantity,
                    cancellation_history: cancellationHistory,
                    latest_cancellation_reason: String(latestCancellationEntry?.reason || '').trim() || null,
                    latest_cancelled_at: latestCancellationEntry?.cancelled_at || null,
                    price: item.price,
                    name: item.name || (item.products ? item.products.name : 'Unknown Product'),
                    image_url: item.image_url || (item.products ? item.products.image_url : null),
                    is_fully_cancelled: remainingQuantity === 0,
                };
            });

            // Construct full address description if shipping_address exists
            let shippingAddressDescription = null;
            if (order.shipping_address) {
                const { street, barangay, city, zip } = order.shipping_address;
                shippingAddressDescription = [street, barangay, city, zip].filter(Boolean).join(', ');
            }

            return {
                ...order,
                notes: parsedNotes.note,
                customer_name: customerName,
                customer_email: customerEmail,
                customer_phone: customerPhone,
                gcash_reference_number: order.gcash_reference_number
                    || orderNotesPaymentMetadata.gcash_reference_number
                    || null,
                additional_receipts: normalizeAdditionalReceiptEntriesForAdmin(
                    Array.isArray(order.additional_receipts) && order.additional_receipts.length
                        ? order.additional_receipts
                        : orderNotesPaymentMetadata.additional_receipts
                ),
                items: items,
                multi_delivery_destinations: parsedNotes.destinations,
                order_items: undefined, // Remove the raw order_items object
                shipping_address: order.shipping_address ? { // Reconstruct shipping_address to add description
                    ...order.shipping_address,
                    description: shippingAddressDescription
                } : null,
                cancellation_reason: order.cancellation_reason || null,
            };
        });

        let refundMap = new Map();
        try {
            refundMap = await getRefundRequestMap('order_id', formattedOrders.map((order) => order.id));
        } catch (refundError) {
            console.warn('Unable to load refund requests for orders:', refundError.message);
        }

        return {
            data: formattedOrders.map((order) => ({
                ...order,
                refund_request: refundMap.get(order.id) || null,
            })),
        };
    },

    updateOrderStatus: async (id, status, options = {}) => {
        try {
            const data = await invokeAdminWorkflow('update_order_status', { id, status, options });
            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct order status update:', error.message);
            return { data: await updateOrderStatusDirect(id, status, options) };
        }
    },

    updateOrderPaymentMethod: async (id, newPaymentMethod) => {
        const { data, error } = await supabase
            .from('orders')
            .update({ payment_method: newPaymentMethod })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating order payment method:', error);
            throw error;
        }
        return { data: { success: true, order: data } };
    },

    updateOrderPaymentStatus: async (id, status, options = {}) => {
        try {
            const payload = { id, status };
            if (options?.amountReceived !== undefined && options?.amountReceived !== null && options?.amountReceived !== '') {
                payload.amountReceived = options.amountReceived;
            }
            const data = await invokeAdminWorkflow('update_order_payment_status', payload);
            const returnedOrder = data?.order;
            const hasExplicitAmountReceived = options?.amountReceived !== undefined && options?.amountReceived !== null && options?.amountReceived !== '';

            if (hasExplicitAmountReceived) {
                const expectedAmountReceived = Math.max(0, parseMoney(options.amountReceived));
                const actualAmountReceived = parseMoney(returnedOrder?.amount_received);

                if (Math.abs(actualAmountReceived - expectedAmountReceived) >= 0.01) {
                    console.warn('Admin workflow payment update did not persist the recorded amount. Falling back to direct order payment update.');
                    return { data: await updateOrderPaymentStatusDirect(id, status, options) };
                }
            }

            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct order payment update:', error.message);
            return { data: await updateOrderPaymentStatusDirect(id, status, options) };
        }
    },

    acceptOrder: async (id, status) => {
        try {
            const data = await invokeAdminWorkflow('accept_order', { id, status });
            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct order accept:', error.message);
            return { data: await updateOrderStatusDirect(id, status) };
        }
    },

    declineOrder: async (id, status, options = {}) => {
        try {
            const data = await invokeAdminWorkflow('decline_order', { id, status, options });
            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct order decline:', error.message);
            return { data: await updateOrderStatusDirect(id, status, options) };
        }
    },

    assignRider: async (orderId, riderId, thirdPartyName = null, thirdPartyInfo = null) => {
        try {
            const data = await invokeAdminWorkflow('assign_order_rider', {
                orderId,
                riderId,
                thirdPartyName,
                thirdPartyInfo,
            });
            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct rider assignment:', error.message);
            return { data: await assignOrderRiderDirect(orderId, riderId, thirdPartyName, thirdPartyInfo) };
        }
    },

    assignOrderStopRiders: async (orderId, stopAssignments = []) => {
        try {
            const data = await invokeAdminWorkflow('assign_order_stop_riders', {
                orderId,
                stopAssignments,
            });
            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct delivery stop assignment:', error.message);
            return { data: await assignOrderStopRidersDirect(orderId, stopAssignments) };
        }
    },

    completeOrderDeliveryStop: async (orderId, unitKey, options = {}) => {
        const normalizedProofFile = await normalizeDeliveryProofFile(options?.proofFile || null);
        const startedAt = Date.now();

        console.log('[admin-perf] order delivery stop completion start', {
            orderId,
            unitKey,
            hasProof: Boolean(normalizedProofFile?.base64 || normalizedProofFile?.uri),
        });

        try {
            const data = await completeOrderDeliveryStopDirect(orderId, unitKey, {
                ...options,
                proofFile: normalizedProofFile,
            });

            console.log('[admin-perf] order delivery stop completion success', {
                orderId,
                unitKey,
                path: 'direct',
                durationMs: Date.now() - startedAt,
            });
            return { data };
        } catch (directError) {
            console.warn('Direct order delivery stop completion failed, trying manage-admin-workflows fallback:', directError.message);

            try {
                const data = await invokeAdminWorkflow('complete_order_delivery_stop', {
                    orderId,
                    unitKey,
                    proofFile: normalizedProofFile,
                    proofNote: options?.proofNote || '',
                });

                console.log('[admin-perf] order delivery stop completion success', {
                    orderId,
                    unitKey,
                    path: 'edge',
                    durationMs: Date.now() - startedAt,
                });
                return { data };
            } catch (edgeError) {
                console.log('[admin-perf] order delivery stop completion failed', {
                    orderId,
                    unitKey,
                    path: 'direct+edge',
                    durationMs: Date.now() - startedAt,
                    directMessage: directError?.message || String(directError),
                    edgeMessage: edgeError?.message || String(edgeError),
                });
                throw new Error(getDeliveryProofCompletionFallbackMessage(directError, edgeError));
            }
        }
    },

    approveRefundRequest: async (refundId, options = {}) => {
        try {
            const data = await invokeAdminWorkflow('approve_refund_request', { refundId, ...options });
            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct refund approval:', error.message);
            return { data: await approveRefundRequestDirect(refundId, options) };
        }
    },

    rejectRefundRequest: async (refundId, options = {}) => {
        try {
            const data = await invokeAdminWorkflow('reject_refund_request', { refundId, ...options });
            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct refund rejection:', error.message);
            return { data: await rejectRefundRequestDirect(refundId, options) };
        }
    },

    startRefundProcessing: async (refundId, options = {}) => {
        try {
            const data = await invokeAdminWorkflow('start_refund_processing', { refundId, ...options });
            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct refund processing start:', error.message);
            return { data: await startRefundProcessingDirect(refundId, options) };
        }
    },

    completeRefundRequest: async (refundId, options = {}) => {
        try {
            const data = await invokeAdminWorkflow('complete_refund_request', { refundId, ...options });
            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct refund completion:', error.message);
            return { data: await completeRefundRequestDirect(refundId, options) };
        }
    },

    getStats: async (filters = {}) => {
        const monthRange = getMonthRange(filters?.monthKey);

        let completedOrdersQuery = supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .in('status', ['completed', 'claimed']);
        let pendingOrdersQuery = supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
        let completedRequestsQuery = supabase
            .from('requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'completed');
        let pendingRequestsQuery = supabase
            .from('requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        if (monthRange) {
            completedOrdersQuery = applyDateRangeToQuery(completedOrdersQuery, 'created_at', monthRange);
            pendingOrdersQuery = applyDateRangeToQuery(pendingOrdersQuery, 'created_at', monthRange);
            completedRequestsQuery = applyDateRangeToQuery(completedRequestsQuery, 'created_at', monthRange);
            pendingRequestsQuery = applyDateRangeToQuery(pendingRequestsQuery, 'created_at', monthRange);
        }

        const { count: completedOrders, error: completedOrdersError } = await completedOrdersQuery;
        const { count: pendingOrders, error: pendingOrdersError } = await pendingOrdersQuery;
        const { count: completedRequests, error: completedRequestsError } = await completedRequestsQuery;
        const { count: pendingRequests, error: pendingRequestsError } = await pendingRequestsQuery;

        if (completedOrdersError || pendingOrdersError || completedRequestsError || pendingRequestsError) {
            console.error({ completedOrdersError, pendingOrdersError, completedRequestsError, pendingRequestsError });
            throw new Error("Could not fetch stats");
        }

        return {
            data: {
                completedOrders: completedOrders || 0,
                pendingOrders: pendingOrders || 0,
                completedRequests: completedRequests || 0,
                pendingRequests: pendingRequests || 0,
            }
        };
    },



    getSalesSummary: async (filters = {}) => {
        const normalizedFilters = normalizeSalesFilterArgs(filters);
        const period = normalizedFilters.period;
        const periodRange = getPeriodRange(
            period,
            normalizedFilters.monthKey,
            normalizedFilters.dateKey,
            normalizedFilters.rangeStartKey,
            normalizedFilters.rangeEndKey
        );
        const todayRange = getTodayRange();
        const weekRange = getWeekRange();
        const currentMonthRange = getMonthRange(formatMonthKey(new Date()));

        let ordersQuery = supabase
            .from('orders')
            .select(`
                id,
                created_at,
                order_number,
                status,
                payment_status,
                amount_received,
                total,
                delivery_method,
                pickup_time,
                users (
                    name,
                    email
                )
            `)
            .order('created_at', { ascending: false });

        const buildSalesRequestsQuery = (options = {}) => supabase
            .from('requests')
            .select(buildRequestSelectColumns(
                ['id', 'request_number', 'type', 'created_at', 'status'],
                [
                    { enabled: options.includePaymentStatus, column: 'payment_status' },
                    { enabled: options.includeAmountReceived, column: 'amount_received' },
                    { enabled: options.includeFinalPrice, column: 'final_price' },
                    { enabled: options.includeEstimatedPrice, column: 'estimated_price' },
                    { enabled: options.includeDeliveryMethod, column: 'delivery_method' },
                    { enabled: options.includePickupTime, column: 'pickup_time' },
                ],
                true
            ))
            .order('created_at', { ascending: false });

        ordersQuery = applyDateRangeToQuery(ordersQuery, 'created_at', periodRange);
        let requestQueryOptions = {
            includePaymentStatus: true,
            includeAmountReceived: true,
            includeFinalPrice: true,
            includeEstimatedPrice: false,
            includeDeliveryMethod: true,
            includePickupTime: true,
        };
        let requestsQuery = applyDateRangeToQuery(buildSalesRequestsQuery(requestQueryOptions), 'created_at', periodRange);

        const [
            { data: orders, error: ordersError },
            requestsResult,
        ] = await Promise.all([ordersQuery, requestsQuery]);

        let { data: requests, error: requestsError } = requestsResult;

        const requestSalesColumnFallbacks = [
            ['payment_status', 'includePaymentStatus', 'payment_status'],
            ['amount_received', 'includeAmountReceived', 'amount_received'],
            ['final_price', 'includeFinalPrice', 'final_price'],
            ['estimated_price', 'includeEstimatedPrice', 'estimated_price'],
            ['delivery_method', 'includeDeliveryMethod', 'delivery_method'],
            ['pickup_time', 'includePickupTime', 'pickup_time'],
        ];

        let shouldRetryRequests = true;
        while (requestsError && shouldRetryRequests) {
            shouldRetryRequests = false;
            const missingColumn = getMissingRequestColumnFallback(
                requestsError,
                requestSalesColumnFallbacks,
                requestQueryOptions
            );

            if (missingColumn) {
                const [, optionKey, columnLabel] = missingColumn;
                requestQueryOptions = {
                    ...requestQueryOptions,
                    [optionKey]: false,
                };

                console.warn(`Retrying sales request summary without optional column ${columnLabel}`);
                const retryResult = await applyDateRangeToQuery(
                    buildSalesRequestsQuery(requestQueryOptions),
                    'created_at',
                    periodRange
                );
                requests = retryResult.data;
                requestsError = retryResult.error;
                shouldRetryRequests = Boolean(requestsError);
            }
        }

        if (ordersError || requestsError) {
            console.error('Error fetching sales summary sources:', { ordersError, requestsError });
            throw ordersError || requestsError;
        }

        const liveSaleRows = [];
        const summary = {
            totalSales: 0,
            todaySales: 0,
            weekSales: 0,
            monthSales: 0,
            totalOrders: 0,
            completedOrders: 0,
            pendingOrders: 0,
            cashSales: 0,
            creditSales: 0,
            receivable: 0,
            upcomingSales: 0,
            unpaidCount: 0,
            upcomingCount: 0,
            outstandingItems: [],
            upcomingItems: [],
            monthLabel: periodRange?.label || null,
        };

        (orders || []).forEach((order) => {
            const totalAmount = parseMoney(order?.total);
            const amountReceived = parseMoney(order?.amount_received);
            const paymentStatus = String(order?.payment_status || '').trim().toLowerCase();
            const remainingBalance = getOutstandingBalance(totalAmount, amountReceived, paymentStatus);
            const status = String(order?.status || '').trim().toLowerCase();
            const isClosed = CLOSED_ORDER_STATUSES.has(status);
            const isUpcoming = UPCOMING_ORDER_STATUSES.has(status);
            const collectedCash = getOrderLiveSaleAmount(order);

            summary.totalOrders += 1;
            summary.cashSales += collectedCash;
            addLiveSaleRow(liveSaleRows, order?.created_at, collectedCash);

            if (status === 'completed' || status === 'claimed') {
                summary.completedOrders += 1;
            } else if (!isClosed) {
                summary.pendingOrders += 1;
            }

            if (!isClosed && (CREDIT_PAYMENT_STATUSES.has(paymentStatus) || remainingBalance > 0) && totalAmount > 0) {
                summary.creditSales += totalAmount;
                summary.receivable += remainingBalance;
                summary.unpaidCount += 1;
                summary.outstandingItems.push({
                    id: `order-${order.id}`,
                    entityType: 'order',
                    refNumber: order?.order_number || `Order #${order.id}`,
                    customerName: order?.users?.name || 'N/A',
                    customerEmail: order?.users?.email || '',
                    status,
                    paymentStatus,
                    totalAmount,
                    amountReceived,
                    remainingBalance,
                    scheduleDate: order?.created_at || null,
                    scheduleText: order?.delivery_method === 'pickup' && order?.pickup_time
                        ? `Pickup ${order.pickup_time}`
                        : 'Awaiting payment',
                });
            }

            if (!isClosed && isUpcoming && totalAmount > 0) {
                summary.upcomingSales += totalAmount;
                summary.upcomingCount += 1;
                summary.upcomingItems.push({
                    id: `order-upcoming-${order.id}`,
                    entityType: 'order',
                    refNumber: order?.order_number || `Order #${order.id}`,
                    sourceType: 'Order',
                    customerName: order?.users?.name || 'N/A',
                    customerEmail: order?.users?.email || '',
                    status,
                    paymentStatus,
                    totalAmount,
                    remainingBalance,
                    scheduleDate: order?.created_at || null,
                    scheduleText: order?.delivery_method === 'pickup' && order?.pickup_time
                        ? `Pickup ${order.pickup_time}`
                        : 'Active order',
                });
            }
        });

        (requests || []).forEach((request) => {
            const requestDetails = getRequestTransactionDetails(request);
            const requestTotal = getRequestTotalAmount(request);
            const requestDisplayTotal = getRequestTotalAmount(request, { allowTentative: true });
            const amountReceived = requestDetails.amountReceived;
            const paymentStatus = String(requestDetails.paymentStatus || '').trim().toLowerCase();
            const remainingBalance = getOutstandingBalance(requestTotal, amountReceived, paymentStatus);
            const status = String(request?.status || '').trim().toLowerCase();
            const isClosed = CLOSED_REQUEST_STATUSES.has(status);
            const isUpcoming = UPCOMING_REQUEST_STATUSES.has(status);
            const scheduleDate = getRequestScheduleDate(request) || request?.created_at || null;
            const scheduleText = requestDetails.pickupTime
                ? `Pickup ${requestDetails.pickupTime}`
                : (getRequestScheduleDate(request) ? 'Scheduled request' : 'Active request');
            const collectedCash = getRequestLiveSaleAmount(request);

            summary.totalOrders += 1;
            summary.cashSales += collectedCash;
            addLiveSaleRow(liveSaleRows, request?.created_at, collectedCash);

            if (status === 'completed' || status === 'claimed') {
                summary.completedOrders += 1;
            } else if (!isClosed) {
                summary.pendingOrders += 1;
            }

            if (!isClosed && (CREDIT_PAYMENT_STATUSES.has(paymentStatus) || remainingBalance > 0) && requestTotal > 0) {
                summary.creditSales += requestTotal;
                summary.receivable += remainingBalance;
                summary.unpaidCount += 1;
                summary.outstandingItems.push({
                    id: `request-${request.id}`,
                    entityType: 'request',
                    refNumber: request?.request_number || `Request #${request.id}`,
                    customerName: request?.users?.name || 'N/A',
                    customerEmail: request?.users?.email || '',
                    status,
                    paymentStatus,
                    totalAmount: requestTotal,
                    amountReceived,
                    remainingBalance,
                    scheduleDate,
                    scheduleText,
                    sourceType: request?.type || 'Request',
                });
            }

            if (!isClosed && isUpcoming && requestDisplayTotal > 0) {
                summary.upcomingSales += requestDisplayTotal;
                summary.upcomingCount += 1;
                summary.upcomingItems.push({
                    id: `request-upcoming-${request.id}`,
                    entityType: 'request',
                    refNumber: request?.request_number || `Request #${request.id}`,
                    sourceType: request?.type || 'Request',
                    customerName: request?.users?.name || 'N/A',
                    customerEmail: request?.users?.email || '',
                    status,
                    paymentStatus,
                    totalAmount: requestDisplayTotal,
                    remainingBalance,
                    scheduleDate,
                    scheduleText,
                });
            }
        });

        summary.outstandingItems.sort((a, b) => new Date(b.scheduleDate || 0) - new Date(a.scheduleDate || 0));
        summary.upcomingItems.sort((a, b) => new Date(a.scheduleDate || 0) - new Date(b.scheduleDate || 0));
        summary.totalSales = summary.cashSales;
        summary.todaySales = sumSaleRowsInRange(liveSaleRows, todayRange);
        summary.weekSales = sumSaleRowsInRange(liveSaleRows, weekRange);
        summary.monthSales = sumSaleRowsInRange(liveSaleRows, currentMonthRange);

        return { data: summary };
    },

    getSalesChartData: async (period = 'week', monthKey = null, dateKey = null, rangeStartKey = null, rangeEndKey = null) => {
        const normalizedFilters = normalizeSalesFilterArgs(period, monthKey, dateKey, rangeStartKey, rangeEndKey);
        const periodRange = getPeriodRange(
            normalizedFilters.period,
            normalizedFilters.monthKey,
            normalizedFilters.dateKey,
            normalizedFilters.rangeStartKey,
            normalizedFilters.rangeEndKey
        );
        let ordersQuery = supabase
            .from('orders')
            .select('id, created_at, status, payment_status, amount_received, total')
            .order('created_at', { ascending: true });

        const buildChartRequestsQuery = (options = {}) => supabase
            .from('requests')
            .select(buildRequestSelectColumns(
                ['id', 'created_at', 'status'],
                [
                    { enabled: options.includePaymentStatus, column: 'payment_status' },
                    { enabled: options.includeAmountReceived, column: 'amount_received' },
                    { enabled: options.includeFinalPrice, column: 'final_price' },
                    { enabled: options.includeEstimatedPrice, column: 'estimated_price' },
                ]
            ))
            .order('created_at', { ascending: true });

        ordersQuery = applyDateRangeToQuery(ordersQuery, 'created_at', periodRange);
        let requestQueryOptions = {
            includePaymentStatus: true,
            includeAmountReceived: true,
            includeFinalPrice: true,
            includeEstimatedPrice: false,
        };
        let requestsQuery = applyDateRangeToQuery(buildChartRequestsQuery(requestQueryOptions), 'created_at', periodRange);

        const [
            { data: orders, error: ordersError },
            requestsResult,
        ] = await Promise.all([ordersQuery, requestsQuery]);

        let { data: requests, error: requestsError } = requestsResult;

        const chartRequestColumnFallbacks = [
            ['payment_status', 'includePaymentStatus', 'payment_status'],
            ['amount_received', 'includeAmountReceived', 'amount_received'],
            ['final_price', 'includeFinalPrice', 'final_price'],
            ['estimated_price', 'includeEstimatedPrice', 'estimated_price'],
        ];

        let shouldRetryChartRequests = true;
        while (requestsError && shouldRetryChartRequests) {
            shouldRetryChartRequests = false;
            const missingColumn = getMissingRequestColumnFallback(
                requestsError,
                chartRequestColumnFallbacks,
                requestQueryOptions
            );

            if (!missingColumn) {
                break;
            }

            const [, optionKey, columnLabel] = missingColumn;
            requestQueryOptions = { ...requestQueryOptions, [optionKey]: false };
            console.warn(`Retrying sales chart request fetch without optional column ${columnLabel}`);
            const retryResult = await applyDateRangeToQuery(
                buildChartRequestsQuery(requestQueryOptions),
                'created_at',
                periodRange
            );
            requests = retryResult.data;
            requestsError = retryResult.error;
            shouldRetryChartRequests = Boolean(requestsError);
        }

        if (ordersError || requestsError) {
            console.error('Error fetching sales chart data:', { ordersError, requestsError });
            throw ordersError || requestsError;
        }

        const liveSaleRows = [];
        (orders || []).forEach((order) => {
            addLiveSaleRow(liveSaleRows, order?.created_at, getOrderLiveSaleAmount(order));
        });
        (requests || []).forEach((request) => {
            addLiveSaleRow(liveSaleRows, request?.created_at, getRequestLiveSaleAmount(request));
        });

        return {
            data: liveSaleRows.sort((a, b) => new Date(a.sale_date || 0) - new Date(b.sale_date || 0)),
        };
    },

    getBestSellingProducts: async (period = 'all', monthKey = null, dateKey = null, rangeStartKey = null, rangeEndKey = null) => {
        const normalizedFilters = normalizeSalesFilterArgs(period, monthKey, dateKey, rangeStartKey, rangeEndKey);
        const periodRange = getPeriodRange(
            normalizedFilters.period,
            normalizedFilters.monthKey,
            normalizedFilters.dateKey,
            normalizedFilters.rangeStartKey,
            normalizedFilters.rangeEndKey
        );
        let salesQuery = supabase
            .from('sales')
            .select('id, order_id, request_id, total_amount, sale_date')
            .order('sale_date', { ascending: false });

        salesQuery = applyDateRangeToQuery(salesQuery, 'sale_date', periodRange);

        const { data: sales, error: salesError } = await salesQuery;

        if (salesError) {
            console.error('Error fetching best selling products:', salesError);
            throw salesError;
        }

        const orderIds = Array.from(new Set(
            (sales || [])
                .map((sale) => sale?.order_id)
                .filter(Boolean)
        ));
        const requestIds = Array.from(new Set(
            (sales || [])
                .map((sale) => sale?.request_id)
                .filter(Boolean)
        ));

        let orders = [];
        let orderFetchError = null;
        if (orderIds.length) {
            const orderResult = await supabase
                .from('orders')
                .select(`
                    id,
                    order_items (
                        product_id,
                        quantity,
                        price,
                        name,
                        products (
                            name,
                            image_url,
                            price
                        )
                    )
                `)
                .in('id', orderIds);

            orders = orderResult.data || [];
            orderFetchError = orderResult.error;
        }

        const buildBestSellerRequestsQuery = (options = {}) => supabase
            .from('requests')
            .select(buildRequestSelectColumns(
                ['id', 'type', 'data'],
                [
                    { enabled: options.includeFinalPrice, column: 'final_price' },
                    { enabled: options.includeShippingFee, column: 'shipping_fee' },
                ]
            ))
            .in('id', requestIds);
        let requestQueryOptions = {
            includeFinalPrice: true,
            includeShippingFee: true,
        };
        let requests = [];
        let requestsError = null;
        let stockFlowers = [];
        let productFlowers = [];

        if (requestIds.length) {
            const requestsResult = await buildBestSellerRequestsQuery(requestQueryOptions);
            requests = requestsResult.data || [];
            requestsError = requestsResult.error;

            const bestSellerRequestColumnFallbacks = [
                ['final_price', 'includeFinalPrice', 'final_price'],
                ['shipping_fee', 'includeShippingFee', 'shipping_fee'],
            ];

            let shouldRetryBestSellerRequests = true;
            while (requestsError && shouldRetryBestSellerRequests) {
                shouldRetryBestSellerRequests = false;
                const missingColumn = getMissingRequestColumnFallback(
                    requestsError,
                    bestSellerRequestColumnFallbacks,
                    requestQueryOptions
                );

                if (!missingColumn) {
                    break;
                }

                const [, optionKey, columnLabel] = missingColumn;
                requestQueryOptions = { ...requestQueryOptions, [optionKey]: false };
                console.warn(`Retrying best-seller request fetch without optional column ${columnLabel}`);
                const retryResult = await buildBestSellerRequestsQuery(requestQueryOptions);
                requests = retryResult.data || [];
                requestsError = retryResult.error;
                shouldRetryBestSellerRequests = Boolean(requestsError);
            }

            const [stockFlowerResult, productFlowerResult] = await Promise.all([
                supabase
                    .from('stock_products')
                    .select('name, image_url, preview_image_url, stem_image_url, layer_image_url'),
                supabase
                    .from('products')
                    .select('name, image_url'),
            ]);

            if (!stockFlowerResult.error) {
                stockFlowers = stockFlowerResult.data || [];
            }

            if (!productFlowerResult.error) {
                productFlowers = productFlowerResult.data || [];
            }
        }

        if (orderFetchError || requestsError) {
            console.error('Error fetching best seller source records:', { orderFetchError, requestsError });
            throw orderFetchError || requestsError;
        }

        const orderMap = new Map((orders || []).map((order) => [String(order.id), order]));
        const requestMap = new Map((requests || []).map((request) => [String(request.id), request]));
        const aggregateMap = new Map();
        const supplementalFlowerImageLookup = mergeFlowerImageLookups(
            buildFlowerImageLookupFromCatalogRows(stockFlowers),
            buildFlowerImageLookupFromCatalogRows(productFlowers)
        );

        (sales || []).forEach((sale) => {
            if (sale?.order_id) {
                const order = orderMap.get(String(sale.order_id));
                (order?.order_items || []).forEach((item) => {
                    const productId = item?.product_id;
                    const quantity = parseMoney(item?.quantity);
                    const unitPrice = parseMoney(item?.price ?? item?.products?.price);

                    if (!productId || quantity <= 0) {
                        return;
                    }

                    addBestSellerAggregate(aggregateMap, {
                        item_key: `catalog:${productId}`,
                        product_id: productId,
                        name: item?.name || item?.products?.name || 'Unknown',
                        image_url: toAbsolutePublicImageUrl(item?.products?.image_url),
                        entry_type: 'catalog_product',
                        source_label: 'Catalog Product',
                        total_sold: quantity,
                        total_revenue: quantity * unitPrice,
                    });
                });
            }

            if (sale?.request_id) {
                const request = requestMap.get(String(sale.request_id));
                getRequestBestSellerFlowerEntries(request, sale?.total_amount, supplementalFlowerImageLookup).forEach((entry) => {
                    const normalizedName = normalizeBestSellerName(entry?.name);
                    const requestType = String(entry?.request_type || request?.type || '').trim().toLowerCase();
                    const isCustomizedFlower = requestType === 'customized';
                    addBestSellerAggregate(aggregateMap, {
                        item_key: `flower:${isCustomizedFlower ? 'customized' : 'booking'}:${normalizedName.toLowerCase()}`,
                        name: normalizedName || 'Unknown flower',
                        image_url: toAbsolutePublicImageUrl(entry?.image_url),
                        entry_type: isCustomizedFlower ? 'customized_flower' : 'booking_flower',
                        source_label: isCustomizedFlower ? 'Customizer Studio Flower' : 'Custom Order Flower',
                        total_sold: entry?.quantity,
                        total_revenue: entry?.revenue,
                    });
                });
            }
        });

        const sorted = Array.from(aggregateMap.values())
            .sort((left, right) => (
                parseMoney(right.total_sold) - parseMoney(left.total_sold)
                || parseMoney(right.total_revenue) - parseMoney(left.total_revenue)
                || String(left.name || '').localeCompare(String(right.name || ''))
            ));
        const catalogProducts = sorted
            .filter((entry) => String(entry?.entry_type || '') === 'catalog_product')
            .slice(0, 5);
        const bookingFlowers = sorted
            .filter((entry) => String(entry?.entry_type || '') === 'booking_flower')
            .slice(0, 5);
        const customizedFlowers = sorted
            .filter((entry) => String(entry?.entry_type || '') === 'customized_flower')
            .slice(0, 5);

        return {
            data: sorted,
            catalogProducts,
            bookingFlowers,
            customizedFlowers,
        };
    },

    getTransactionHistory: async (period = 'all', monthKey = null, dateKey = null, rangeStartKey = null, rangeEndKey = null) => {
        const normalizedFilters = normalizeSalesFilterArgs(period, monthKey, dateKey, rangeStartKey, rangeEndKey);
        const periodRange = getPeriodRange(
            normalizedFilters.period,
            normalizedFilters.monthKey,
            normalizedFilters.dateKey,
            normalizedFilters.rangeStartKey,
            normalizedFilters.rangeEndKey
        );

        let salesQuery = supabase
            .from('sales')
            .select('id, order_id, request_id, sale_date, total_amount')
            .order('sale_date', { ascending: false })
            .limit(500);
        salesQuery = applyDateRangeToQuery(salesQuery, 'sale_date', periodRange);

        let ordersQuery = supabase
            .from('orders')
            .select(`
                id,
                order_number,
                created_at,
                status,
                status_timestamps,
                payment_status,
                payment_method,
                amount_received,
                subtotal,
                shipping_fee,
                total,
                delivery_method,
                pickup_time,
                order_items (
                    quantity,
                    price,
                    name,
                    products ( name )
                ),
                users (
                    name,
                    email
                )
            `)
            .order('created_at', { ascending: false })
            .limit(500);
        ordersQuery = applyDateRangeToQuery(ordersQuery, 'created_at', periodRange);

        const buildTransactionRequestsQuery = (options = {}) => supabase
            .from('requests')
            .select(buildRequestSelectColumns(
                ['id', 'request_number', 'type', 'created_at', 'status'],
                [
                    { enabled: options.includeStatusTimestamps, column: 'status_timestamps' },
                    { enabled: options.includePaymentStatus, column: 'payment_status' },
                    { enabled: options.includePaymentMethod, column: 'payment_method' },
                    { enabled: options.includeAmountReceived, column: 'amount_received' },
                    { enabled: options.includeEstimatedPrice, column: 'estimated_price' },
                    { enabled: options.includeFinalPrice, column: 'final_price' },
                    { enabled: options.includeShippingFee, column: 'shipping_fee' },
                    { enabled: options.includeDeliveryMethod, column: 'delivery_method' },
                    { enabled: options.includePickupTime, column: 'pickup_time' },
                ],
                true
            ))
            .order('created_at', { ascending: false })
            .limit(500);
        let requestQueryOptions = {
            includeStatusTimestamps: true,
            includePaymentStatus: true,
            includePaymentMethod: false,
            includeAmountReceived: true,
            includeEstimatedPrice: false,
            includeFinalPrice: true,
            includeShippingFee: true,
            includeDeliveryMethod: true,
            includePickupTime: true,
        };
        let requestsQuery = applyDateRangeToQuery(
            buildTransactionRequestsQuery(requestQueryOptions),
            'created_at',
            periodRange
        );

        const [
            { data: sales, error: salesError },
            { data: orders, error: ordersError },
            requestsResult,
        ] = await Promise.all([salesQuery, ordersQuery, requestsQuery]);

        let { data: requests, error: requestsError } = requestsResult;

        const transactionRequestColumnFallbacks = [
            ['status_timestamps', 'includeStatusTimestamps', 'status_timestamps'],
            ['payment_status', 'includePaymentStatus', 'payment_status'],
            ['payment_method', 'includePaymentMethod', 'payment_method'],
            ['amount_received', 'includeAmountReceived', 'amount_received'],
            ['estimated_price', 'includeEstimatedPrice', 'estimated_price'],
            ['final_price', 'includeFinalPrice', 'final_price'],
            ['shipping_fee', 'includeShippingFee', 'shipping_fee'],
            ['delivery_method', 'includeDeliveryMethod', 'delivery_method'],
            ['pickup_time', 'includePickupTime', 'pickup_time'],
        ];

        let shouldRetryTransactionRequests = true;
        while (requestsError && shouldRetryTransactionRequests) {
            shouldRetryTransactionRequests = false;
            const missingColumn = getMissingRequestColumnFallback(
                requestsError,
                transactionRequestColumnFallbacks,
                requestQueryOptions
            );

            if (!missingColumn) {
                break;
            }

            const [, optionKey, columnLabel] = missingColumn;
            requestQueryOptions = { ...requestQueryOptions, [optionKey]: false };
            console.warn(`Retrying transaction request history without optional column ${columnLabel}`);
            const retryResult = await applyDateRangeToQuery(
                buildTransactionRequestsQuery(requestQueryOptions),
                'created_at',
                periodRange
            );
            requests = retryResult.data;
            requestsError = retryResult.error;
            shouldRetryTransactionRequests = Boolean(requestsError);
        }

        if (ordersError || requestsError) {
            console.error('Error fetching transaction history records:', { ordersError, requestsError });
            throw ordersError || requestsError;
        }

        if (salesError) {
            console.warn('Could not fetch sales rows for transaction history:', salesError.message);
        }

        const salesByOrderId = new Map();
        const salesByRequestId = new Map();
        (sales || []).forEach((sale) => {
            if (sale?.order_id) {
                salesByOrderId.set(String(sale.order_id), sale);
            }
            if (sale?.request_id) {
                salesByRequestId.set(String(sale.request_id), sale);
            }
        });

        const orderTransactions = (orders || []).map((order) => {
            const sale = salesByOrderId.get(String(order.id)) || {};
            const totalAmount = parseMoney(sale.total_amount) || parseMoney(order.total);
            const paymentStatus = String(order.payment_status || '').trim().toLowerCase();
            const amountReceived = getOrderLiveSaleAmount(order);
            const saleDate = sale.sale_date ? new Date(sale.sale_date) : getTransactionStatusDate(order);
            const items = Array.isArray(order.order_items)
                ? order.order_items.map((item) => {
                    const quantity = getTransactionQuantity(item.quantity);
                    const price = parseMoney(item.price);

                    return {
                        name: item.name || item.products?.name || 'Unknown',
                        quantity,
                        price,
                        lineTotal: price * quantity,
                    };
                })
                : [];

            return {
                id: sale.id ? `sale-${sale.id}` : `order-${order.id}`,
                date: saleDate ? saleDate.toISOString() : order.created_at,
                amount: amountReceived,
                totalAmount,
                customerName: order.users?.name || 'N/A',
                customerEmail: order.users?.email || '',
                refNumber: order.order_number || `Order #${order.id}`,
                sourceType: 'Order',
                entityType: 'order',
                status: order.status,
                paymentStatus,
                paymentMethod: order.payment_method,
                amountReceived,
                remainingBalance: getOutstandingBalance(totalAmount, amountReceived, paymentStatus),
                deliveryMethod: order.delivery_method,
                pickupTime: order.pickup_time,
                shippingFee: parseMoney(order.shipping_fee),
                requestDetails: {},
                items,
            };
        });

        const requestTransactions = (requests || []).map((request) => {
            const sale = salesByRequestId.get(String(request.id)) || {};
            const requestDetails = getRequestTransactionDetails(request);
            const totalAmount = parseMoney(sale.total_amount)
                || requestDetails.finalPrice
                || getRequestTotalAmount(request);
            const paymentStatus = String(requestDetails.paymentStatus || '').trim().toLowerCase();
            const amountReceived = getRequestLiveSaleAmount(request);
            const saleDate = sale.sale_date ? new Date(sale.sale_date) : getTransactionStatusDate(request);

            return {
                id: sale.id ? `sale-${sale.id}` : `request-${request.id}`,
                date: saleDate ? saleDate.toISOString() : request.created_at,
                amount: amountReceived,
                totalAmount,
                customerName: request.users?.name || 'N/A',
                customerEmail: request.users?.email || '',
                refNumber: request.request_number || `Request #${request.id}`,
                sourceType: request.type || 'Request',
                entityType: 'request',
                status: request.status,
                paymentStatus,
                paymentMethod: requestDetails.paymentMethod,
                amountReceived,
                remainingBalance: getOutstandingBalance(totalAmount, amountReceived, paymentStatus),
                deliveryMethod: requestDetails.deliveryMethod,
                pickupTime: requestDetails.pickupTime,
                shippingFee: requestDetails.shippingFee,
                requestDetails,
                items: getRequestTransactionItems(request, totalAmount),
            };
        });

        const transactions = [...orderTransactions, ...requestTransactions]
            .filter((transaction) => transaction.amount > 0)
            .filter((transaction) => isDateInRange(transaction.date, periodRange))
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        return { data: transactions };
    },

    getAllRequests: async (params = {}) => {
        const safeLimit = Number.isFinite(Number(params?.limit)) ? Math.max(1, Number(params.limit)) : null;
        const safeOffset = Number.isFinite(Number(params?.offset)) ? Math.max(0, Number(params.offset)) : 0;
        const requestId = params?.requestId ?? null;
        const shouldIncludeUsers = params?.includeUsers !== false;
        const shouldIncludeRefunds = params?.includeRefunds === true;

        const buildRequestsQuery = (options = {}) => {
            let query = supabase
                .from('requests')
                .select(buildAdminRequestSelectColumns(options))
                .order('created_at', { ascending: false });

            if (requestId != null) {
                query = query.eq('id', requestId);
            }

            if (safeLimit && requestId == null) {
                query = query.range(safeOffset, safeOffset + safeLimit - 1);
            }

            return query;
        };

        let queryOptions = {
            includeImageUrl: true,
            includeNotes: true,
            includeCancellationReason: true,
            includeDeliveryMethod: true,
            includePickupTime: true,
            includeFinalPrice: true,
            includeShippingFee: true,
            includePaymentStatus: true,
            includePaymentMethod: true,
            includeReceiptUrl: true,
            includeGcashReferenceNumber: true,
            includeAmountReceived: true,
            includeAdditionalReceipts: true,
            includeAssignedRider: true,
            includeStatusTimestamps: true,
            includeUsers: shouldIncludeUsers && !ADMIN_REQUEST_QUERY_SESSION_CACHE.disableEmbeddedUsers,
            includeUserEmail: shouldIncludeUsers,
            includeUserPhone: shouldIncludeUsers,
            ...ADMIN_REQUEST_QUERY_SESSION_CACHE.requestOptionOverrides,
        };

        if (!shouldIncludeUsers) {
            queryOptions = {
                ...queryOptions,
                includeUsers: false,
                includeUserEmail: false,
                includeUserPhone: false,
            };
        }

        let { data: requests, error } = await buildRequestsQuery(queryOptions);

        let shouldRetry = true;
        while (error && shouldRetry) {
            shouldRetry = false;

            const missingRequestColumn = getMissingTableColumnFallback(
                error,
                'requests',
                REQUEST_QUERY_OPTION_FALLBACKS,
                queryOptions
            );

            if (missingRequestColumn) {
                const [, optionKey, columnLabel] = missingRequestColumn;
                console.warn(`Requests table is missing the ${columnLabel} column; retrying admin request fetch without it.`);
                queryOptions = { ...queryOptions, [optionKey]: false };
                ADMIN_REQUEST_QUERY_SESSION_CACHE.requestOptionOverrides[optionKey] = false;
                ({ data: requests, error } = await buildRequestsQuery(queryOptions));
                shouldRetry = Boolean(error);
                continue;
            }

            const missingEmbeddedUserColumn = queryOptions.includeUsers !== false
                ? getMissingTableColumnFallback(
                    error,
                    'users',
                    REQUEST_EMBEDDED_USER_FALLBACKS,
                    queryOptions
                )
                : null;

            if (missingEmbeddedUserColumn) {
                const [, optionKey, columnLabel] = missingEmbeddedUserColumn;
                console.warn(`Requests user join is missing the ${columnLabel} column; retrying admin request fetch without it.`);
                queryOptions = { ...queryOptions, [optionKey]: false };
                ADMIN_REQUEST_QUERY_SESSION_CACHE.requestOptionOverrides[optionKey] = false;
                ({ data: requests, error } = await buildRequestsQuery(queryOptions));
                shouldRetry = Boolean(error);
                continue;
            }

            if (queryOptions.includeUsers !== false && shouldIncludeUsers && isUsersEmbedRelationshipError(error)) {
                console.warn('Requests query cannot embed users in this schema; retrying admin request fetch with a secondary user lookup.');
                queryOptions = {
                    ...queryOptions,
                    includeUsers: false,
                    includeUserEmail: false,
                    includeUserPhone: false,
                };
                ADMIN_REQUEST_QUERY_SESSION_CACHE.disableEmbeddedUsers = true;
                ({ data: requests, error } = await buildRequestsQuery(queryOptions));
                shouldRetry = Boolean(error);
            }
        }

        if (error) {
            console.error('Supabase query error for requests:', error);
            throw error;
        }

        let fallbackUserMap = new Map();
        if (shouldIncludeUsers && queryOptions.includeUsers === false) {
            fallbackUserMap = await fetchAdminRequestUsersByIds((requests || []).map((request) => request?.user_id));
        }

        const formattedRequests = (Array.isArray(requests) ? requests : []).map((req) => {
            const embeddedUser = Array.isArray(req.users) ? req.users[0] || {} : (req.users || {});
            const fallbackUser = fallbackUserMap.get(String(req.user_id)) || {};
            const userData = {
                ...fallbackUser,
                ...embeddedUser,
            };

            let requestData = req.data;
            if (typeof requestData === 'string') {
                try {
                    requestData = JSON.parse(requestData);
                } catch (parseError) {
                    console.error('Failed to parse request.data in adminAPI.getAllRequests:', parseError);
                    requestData = {};
                }
            }

            if (requestData?.deliveryAddress && typeof requestData.deliveryAddress === 'string') {
                requestData.deliveryAddress = requestData.deliveryAddress.replace(/, Zamboanga [Dd]el Sur/gi, '');
            }
            if (requestData?.venue && typeof requestData.venue === 'string') {
                requestData.venue = requestData.venue.replace(/, Zamboanga [Dd]el Sur/gi, '');
            }

            if (Array.isArray(requestData?.items)) {
                requestData = {
                    ...requestData,
                    items: requestData.items.map((item) => {
                        const originalQuantity = Number(
                            item?.original_quantity
                            ?? item?.quantity
                            ?? item?.qty
                            ?? item?.arrangementQuantity
                            ?? item?.arrangement_quantity
                            ?? 1
                        ) || 1;
                        const cancelledQuantity = Math.min(
                            originalQuantity,
                            Number(item?.cancelled_quantity || item?.cancelledQuantity || 0) || 0
                        );
                        const remainingQuantity = Math.max(0, originalQuantity - cancelledQuantity);

                        return {
                            ...item,
                            original_quantity: originalQuantity,
                            cancelled_quantity: cancelledQuantity,
                            remaining_quantity: remainingQuantity,
                        };
                    }),
                };
            }

            const paymentStatusToUse = req.payment_status !== undefined && req.payment_status !== null
                ? req.payment_status
                : requestData?.payment_status;
            const paymentMethodToUse = req.payment_method !== undefined && req.payment_method !== null
                ? req.payment_method
                : (requestData?.payment_method || 'gcash');
            const receiptUrlToUse = req.receipt_url !== undefined && req.receipt_url !== null
                ? req.receipt_url
                : requestData?.receipt_url;
            const gcashReferenceToUse = req.gcash_reference_number !== undefined && req.gcash_reference_number !== null
                ? req.gcash_reference_number
                : requestData?.gcash_reference_number;

            const deliveryMethodFromData = requestData?.delivery_method;
            const pickupTimeFromData = requestData?.pickup_time;
            const derivedPrimaryImage = req.image_url
                || (Array.isArray(requestData?.items)
                    ? requestData.items.find((item) => item?.image_url)?.image_url || null
                    : null)
                || requestData?.image_url
                || null;
            const requestWithParsedData = {
                ...req,
                data: requestData,
            };
            const derivedShippingFee = getRequestShippingFeeAmount(requestWithParsedData);
            const derivedTotal = getRequestTotalAmount(requestWithParsedData);
            const derivedSubtotal = Math.max(0, derivedTotal - derivedShippingFee);

            return {
                ...req,
                status: req.status,
                image_url: derivedPrimaryImage,
                final_price: derivedTotal,
                total: derivedTotal,
                subtotal: derivedSubtotal,
                shipping_fee: derivedShippingFee,
                payment_status: paymentStatusToUse,
                payment_method: paymentMethodToUse,
                receipt_url: receiptUrlToUse,
                gcash_reference_number: gcashReferenceToUse || null,
                delivery_method: deliveryMethodFromData || req.delivery_method,
                pickup_time: pickupTimeFromData || req.pickup_time,
                user_name: userData.name || requestData?.customerName || requestData?.name || 'N/A',
                user_email: userData.email || '',
                user_phone: userData.phone || req.contact_number || requestData?.contactNumber || requestData?.contact_number || '',
                users: userData,
                data: requestData,
                cancellation_reason: req.cancellation_reason || requestData?.cancellation_reason || requestData?.decline_feedback || requestData?.declineFeedback || null,
            };
        });

        let refundMap = new Map();
        if (shouldIncludeRefunds) {
            try {
                refundMap = await getRefundRequestMap('request_id', formattedRequests.map((request) => request.id));
            } catch (refundError) {
                console.warn('Unable to load refund requests for requests:', refundError.message);
            }
        }

        return {
            data: {
                requests: formattedRequests.map((request) => ({
                    ...request,
                    refund_request: shouldIncludeRefunds ? (refundMap.get(request.id) || null) : null,
                })),
            },
        };
    },

    provideQuote: async (id, price, shippingFee = 0, quoteBreakdown = null) => {
        try {
            const data = await invokeAdminWorkflow('provide_request_quote', {
                id,
                price,
                shippingFee,
                quoteBreakdown,
            });
            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct quote update:', error.message);
            return { data: await provideQuoteDirect(id, price, shippingFee, quoteBreakdown) };
        }
    },

    acceptRequest: async (id) => {
        try {
            const data = await invokeAdminWorkflow('update_request_status', {
                id,
                status: 'accepted',
                options: {},
            });
            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct request accept:', error.message);
            return { data: await updateRequestStatusDirect(id, 'accepted') };
        }
    },

    updateRequestStatus: async (id, status, options = {}) => {
        try {
            const data = await invokeAdminWorkflow('update_request_status', {
                id,
                status,
                options,
            });
            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct request status update:', error.message);
            return { data: await updateRequestStatusDirect(id, status, options) };
        }
    },
    updateRequestPaymentStatus: async (requestToUpdate, newStatus) => {
        const requestId = typeof requestToUpdate === 'object' ? requestToUpdate?.id : requestToUpdate;
        const requestType = typeof requestToUpdate === 'object' ? requestToUpdate?.type : null;
        try {
            const data = await invokeAdminWorkflow('update_request_payment_status', {
                requestId,
                requestType,
                status: newStatus,
            });
            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct request payment update:', error.message);
            return { data: await updateRequestPaymentStatusDirect(requestId, requestType, newStatus) };
        }
    },

    assignRiderToRequest: async (requestId, riderId, thirdPartyName = null, thirdPartyInfo = null) => {
        try {
            const data = await invokeAdminWorkflow('assign_request_rider', {
                requestId,
                riderId,
                thirdPartyName,
                thirdPartyInfo,
            });
            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct request rider assignment:', error.message);
            return { data: await assignRequestRiderDirect(requestId, riderId, thirdPartyName, thirdPartyInfo) };
        }
    },

    assignRequestStopRiders: async (requestId, stopAssignments = []) => {
        try {
            const data = await invokeAdminWorkflow('assign_request_stop_riders', {
                requestId,
                stopAssignments,
            });
            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct request stop assignment:', error.message);
            return { data: await assignRequestStopRidersDirect(requestId, stopAssignments) };
        }
    },

    completeRequestDeliveryStop: async (requestId, unitKey, options = {}) => {
        const normalizedProofFile = await normalizeDeliveryProofFile(options?.proofFile || null);
        const startedAt = Date.now();

        console.log('[admin-perf] request delivery stop completion start', {
            requestId,
            unitKey,
            hasProof: Boolean(normalizedProofFile?.base64 || normalizedProofFile?.uri),
        });

        try {
            const data = await completeRequestDeliveryStopDirect(requestId, unitKey, {
                ...options,
                proofFile: normalizedProofFile,
            });

            console.log('[admin-perf] request delivery stop completion success', {
                requestId,
                unitKey,
                path: 'direct',
                durationMs: Date.now() - startedAt,
            });
            return { data };
        } catch (directError) {
            console.warn('Direct request delivery stop completion failed, trying manage-admin-workflows fallback:', directError.message);

            try {
                const data = await invokeAdminWorkflow('complete_request_delivery_stop', {
                    requestId,
                    unitKey,
                    proofFile: normalizedProofFile,
                    proofNote: options?.proofNote || '',
                });

                console.log('[admin-perf] request delivery stop completion success', {
                    requestId,
                    unitKey,
                    path: 'edge',
                    durationMs: Date.now() - startedAt,
                });
                return { data };
            } catch (edgeError) {
                console.log('[admin-perf] request delivery stop completion failed', {
                    requestId,
                    unitKey,
                    path: 'direct+edge',
                    durationMs: Date.now() - startedAt,
                    directMessage: directError?.message || String(directError),
                    edgeMessage: edgeError?.message || String(edgeError),
                });
                throw new Error(getDeliveryProofCompletionFallbackMessage(directError, edgeError));
            }
        }
    },

    getAllStock: async () => {
        let lastError = null;

        for (let attempt = 0; attempt < 3; attempt += 1) {
            const { data: stock, error } = await supabase
                .from('stock_products')
                .select('*')
                .order('created_at', { ascending: false });

            if (!error) {
                return { data: stock };
            }

            lastError = error;

            if (attempt < 2 && isTransientFetchError(error)) {
                console.warn(`Transient stock_products fetch error; retrying (${attempt + 1}/2)...`, error);
                await wait(350 * (attempt + 1));
                continue;
            }

            console.error('Supabase query error for stock_products:', error);
            throw error;
        }

        throw lastError || new Error('Failed to load stock products.');
    },

    createStock: async (formData) => {
        const insertStockRecord = async (payload) => {
            const { data, error } = await supabase
                .from('stock_products')
                .insert([payload])
                .select()
                .single();

            return { data, error };
        };
        const saveWithLegacyFallback = async (payload) => {
            let nextPayload = { ...payload };
            let result = await insertStockRecord(nextPayload);

            while (result.error) {
                const errorCode = String(result.error?.code || '').toUpperCase();
                const errorMessage = String(result.error?.message || '');
                const missingColumnMatch = errorMessage.match(/Could not find the '([^']+)' column of 'stock_products'/i);
                const missingColumn = missingColumnMatch?.[1];

                if (!missingColumn || !['PGRST204', '42703'].includes(errorCode) || !(missingColumn in nextPayload)) {
                    break;
                }

                const fallbackPayload = { ...nextPayload };
                delete fallbackPayload[missingColumn];
                nextPayload = fallbackPayload;
                result = await insertStockRecord(nextPayload);
            }

            return result;
        };

        let imageUrl = null;
        const imageFile = formData.image;

        if (imageFile && (imageFile.base64 || imageFile.uri)) {
            try {
                imageUrl = await uploadNormalizedImageToBucket(imageFile, {
                    bucket: 'stock-images',
                    fileNamePrefix: 'stock',
                    upsert: false,
                    label: 'stock image',
                });
            } catch (error) {
                console.error('Error processing stock image:', error);
                throw new Error('Failed to upload stock image: ' + error.message);
            }
        }

        const stockToInsert = {
            name: formData.name,
            category: formData.category,
            price: parseFloat(formData.price) || 0,
            quantity: parseInt(formData.quantity, 10) || 0,
            unit: formData.unit || '',
            reorder_level: parseInt(formData.reorder_level, 10) || 10,
            is_available: formData.is_available, // Mapped from is_available in form
            image_url: imageUrl,
            preview_image_url: formData.preview_image_url || imageUrl,
            layer_image_url: formData.layer_image_url || formData.preview_image_url || imageUrl,
            stem_image_url: formData.stem_image_url || formData.layer_image_url || formData.preview_image_url || imageUrl,
            wrapper_group_name: formData.wrapper_group_name || null,
            wrapper_color: formData.wrapper_color || null,
            ribbon_scope: formData.ribbon_scope || null,
            customization_config: buildStockCustomizationConfig(formData),
            customizer_metadata: buildLegacyStockMetadata(formData),
            wrapper_behavior: buildLegacyStockMetadata(formData),
        };

        const { data: newStock, error } = await saveWithLegacyFallback(stockToInsert);

        if (error) {
            console.error('Database insert error for stock:', error);
            throw error;
        }

        return { data: newStock };
    },

    updateStock: async (id, formData) => {
        const updateStockRecord = async (payload) => {
            const { data, error } = await supabase
                .from('stock_products')
                .update(payload)
                .eq('id', id)
                .select()
                .single();

            return { data, error };
        };
        const saveWithLegacyFallback = async (payload) => {
            let nextPayload = { ...payload };
            let result = await updateStockRecord(nextPayload);

            while (result.error) {
                const errorCode = String(result.error?.code || '').toUpperCase();
                const errorMessage = String(result.error?.message || '');
                const missingColumnMatch = errorMessage.match(/Could not find the '([^']+)' column of 'stock_products'/i);
                const missingColumn = missingColumnMatch?.[1];

                if (!missingColumn || !['PGRST204', '42703'].includes(errorCode) || !(missingColumn in nextPayload)) {
                    break;
                }

                const fallbackPayload = { ...nextPayload };
                delete fallbackPayload[missingColumn];
                nextPayload = fallbackPayload;
                result = await updateStockRecord(nextPayload);
            }

            return result;
        };

        let imageUrl = formData.image_url_hidden; // This might be the existing image URL
        const imageFile = formData.image;
        const oldImageUrl = formData.old_image_url; // Assuming this is passed for old image deletion

        if (imageFile && (imageFile.base64 || imageFile.uri) && !String(imageFile.uri || '').startsWith('http')) {
            try {
                imageUrl = await uploadNormalizedImageToBucket(imageFile, {
                    bucket: 'stock-images',
                    fileNamePrefix: 'stock',
                    upsert: true,
                    label: 'stock image',
                });

                // Delete old image if it exists and a new one was uploaded
                if (oldImageUrl && oldImageUrl !== imageUrl) {
                    await removeStockStorageObjectIfNeeded(oldImageUrl);
                }

            } catch (error) {
                console.error('Error processing stock image for update:', error);
                throw new Error('Failed to upload stock image for update: ' + error.message);
            }
        } else if (imageFile === null) {
            // If image was explicitly removed by setting to null
            if (oldImageUrl) {
                await removeStockStorageObjectIfNeeded(oldImageUrl);
            }
            imageUrl = null;
        } else if (imageFile && imageFile.uri && (imageFile.uri.startsWith('http') || imageFile.uri.startsWith('data:'))) {
            // No new image, keep existing one
            imageUrl = imageFile.uri;
        }


        const stockToUpdate = {
            name: formData.name,
            category: formData.category,
            price: parseFloat(formData.price) || 0,
            quantity: parseInt(formData.quantity, 10) || 0,
            unit: formData.unit || '',
            reorder_level: parseInt(formData.reorder_level, 10) || 10,
            is_available: formData.is_available, // Mapped from is_available in form
            image_url: imageUrl,
            preview_image_url: formData.preview_image_url || imageUrl,
            layer_image_url: formData.layer_image_url || formData.preview_image_url || imageUrl,
            stem_image_url: formData.stem_image_url || formData.layer_image_url || formData.preview_image_url || imageUrl,
            wrapper_group_name: formData.wrapper_group_name || null,
            wrapper_color: formData.wrapper_color || null,
            ribbon_scope: formData.ribbon_scope || null,
            customization_config: buildStockCustomizationConfig(formData),
            customizer_metadata: buildLegacyStockMetadata(formData),
            wrapper_behavior: buildLegacyStockMetadata(formData),
            updated_at: new Date().toISOString(),
        };

        const { data: updatedStock, error } = await saveWithLegacyFallback(stockToUpdate);

        if (error) {
            console.error('Error updating stock:', error);
            throw error;
        }

        return { data: updatedStock };
    },

    deleteStock: async (id) => {
        // First, get the image_url to delete the image from storage
        const { data: stockItem, error: fetchError } = await supabase
            .from('stock_products')
            .select('image_url')
            .eq('id', id)
            .single();

        if (fetchError) {
            console.error('Error fetching stock item for deletion:', fetchError);
            throw fetchError;
        }

        if (stockItem.image_url) {
            try {
                await removeStockStorageObjectIfNeeded(stockItem.image_url);
            } catch (deleteImageError) {
                console.error('Error deleting stock image:', deleteImageError);
                // Continue with deleting the record even if image deletion fails
            }
        }

        // Then, delete the stock item record
        const { error: deleteRecordError } = await supabase
            .from('stock_products')
            .delete()
            .eq('id', id);

        if (deleteRecordError) {
            console.error('Error deleting stock record:', deleteRecordError);
            throw deleteRecordError;
        }

        return { data: { success: true } };
    }
};

// Upload API - uses Supabase Storage
export const uploadAPI = {
    image: async (file) => {
        const url = await uploadNormalizedImageToBucket(file, {
            bucket: 'product-images',
            fileNamePrefix: 'upload',
            upsert: false,
            label: 'image',
        });
        return { data: { url } };
    }
};

// Base URL export
export const BASE_URL = 'https://luzcecstkebntjnfonwv.supabase.co/storage/v1/object/public/product-images/';

// Default export
export default {
    productAPI,
    categoryAPI,
    orderAPI,
    authAPI,
    adminAPI,
    uploadAPI,
    BASE_URL
};

