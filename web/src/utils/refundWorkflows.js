import { supabase } from '../config/supabase';

const REFUND_WORKFLOW_FUNCTION = 'manage-admin-workflows';
const ACTIVE_REFUND_STATUSES = ['requested', 'approved', 'gcash_submitted', 'processing'];

export const getRefundStatusLabel = (status) => {
    switch (String(status || '').trim().toLowerCase()) {
        case 'requested':
            return 'Pending Admin Review';
        case 'approved':
            return 'Approved';
        case 'gcash_submitted':
            return 'GCash Details Submitted';
        case 'processing':
            return 'Processing Refund';
        case 'refunded':
            return 'Refunded';
        case 'rejected':
            return 'Rejected';
        default:
            return 'No Refund Request';
    }
};

export const canRequestRefund = ({
    paymentStatus,
    amountPaid = 0,
    fallbackAmount = 0,
    refundRequest,
}) => {
    const normalizedPaymentStatus = String(paymentStatus || '').trim().toLowerCase();
    const hasPayment = Number(amountPaid || 0) > 0
        || (normalizedPaymentStatus === 'paid' && Number(fallbackAmount || 0) > 0);
    const hasActiveRefund = ACTIVE_REFUND_STATUSES.includes(String(refundRequest?.status || '').trim().toLowerCase());
    return hasPayment && !hasActiveRefund;
};

export const maskGcashNumber = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) {
        return 'Not submitted';
    }

    return digits.length <= 4
        ? digits
        : `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};

const getWorkflowErrorMessage = async (error, fallbackMessage) => {
    if (!error) return fallbackMessage;

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
                // fall through to fallback
            }
        }
    }

    if (typeof error.message === 'string' && error.message.trim()) {
        return error.message;
    }

    return fallbackMessage;
};

const shouldFallbackToDirectWorkflow = (error) => {
    const message = String(error?.message || '').toLowerCase();
    const name = String(error?.name || '').toLowerCase();
    const status = Number(error?.status || error?.context?.status || 0);

    return [
        'functionsfetcherror',
        'functionsrelayerror',
        'network request failed',
        'failed to fetch',
        'load failed',
        'fetch',
    ].some((token) => name.includes(token) || message.includes(token))
        || status >= 500;
};

const invokeRefundWorkflow = async (action, payload = {}) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    const { data, error } = await supabase.functions.invoke(REFUND_WORKFLOW_FUNCTION, {
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
        const normalizedError = new Error(
            await getWorkflowErrorMessage(error, `Failed to ${action.replace(/_/g, ' ')}.`),
        );
        normalizedError.name = error?.name || 'Error';
        normalizedError.status = error?.context?.status || error?.status || null;
        normalizedError.context = error?.context;
        throw normalizedError;
    }

    if (data?.error) {
        throw new Error(data.error);
    }

    return data;
};

const notifyUsersByRole = async (roles, notificationFactory) => {
    const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, role')
        .in('role', roles);

    if (usersError || !Array.isArray(users) || !users.length) {
        return;
    }

    const notifications = users
        .map((user) => notificationFactory(user))
        .filter(Boolean);

    if (!notifications.length) {
        return;
    }

    const { error: notificationError } = await supabase
        .from('notifications')
        .insert(notifications);

    if (notificationError) {
        console.error('Failed to create refund notifications:', notificationError);
    }
};

export const getRefundRequestForEntity = async ({ entityType, entityId }) => {
    const query = supabase
        .from('refund_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

    const { data, error } = await (entityType === 'request'
        ? query.eq('request_id', entityId)
        : query.eq('order_id', entityId));

    if (error) {
        if (error.code === '42P01') {
            return null;
        }
        throw error;
    }

    return Array.isArray(data) && data.length ? data[0] : null;
};

const createRefundRequestDirect = async ({
    entityType,
    entityId,
    customerId,
    reason,
    refundAmount,
}) => {
    const insertPayload = {
        entity_type: entityType,
        order_id: entityType === 'order' ? entityId : null,
        request_id: entityType === 'request' ? entityId : null,
        customer_id: customerId,
        status: 'requested',
        customer_reason: reason,
        refund_amount: refundAmount,
        updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
        .from('refund_requests')
        .insert([insertPayload])
        .select()
        .single();

    if (error) {
        throw error;
    }

    await notifyUsersByRole(['admin'], (user) => ({
        user_id: user.id,
        title: 'Refund request submitted',
        message: `A customer requested a refund for ${entityType} #${entityId}.`,
        type: 'refund_request',
        link: '/profile',
    }));

    return { success: true, refundRequest: data };
};

export const createRefundRequest = async ({
    entityType,
    entityId,
    customerId,
    reason,
    refundAmount,
}) => {
    try {
        return await invokeRefundWorkflow('create_refund_request', {
            entityType,
            entityId,
            reason,
            refundAmount,
        });
    } catch (error) {
        if (!shouldFallbackToDirectWorkflow(error)) {
            throw error;
        }

        console.warn('Falling back to direct refund request creation:', error.message);
        return createRefundRequestDirect({
            entityType,
            entityId,
            customerId,
            reason,
            refundAmount,
        });
    }
};

const submitRefundGcashDetailsDirect = async ({
    refundId,
    gcashName,
    gcashNumber,
}) => {
    const normalizedGcashNumber = String(gcashNumber || '').replace(/\D/g, '');
    const { data, error } = await supabase
        .from('refund_requests')
        .update({
            gcash_name: gcashName,
            gcash_number: normalizedGcashNumber,
            status: 'gcash_submitted',
            gcash_submitted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', refundId)
        .select()
        .single();

    if (error) {
        throw error;
    }

    await notifyUsersByRole(['admin', 'employee'], (user) => ({
        user_id: user.id,
        title: 'Refund details submitted',
        message: `Customer GCash details are ready for refund request #${refundId}.`,
        type: 'refund_request',
        link: '/profile',
    }));

    return { success: true, refundRequest: data };
};

export const submitRefundGcashDetails = async ({
    refundId,
    gcashName,
    gcashNumber,
}) => {
    try {
        return await invokeRefundWorkflow('submit_refund_gcash_details', {
            refundId,
            gcashName,
            gcashNumber,
        });
    } catch (error) {
        if (!shouldFallbackToDirectWorkflow(error)) {
            throw error;
        }

        console.warn('Falling back to direct refund GCash submission:', error.message);
        return submitRefundGcashDetailsDirect({
            refundId,
            gcashName,
            gcashNumber,
        });
    }
};
