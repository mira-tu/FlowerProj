import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { decode } from 'base64-arraybuffer';
import {
    groupDeliveryDestinations,
    parseMultiDeliveryNotes,
    serializeMultiDeliveryNotes,
} from '../utils/deliveryDestinations';

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

    if (typeof error.message === 'string' && error.message.trim()) {
        return error.message;
    }

    if (error.context) {
        try {
            const payload = await error.context.json();
            if (payload?.error) {
                return payload.error;
            }
        } catch (jsonError) {
            try {
                const text = await error.context.text();
                if (text) {
                    return text;
                }
            } catch (textError) {
                // Fall back to the provided message below.
            }
        }
    }

    return fallbackMessage;
};

const invokeAdminWorkflow = async (action, payload = {}) => {
    const accessToken = await getWorkflowAccessToken();

    if (!accessToken) {
        throw new Error('Your admin session expired. Please sign in again to continue.');
    }

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
        const message = await getFunctionErrorMessage(error, `Failed to ${action.replace(/_/g, ' ')}.`);
        const enrichedError = new Error(message);
        enrichedError.name = error?.name || 'AdminWorkflowError';
        enrichedError.cause = error;
        throw enrichedError;
    }

    if (data?.error) {
        throw new Error(data.error);
    }

    return data;
};

const shouldFallbackToDirectWorkflow = (error) => {
    const message = String(error?.message || '').toLowerCase();
    const name = String(error?.name || error?.cause?.name || '').toLowerCase();

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

const insertNotificationRecord = async (notification) => {
    const { error } = await supabase
        .from('notifications')
        .insert([notification]);

    if (error) {
        throw error;
    }
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
        current = await getOrderById(id, 'id, status_timestamps, cancellation_reason');
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

const updateOrderPaymentStatusDirect = async (id, status) => {
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
    const updatePayload = { payment_status: status };

    if (normalizedStatus === 'paid' && orderTotal > 0) {
        updatePayload.amount_received = orderTotal;
    }

    const data = await updateOrderRecordAndReload(
        id,
        updatePayload,
        (order) => {
            if (order?.payment_status !== status) {
                return false;
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

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
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

const getPeriodRange = (period = 'all', monthKey = null, dateKey = null) => {
    if (period === 'today') {
        return getTodayRange();
    }

    if (period === 'date') {
        return getDateRange(dateKey);
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

const CREDIT_PAYMENT_STATUSES = new Set(['partial', 'to_pay', 'waiting_for_confirmation', 'failed']);
const UPCOMING_ORDER_STATUSES = new Set(['pending', 'processing', 'ready_for_pickup', 'out_for_delivery']);
const UPCOMING_REQUEST_STATUSES = new Set(['pending', 'quoted', 'accepted', 'processing', 'ready_for_pickup', 'out_for_delivery']);
const CLOSED_ORDER_STATUSES = new Set(['cancelled']);
const CLOSED_REQUEST_STATUSES = new Set(['cancelled', 'declined']);

const parseMoney = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
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

const getRequestTotalAmount = (request, options = {}) => {
    const finalPrice = parseMoney(request?.final_price);
    if (finalPrice > 0) {
        return finalPrice;
    }

    const estimatedPrice = parseMoney(request?.estimated_price);
    if (estimatedPrice > 0) {
        return estimatedPrice;
    }

    return options.allowTentative ? getRequestTentativeAmount(request) : 0;
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

    return Math.min(safeTotal, safeReceived);
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
        .select('status_timestamps, data, user_id, request_number, cancellation_reason')
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

        if (imageFile && imageFile.base64) {
            try {
                const fileName = imageFile.fileName || `product-${Date.now()}.jpg`;
                const contentType = imageFile.mimeType || 'image/jpeg';
                const arrayBuffer = decode(imageFile.base64);

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(fileName, arrayBuffer, {
                        cacheControl: '3600',
                        upsert: false,
                        contentType,
                    });

                if (uploadError) {
                    console.error('Supabase upload error:', uploadError);
                    throw uploadError;
                }

                const { data: publicUrlData } = supabase.storage
                    .from('product-images')
                    .getPublicUrl(uploadData.path);

                imageUrl = publicUrlData.publicUrl;

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

        if (imageFile && imageFile.base64) {
            try {
                const fileName = imageFile.fileName || `${Date.now()}.jpg`;
                const contentType = imageFile.mimeType || 'image/jpeg';
                const arrayBuffer = decode(imageFile.base64);

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(fileName, arrayBuffer, {
                        cacheControl: '3600',
                        upsert: true,
                        contentType: contentType,
                    });

                if (uploadError) {
                    console.error('Error uploading image:', uploadError);
                    throw uploadError;
                }
                const { data: publicUrlData } = supabase.storage.from('product-images').getPublicUrl(uploadData.path);
                imageUrl = publicUrlData.publicUrl; // Set new image URL
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

const buildFallbackStaffProfile = (user) => {
    const fallbackRole = user?.user_metadata?.role;

    if (!isStaffRole(fallbackRole)) {
        return null;
    }

    return {
        role: fallbackRole,
        name: user.user_metadata?.name || user.email,
        phone: user.user_metadata?.phone || null,
    };
};

const restoreMissingStaffProfile = async (user, profile) => {
    const { error: upsertError } = await supabase
        .from('users')
        .upsert({
            id: user.id,
            name: profile.name,
            email: user.email,
            phone: profile.phone,
            role: profile.role,
        }, { onConflict: 'id' });

    if (upsertError) {
        console.warn('Non-blocking: failed to restore missing staff profile row:', upsertError);
    }
};

const getStaffProfile = async (user, { restoreMissingProfile = false } = {}) => {
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

    const fallbackProfile = buildFallbackStaffProfile(user);

    if (fallbackProfile && restoreMissingProfile) {
        await restoreMissingStaffProfile(user, fallbackProfile);
    }

    return fallbackProfile;
};

const buildStaffSessionPayload = async (session) => {
    const profile = await getStaffProfile(session.user, { restoreMissingProfile: true });

    if (!profile) {
        await supabase.auth.signOut();
        throw new Error('Could not verify user role. Your account might not be set up correctly.');
    }

    if (!isStaffRole(profile.role)) {
        await supabase.auth.signOut();
        throw new Error('Access Denied: You do not have permission to access this dashboard.');
    }

    return {
        token: session.access_token,
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

        const profile = await getStaffProfile(user, { restoreMissingProfile: true });

        if (!profile || !isStaffRole(profile.role)) {
            await supabase.auth.signOut();
            return { data: null };
        }

        return { data: { ...user, ...profile } };
    },

    restoreStaffSession: async () => {
        const { data: sessionData, error } = await supabase.auth.getSession();

        if (error) {
            throw error;
        }

        let session = sessionData.session;

        if (!session?.user) {
            const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError) {
                console.warn('Unable to refresh staff session:', refreshError.message);
            }

            session = refreshedData?.session || null;
        }

        if (!session?.user) {
            return { data: null };
        }

        return {
            data: await buildStaffSessionPayload(session),
        };
    },
};

// Admin API - Supabase-backed admin operations
export const adminAPI = {
    getAllOrders: async (params) => {
        const buildOrdersQuery = ({ includeNotes = true, includeCancellationReason = true } = {}) => {
            let query = supabase
                .from('orders')
                .select(`
                    id,
                    created_at,
                    order_number,
                    status,
                    assigned_rider,
                    payment_status,
                    payment_method,
                    receipt_url,
                    additional_receipts,
                    pickup_time,
                    total,
                    subtotal,
                    shipping_fee,
                    ${includeCancellationReason ? 'cancellation_reason,' : ''}
                    delivery_method,
                    ${includeNotes ? 'notes,' : ''}
                    shipping_address: addresses!address_id(*),
                    users (
                        id,
                        name,
                        email,
                        phone
                    ),
                    order_items (
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
                    ),
                    third_party_rider_name,
                    third_party_rider_info,
                    amount_received
                `)
                .order('created_at', { ascending: false });

            if (params?.status) {
                query = query.eq('status', params.status);
            }

            return query;
        };

        let queryOptions = { includeNotes: true, includeCancellationReason: true };
        let { data: orders, error } = await buildOrdersQuery(queryOptions);

        const missingColumnError = () => error?.code === '42703' ? String(error?.message || '') : '';

        if (missingColumnError().includes('orders.notes')) {
            console.warn('Orders table is missing the notes column; retrying admin order fetch without it.');
            queryOptions = { ...queryOptions, includeNotes: false };
            ({ data: orders, error } = await buildOrdersQuery(queryOptions));
        }

        if (missingColumnError().includes('orders.cancellation_reason')) {
            console.warn('Orders table is missing the cancellation_reason column; retrying admin order fetch without it.');
            queryOptions = { ...queryOptions, includeCancellationReason: false };
            ({ data: orders, error } = await buildOrdersQuery(queryOptions));
        }

        if (error) {
            console.error('Supabase query error for orders:', error);
            throw error;
        }

        const formattedOrders = orders.map(order => {
            const parsedNotes = parseMultiDeliveryNotes(order.notes);
            const customerName = order.users ? order.users.name : 'N/A';
            const customerEmail = order.users ? order.users.email : 'N/A';
            const customerPhone = order.users ? order.users.phone : 'N/A';

            const items = order.order_items.map(item => {
                const originalQuantity = Number(item.quantity || 0);
                const cancelledQuantity = Number(item.cancelled_quantity || 0);
                const remainingQuantity = Math.max(0, originalQuantity - cancelledQuantity);

                return {
                    id: item.id,
                    product_id: item.product_id,
                    quantity: remainingQuantity,
                    original_quantity: originalQuantity,
                    cancelled_quantity: cancelledQuantity,
                    remaining_quantity: remainingQuantity,
                    cancellation_history: Array.isArray(item.cancellation_history) ? item.cancellation_history : [],
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

    updateOrderPaymentStatus: async (id, status) => {
        try {
            const data = await invokeAdminWorkflow('update_order_payment_status', { id, status });
            return { data };
        } catch (error) {
            if (!shouldFallbackToDirectWorkflow(error)) throw error;
            console.warn('Falling back to direct order payment update:', error.message);
            return { data: await updateOrderPaymentStatusDirect(id, status) };
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
        const period = filters?.period || 'all';
        const periodRange = getPeriodRange(period, filters?.monthKey, filters?.dateKey);
        const todayRange = getTodayRange();
        const weekRange = getWeekRange();
        const currentMonthRange = getMonthRange(formatMonthKey(new Date()));

        let salesQuery = supabase.from('sales').select('total_amount, sale_date');
        salesQuery = applyDateRangeToQuery(salesQuery, 'sale_date', periodRange);

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
            .select(`
                id,
                request_number,
                type,
                created_at,
                status,
                payment_status,
                amount_received,
                final_price,
                ${options.includeEstimatedPrice !== false ? 'estimated_price,' : ''}
                delivery_method,
                pickup_time,
                data,
                users (
                    name,
                    email
                )
            `)
            .order('created_at', { ascending: false });

        ordersQuery = applyDateRangeToQuery(ordersQuery, 'created_at', periodRange);
        let requestQueryOptions = {
            includeEstimatedPrice: true,
        };
        let requestsQuery = applyDateRangeToQuery(buildSalesRequestsQuery(requestQueryOptions), 'created_at', periodRange);

        const [
            { data: sales, error: salesError },
            { data: orders, error: ordersError },
            requestsResult,
        ] = await Promise.all([salesQuery, ordersQuery, requestsQuery]);

        let { data: requests, error: requestsError } = requestsResult;

        const requestSalesColumnFallbacks = [
            ['requests.estimated_price', 'includeEstimatedPrice', 'estimated_price'],
        ];

        let shouldRetryRequests = true;
        while (requestsError && shouldRetryRequests) {
            shouldRetryRequests = false;
            const message = String(requestsError.message || '');
            const missingColumn = requestSalesColumnFallbacks.find(([qualifiedName]) => (
                message.includes(qualifiedName)
            ));

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

        if (salesError || ordersError || requestsError) {
            console.error('Error fetching sales summary sources:', { salesError, ordersError, requestsError });
            throw salesError || ordersError || requestsError;
        }

        const addSalesInRange = (range) => (sales || []).reduce((sum, sale) => {
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

        const summary = {
            totalSales: addSalesInRange(periodRange),
            todaySales: addSalesInRange(todayRange),
            weekSales: addSalesInRange(weekRange),
            monthSales: addSalesInRange(currentMonthRange),
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
            const collectedCash = getCollectedCashAmount(totalAmount, amountReceived, paymentStatus);

            summary.totalOrders += 1;
            summary.cashSales += collectedCash;

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
            const requestTotal = getRequestTotalAmount(request);
            const requestDisplayTotal = getRequestTotalAmount(request, { allowTentative: true });
            const amountReceived = parseMoney(request?.amount_received);
            const paymentStatus = String(request?.payment_status || '').trim().toLowerCase();
            const remainingBalance = getOutstandingBalance(requestTotal, amountReceived, paymentStatus);
            const status = String(request?.status || '').trim().toLowerCase();
            const isClosed = CLOSED_REQUEST_STATUSES.has(status);
            const isUpcoming = UPCOMING_REQUEST_STATUSES.has(status);
            const scheduleDate = getRequestScheduleDate(request) || request?.created_at || null;
            const scheduleText = request?.pickup_time
                ? `Pickup ${request.pickup_time}`
                : (getRequestScheduleDate(request) ? 'Scheduled request' : 'Active request');
            const collectedCash = getCollectedCashAmount(requestTotal, amountReceived, paymentStatus);

            summary.totalOrders += 1;
            summary.cashSales += collectedCash;

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

        return { data: summary };
    },

    getSalesChartData: async (period = 'week', monthKey = null, dateKey = null) => {
        const periodRange = getPeriodRange(period, monthKey, dateKey);
        let query = supabase
            .from('sales')
            .select('sale_date, total_amount')
            .order('sale_date', { ascending: true });

        query = applyDateRangeToQuery(query, 'sale_date', periodRange);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching sales chart data:', error);
            throw error;
        }
        return { data };
    },

    getBestSellingProducts: async (period = 'all', monthKey = null, dateKey = null) => {
        const periodRange = getPeriodRange(period, monthKey, dateKey);
        let query = supabase
            .from('sales')
            .select(`
                sale_date,
                orders (
                    order_items (
                        product_id,
                        quantity,
                        price,
                        products (
                            name,
                            image_url,
                            price
                        )
                    )
                )
            `)
            .not('order_id', 'is', null);

        query = applyDateRangeToQuery(query, 'sale_date', periodRange);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching best selling products:', error);
            throw error;
        }

        const productMap = {};

        (data || []).forEach((sale) => {
            (sale.orders?.order_items || []).forEach((item) => {
                const id = item.product_id;
                if (!id) {
                    return;
                }

                if (!productMap[id]) {
                    productMap[id] = {
                        product_id: id,
                        name: item.products?.name || 'Unknown',
                        image_url: item.products?.image_url || null,
                        price: item.products?.price || item.price || 0,
                        total_sold: 0,
                        total_revenue: 0,
                    };
                }

                const quantity = Number(item.quantity || 0);
                const unitPrice = Number(item.price || item.products?.price || 0);
                productMap[id].total_sold += quantity;
                productMap[id].total_revenue += quantity * unitPrice;
            });
        });

        const sorted = Object.values(productMap).sort((a, b) => b.total_sold - a.total_sold);
        return { data: sorted.slice(0, 5) };
    },

    getTransactionHistory: async (period = 'all', monthKey = null, dateKey = null) => {
        let query = supabase
            .from('sales')
            .select(`
                id,
                order_id,
                request_id,
                user_id,
                sale_date,
                total_amount,
                orders (
                    order_number,
                    delivery_method,
                    payment_method,
                    order_items (
                        quantity,
                        price,
                        products ( name )
                    )
                ),
                requests (
                    request_number,
                    type
                ),
                users (
                    name,
                    email
                )
            `)
            .order('sale_date', { ascending: false });

        const periodRange = getPeriodRange(period, monthKey, dateKey);
        query = applyDateRangeToQuery(query, 'sale_date', periodRange);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching transaction history:', error);
            throw error;
        }

        const transactions = (data || []).map(sale => {
            const isOrder = !!sale.order_id;
            const refNumber = isOrder
                ? sale.orders?.order_number
                : sale.requests?.request_number;
            const sourceType = isOrder ? 'Order' : (sale.requests?.type || 'Request');
            const items = isOrder && sale.orders?.order_items
                ? sale.orders.order_items.map(oi => ({
                    name: oi.products?.name || 'Unknown',
                    quantity: oi.quantity,
                    price: oi.price,
                }))
                : [];

            return {
                id: sale.id,
                date: sale.sale_date,
                amount: parseFloat(sale.total_amount),
                customerName: sale.users?.name || 'N/A',
                customerEmail: sale.users?.email || '',
                refNumber: refNumber || 'N/A',
                sourceType,
                items,
            };
        });

        return { data: transactions };
    },

    getAllRequests: async (params) => {
        const buildRequestsQuery = (options = {}) => supabase
            .from('requests')
            .select(`
                id,
                request_number,
                type,
                status,
                contact_number,
                ${options.includeImageUrl !== false ? 'image_url,' : ''}
                ${options.includeNotes !== false ? 'notes,' : ''}
                ${options.includeCancellationReason !== false ? 'cancellation_reason,' : ''}
                data,
                created_at,
                ${options.includeDeliveryMethod !== false ? 'delivery_method,' : ''}
                ${options.includePickupTime !== false ? 'pickup_time,' : ''}
                ${options.includeFinalPrice !== false ? 'final_price,' : ''}
                ${options.includeShippingFee !== false ? 'shipping_fee,' : ''}
                ${options.includePaymentStatus !== false ? 'payment_status,' : ''}
                ${options.includePaymentMethod !== false ? 'payment_method,' : ''}
                ${options.includeReceiptUrl !== false ? 'receipt_url,' : ''}
                ${options.includeAmountReceived !== false ? 'amount_received,' : ''}
                ${options.includeAdditionalReceipts !== false ? 'additional_receipts,' : ''}
                ${options.includeAssignedRider !== false ? 'assigned_rider,' : ''}
                ${options.includeStatusTimestamps !== false ? 'status_timestamps,' : ''}
                users (
                    id,
                    name,
                    email,
                    phone
                )
            `)
            .order('created_at', { ascending: false });

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
            includeAmountReceived: true,
            includeAdditionalReceipts: true,
            includeAssignedRider: true,
            includeStatusTimestamps: true,
        };

        let { data: requests, error } = await buildRequestsQuery(queryOptions);

        const requestColumnFallbacks = [
            ['requests.image_url', 'includeImageUrl', 'image_url'],
            ['requests.notes', 'includeNotes', 'notes'],
            ['requests.cancellation_reason', 'includeCancellationReason', 'cancellation_reason'],
            ['requests.delivery_method', 'includeDeliveryMethod', 'delivery_method'],
            ['requests.pickup_time', 'includePickupTime', 'pickup_time'],
            ['requests.final_price', 'includeFinalPrice', 'final_price'],
            ['requests.shipping_fee', 'includeShippingFee', 'shipping_fee'],
            ['requests.payment_status', 'includePaymentStatus', 'payment_status'],
            ['requests.payment_method', 'includePaymentMethod', 'payment_method'],
            ['requests.receipt_url', 'includeReceiptUrl', 'receipt_url'],
            ['requests.amount_received', 'includeAmountReceived', 'amount_received'],
            ['requests.additional_receipts', 'includeAdditionalReceipts', 'additional_receipts'],
            ['requests.assigned_rider', 'includeAssignedRider', 'assigned_rider'],
            ['requests.status_timestamps', 'includeStatusTimestamps', 'status_timestamps'],
        ];

        let shouldRetry = true;
        while (error && shouldRetry) {
            shouldRetry = false;

            const errorCode = String(error?.code || '');
            const errorMessage = String(error?.message || '');
            const missingColumnMessage = errorCode === '42703' || errorCode === 'PGRST204' || errorMessage.includes('schema cache')
                ? errorMessage
                : '';

            if (!missingColumnMessage) {
                break;
            }

            for (const [needle, optionKey, columnLabel] of requestColumnFallbacks) {
                const matchesMissingColumn = missingColumnMessage.includes(needle)
                    || missingColumnMessage.includes(`'${columnLabel}' column of 'requests'`);

                if (queryOptions[optionKey] !== false && matchesMissingColumn) {
                    console.warn(`Requests table is missing the ${columnLabel} column; retrying admin request fetch without it.`);
                    queryOptions = { ...queryOptions, [optionKey]: false };
                    ({ data: requests, error } = await buildRequestsQuery(queryOptions));
                    shouldRetry = true;
                    break;
                }
            }
        }

        if (error) {
            console.error('Supabase query error for requests:', error);
            throw error;
        }

        const formattedRequests = requests.map(req => {
            const userData = req.users || {};

            // Always prefer the top-level DB column for payment fields (they are updated by admin actions).
            let requestData = req.data;
            if (typeof requestData === 'string') {
                try {
                    requestData = JSON.parse(requestData);
                } catch (e) {
                    console.error("Failed to parse request.data in adminAPI.getAllRequests:", e);
                    requestData = {};
                }
            }

            // Strip out 'Zamboanga Del Sur' if present in custom request address fields
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
                            Number(item?.cancelled_quantity || item?.cancelledQuantity || 0) || 0,
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

            // Always prefer the top-level DB column for payment fields (they are updated by admin actions).
            // Only fall back to JSONB 'data' if the top-level column is null/undefined.
            const paymentStatusToUse = req.payment_status !== undefined && req.payment_status !== null ? req.payment_status : requestData?.payment_status;
            const paymentMethodToUse = req.payment_method !== undefined && req.payment_method !== null ? req.payment_method : (requestData?.payment_method || 'gcash');
            const receiptUrlToUse = req.receipt_url !== undefined && req.receipt_url !== null ? req.receipt_url : requestData?.receipt_url;

            const deliveryMethodFromData = requestData?.delivery_method;
            const pickupTimeFromData = requestData?.pickup_time;
            const derivedPrimaryImage = req.image_url
                || (Array.isArray(requestData?.items)
                    ? requestData.items.find((item) => item?.image_url)?.image_url || null
                    : null)
                || requestData?.image_url
                || null;

            return {
                ...req,
                status: req.status,
                image_url: derivedPrimaryImage,
                payment_status: paymentStatusToUse,
                payment_method: paymentMethodToUse,
                receipt_url: receiptUrlToUse,
                delivery_method: deliveryMethodFromData || req.delivery_method,
                pickup_time: pickupTimeFromData || req.pickup_time,
                user_name: userData.name,
                user_email: userData.email,
                user_phone: userData.phone,
                users: userData,
                data: requestData,
                cancellation_reason: req.cancellation_reason || requestData?.cancellation_reason || requestData?.decline_feedback || requestData?.declineFeedback || null,
            };
        });

        let refundMap = new Map();
        try {
            refundMap = await getRefundRequestMap('request_id', formattedRequests.map((request) => request.id));
        } catch (refundError) {
            console.warn('Unable to load refund requests for requests:', refundError.message);
        }

        return {
            data: {
                requests: formattedRequests.map((request) => ({
                    ...request,
                    refund_request: refundMap.get(request.id) || null,
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

    getAllStock: async () => {
        const { data: stock, error } = await supabase
            .from('stock_products')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase query error for stock_products:', error);
            throw error;
        }
        return { data: stock };
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

        let imageUrl = null;
        const imageFile = formData.image;

        if (imageFile && imageFile.base64) {
            try {
                const fileName = imageFile.fileName || `stock-${Date.now()}.jpg`;
                const contentType = imageFile.mimeType || 'image/jpeg';
                const arrayBuffer = decode(imageFile.base64);

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('stock-images')
                    .upload(fileName, arrayBuffer, {
                        cacheControl: '3600',
                        upsert: false,
                        contentType,
                    });

                if (uploadError) {
                    throw uploadError;
                }

                const { data: publicUrlData } = supabase.storage
                    .from('stock-images')
                    .getPublicUrl(uploadData.path);

                imageUrl = publicUrlData.publicUrl;

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
            customization_config: formData.customization_config || null,
        };

        let { data: newStock, error } = await insertStockRecord(stockToInsert);

        const isMissingCustomizationConfig = String(error?.message || '').toLowerCase().includes('customization_config')
            && ['PGRST204', '42703'].includes(String(error?.code || '').toUpperCase());

        if (isMissingCustomizationConfig) {
            const fallbackPayload = { ...stockToInsert };
            delete fallbackPayload.customization_config;
            ({ data: newStock, error } = await insertStockRecord(fallbackPayload));
        }

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

        let imageUrl = formData.image_url_hidden; // This might be the existing image URL
        const imageFile = formData.image;
        const oldImageUrl = formData.old_image_url; // Assuming this is passed for old image deletion

        if (imageFile && imageFile.base64) {
            try {
                const fileName = imageFile.fileName || `stock-${Date.now()}.jpg`;
                const contentType = imageFile.mimeType || 'image/jpeg';
                const arrayBuffer = decode(imageFile.base64);

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('stock-images')
                    .upload(fileName, arrayBuffer, {
                        cacheControl: '3600',
                        upsert: true,
                        contentType,
                    });

                if (uploadError) {
                    throw uploadError;
                }

                const { data: publicUrlData } = supabase.storage
                    .from('stock-images')
                    .getPublicUrl(uploadData.path);

                imageUrl = publicUrlData.publicUrl;

                // Delete old image if it exists and a new one was uploaded
                if (oldImageUrl && oldImageUrl !== imageUrl) {
                    const oldFileName = oldImageUrl.split('/').pop();
                    await supabase.storage.from('stock-images').remove([oldFileName]);
                }

            } catch (error) {
                console.error('Error processing stock image for update:', error);
                throw new Error('Failed to upload stock image for update: ' + error.message);
            }
        } else if (imageFile === null) {
            // If image was explicitly removed by setting to null
            if (oldImageUrl) {
                const oldFileName = oldImageUrl.split('/').pop();
                await supabase.storage.from('stock-images').remove([oldFileName]);
            }
            imageUrl = null;
        } else if (imageFile && imageFile.uri && imageFile.uri.startsWith('http')) {
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
            customization_config: formData.customization_config || null,
            updated_at: new Date().toISOString(),
        };

        let { data: updatedStock, error } = await updateStockRecord(stockToUpdate);

        const isMissingCustomizationConfig = String(error?.message || '').toLowerCase().includes('customization_config')
            && ['PGRST204', '42703'].includes(String(error?.code || '').toUpperCase());

        if (isMissingCustomizationConfig) {
            const fallbackPayload = { ...stockToUpdate };
            delete fallbackPayload.customization_config;
            ({ data: updatedStock, error } = await updateStockRecord(fallbackPayload));
        }

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
            const fileName = stockItem.image_url.split('/').pop();
            const { error: deleteImageError } = await supabase.storage
                .from('stock-images')
                .remove([fileName]);

            if (deleteImageError) {
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
        const res = await fetch(file.uri);
        const blob = await res.blob();
        const fileName = file.name || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(fileName, blob, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type,
            });

        if (uploadError) {
            throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage.from('product-images').getPublicUrl(uploadData.path);
        return { data: { url: publicUrlData.publicUrl } };
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

