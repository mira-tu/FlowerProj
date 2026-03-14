import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { decode } from 'base64-arraybuffer';
import {
    groupDeliveryDestinations,
    parseMultiDeliveryNotes,
    serializeMultiDeliveryNotes,
} from '../utils/deliveryDestinations';

const ADMIN_WORKFLOW_FUNCTION = 'manage-admin-workflows';

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
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

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

const updateOrderStatusDirect = async (id, status, options = {}) => {
    const { data: current, error: fetchError } = await supabase
        .from('orders')
        .select('status_timestamps, cancellation_reason')
        .eq('id', id)
        .single();

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

    const { data, error } = await supabase
        .from('orders')
        .update({
            status,
            status_timestamps: nextStatusTimestamps,
            cancellation_reason: status === 'cancelled'
                ? (cancellationReason || current?.cancellation_reason || null)
                : current?.cancellation_reason ?? null,
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return { success: true, order: data };
};

const updateOrderPaymentStatusDirect = async (id, status) => {
    const { data, error } = await supabase
        .from('orders')
        .update({ payment_status: status })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw error;
    }

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

    const { data, error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId)
        .select()
        .single();

    if (error) {
        throw error;
    }

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
        .select('data, user_id, request_number, status_timestamps')
        .eq('id', id)
        .single();

    if (fetchError) {
        throw fetchError;
    }

    const updatePayload = {
        final_price: finalItemPrice + finalShippingFee,
        shipping_fee: finalShippingFee,
        status: 'quoted',
        status_timestamps: withStatusTimestamp(existingRequest?.status_timestamps, 'quoted'),
    };

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

const applyDateRangeToQuery = (query, column, range) => {
    if (!range) {
        return query;
    }

    return query
        .gte(column, range.startIso)
        .lt(column, range.endIso);
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

    if (options?.notification && data?.user_id) {
        const notificationConfig = options.notification;
        const { error: notificationError } = await supabase
            .from('notifications')
            .insert([{
                user_id: data.user_id,
                title: notificationConfig.title || 'Request status updated',
                message: notificationConfig.message || `Your request #${data.request_number || current?.request_number || id} is now ${status}.`,
                type: notificationConfig.type || 'request_update',
                link: notificationConfig.link || '/profile',
            }]);

        if (notificationError) {
            console.error('Failed to send request status notification:', notificationError);
        }
    }

    return { success: true, request: data };
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

// Products API
export const productAPI = {
    getAll: async (params) => {
        let query = supabase
            .from('products')
            .select(`
                id,
                name,
                description,
                price,
                category_id,
                image_url,
                stock_quantity,
                is_active,
                categories ( name )
            `);

        if (!params?.includeInactive) {
            query = query.eq('is_active', true);
        }

        if (params?.category_id) {
            query = query.eq('category_id', parseInt(params.category_id, 10));
        }

        const { data: products, error } = await query;

        if (error) {
            console.error('Error fetching products:', error);
            return { data: { products: [] } };
        }

        const formattedProducts = products.map(p => ({
            ...p,
            category_name: p.categories ? p.categories.name : 'Uncategorized'
        }));

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
            ...product,
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

        const productToInsert = {
            name: formData.name,
            price: parseFloat(formData.price),
            stock_quantity: parseInt(formData.stock_quantity, 10) || 0,
            description: formData.description || '',
            category_id: parseInt(formData.category_id, 10),
            image_url: imageUrl,
            is_active: formData.is_active !== false,
        };

        const { data: newProduct, error } = await supabase
            .from('products')
            .insert(productToInsert)
            .select()
            .single();

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

        const productToUpdate = {
            name: formData.name,
            price: parseFloat(formData.price),
            stock_quantity: parseInt(formData.stock_quantity, 10),
            description: formData.description,
            category_id: parseInt(formData.category_id, 10),
            image_url: imageUrl,
            is_active: formData.is_active !== false,
        };

        Object.keys(productToUpdate).forEach(key => (productToUpdate[key] === undefined || Number.isNaN(productToUpdate[key])) && delete productToUpdate[key]);

        const { data: updatedProduct, error } = await supabase
            .from('products')
            .update(productToUpdate)
            .eq('id', parseInt(id, 10))
            .select()
            .single();

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
    getAll: async (params) => {
        const orders = JSON.parse(await AsyncStorage.getItem('orders') || '[]');
        return { data: orders };
    }
};

// Auth API - using Supabase for real authentication
export const authAPI = {
    adminLogin: async ({ email, password }) => {
        // 1. Sign in with Supabase Auth
        const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (signInError) {
            console.error('Supabase sign-in error:', signInError);
            throw signInError;
        }

        if (!sessionData.user) {
            throw new Error('Login failed: No user data returned.');
        }

        const { user, session } = sessionData;

        // 2. Fetch user profile from 'users' table to check role
        let { data: profile, error: profileError } = await supabase
            .from('users')
            .select('role, name, phone')
            .eq('id', user.id)
            .single();

        if (profileError) {
            console.error('Error fetching user profile:', profileError);

            const fallbackRole = user.user_metadata?.role;
            if (fallbackRole === 'admin' || fallbackRole === 'employee') {
                profile = {
                    role: fallbackRole,
                    name: user.user_metadata?.name || user.email,
                    phone: user.user_metadata?.phone || null,
                };

                const { error: upsertError } = await supabase
                    .from('users')
                    .upsert({
                        id: user.id,
                        name: profile.name,
                        email: user.email,
                        phone: profile.phone,
                        role: fallbackRole,
                    }, { onConflict: 'id' });

                if (upsertError) {
                    console.warn('Non-blocking: failed to restore missing admin/employee profile row:', upsertError);
                }
            } else {
                // Sign out the user as we can't verify their role
                await supabase.auth.signOut();
                throw new Error('Could not verify user role. Your account might not be set up correctly.');
            }
        }

        // 3. Check the role
        if (profile.role !== 'admin' && profile.role !== 'employee') {
            // Sign out the user because they don't have the required role
            await supabase.auth.signOut();
            throw new Error('Access Denied: You do not have permission to access this dashboard.');
        }

        // 4. Combine auth user data with public profile data
        const fullUser = {
            ...user,
            ...profile, // This will add 'role' and 'name' to the user object
        };

        // 5. Return data in the format expected by LoginScreen.js
        return {
            data: {
                token: session.access_token,
                user: fullUser,
            }
        };
    },

    logout: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Error logging out from Supabase:', error);
        }
        // AsyncStorage cleanup will be handled in the component
        return { data: { success: true } };
    },

    changePassword: async (data) => {
        // This would be implemented using supabase.auth.updateUser
        return { data: { success: true, message: 'Password changed successfully' } };
    },

    getMe: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { data: null };

        // Also fetch profile to get role
        const { data: profile } = await supabase
            .from('users')
            .select('role, name')
            .eq('id', user.id)
            .single();

        return { data: { ...user, ...profile } };
    }
};

// Admin API - AsyncStorage-based admin operations
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
                        product_id,
                        quantity,
                        price,
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
            return { data: [] };
        }

        const formattedOrders = orders.map(order => {
            const parsedNotes = parseMultiDeliveryNotes(order.notes);
            const customerName = order.users ? order.users.name : 'N/A';
            const customerEmail = order.users ? order.users.email : 'N/A';
            const customerPhone = order.users ? order.users.phone : 'N/A';

            const items = order.order_items.map(item => ({
                product_id: item.product_id,
                quantity: item.quantity,
                price: item.price,
                name: item.products ? item.products.name : 'Unknown Product',
                image_url: item.products ? item.products.image_url : null,
            }));

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

        return { data: formattedOrders };
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
        const monthRange = getMonthRange(filters?.monthKey);
        let salesQuery = supabase.from('sales').select('total_amount, sale_date');
        salesQuery = applyDateRangeToQuery(salesQuery, 'sale_date', monthRange);

        const { data: sales, error: salesError } = await salesQuery;

        if (salesError) {
            console.error('Error fetching sales:', salesError);
            throw salesError;
        }

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        let totalSales = 0;
        let todaySales = 0;
        let weekSales = 0;
        let monthSales = 0;

        (sales || []).forEach((sale) => {
            const saleDate = new Date(sale.sale_date);
            const saleAmount = parseFloat(sale.total_amount || 0);

            if (!Number.isFinite(saleAmount) || Number.isNaN(saleDate.getTime())) {
                return;
            }

            totalSales += saleAmount;
            if (saleDate >= today) todaySales += saleAmount;
            if (saleDate >= weekAgo) weekSales += saleAmount;
            if (monthRange) {
                monthSales += saleAmount;
            } else if (saleDate >= currentMonthStart) {
                monthSales += saleAmount;
            }
        });

        const { data: stats } = await adminAPI.getStats({ monthKey: monthRange?.key || null });

        let totalOrdersQuery = supabase
            .from('orders')
            .select('*', { count: 'exact', head: true });
        let totalRequestsQuery = supabase
            .from('requests')
            .select('*', { count: 'exact', head: true });

        totalOrdersQuery = applyDateRangeToQuery(totalOrdersQuery, 'created_at', monthRange);
        totalRequestsQuery = applyDateRangeToQuery(totalRequestsQuery, 'created_at', monthRange);

        const { count: totalOrders, error: totalOrdersError } = await totalOrdersQuery;
        if (totalOrdersError) {
            console.error('Error fetching total orders:', totalOrdersError);
            throw totalOrdersError;
        }

        const { count: totalRequests, error: totalRequestsError } = await totalRequestsQuery;
        if (totalRequestsError) {
            console.error('Error fetching total requests:', totalRequestsError);
            throw totalRequestsError;
        }

        return {
            data: {
                totalSales,
                todaySales,
                weekSales,
                monthSales,
                totalOrders: (totalOrders || 0) + (totalRequests || 0),
                completedOrders: (stats?.completedOrders || 0) + (stats?.completedRequests || 0),
                pendingOrders: (stats?.pendingOrders || 0) + (stats?.pendingRequests || 0),
                monthLabel: monthRange?.label || null,
            }
        };
    },

    getSalesChartData: async (period = 'week', monthKey = null) => {
        const monthRange = getMonthRange(monthKey);
        let query = supabase
            .from('sales')
            .select('sale_date, total_amount')
            .order('sale_date', { ascending: true });

        query = applyDateRangeToQuery(query, 'sale_date', period === 'month' ? monthRange : null);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching sales chart data:', error);
            throw error;
        }
        return { data };
    },

    getBestSellingProducts: async (monthKey = null) => {
        const monthRange = getMonthRange(monthKey);
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

        query = applyDateRangeToQuery(query, 'sale_date', monthRange);

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

    getTransactionHistory: async (period = 'all', monthKey = null) => {
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

        const now = new Date();
        const monthRange = getMonthRange(monthKey);
        if (period === 'week') {
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            query = query.gte('sale_date', weekAgo.toISOString());
        } else if (period === 'month') {
            query = applyDateRangeToQuery(query, 'sale_date', monthRange);
        }

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
        const buildRequestsQuery = (includeCancellationReason = true) => supabase
            .from('requests')
            .select(`
                id,
                request_number,
                type,
                status,
                contact_number,
                image_url,
                notes,
                ${includeCancellationReason ? 'cancellation_reason,' : ''}
                data,
                created_at,
                delivery_method,
                pickup_time,
                final_price,
                shipping_fee,
                payment_status,
                receipt_url,
                amount_received,
                additional_receipts,
                assigned_rider,
                users (
                    id,
                    name,
                    email,
                    phone
                )
            `)
            .order('created_at', { ascending: false });

        let { data: requests, error } = await buildRequestsQuery(true);

        if (error?.code === '42703' && String(error?.message || '').includes('requests.cancellation_reason')) {
            console.warn('Requests table is missing the cancellation_reason column; retrying admin request fetch without it.');
            ({ data: requests, error } = await buildRequestsQuery(false));
        }

        if (error) {
            console.error('Supabase query error for requests:', error);
            return { data: { requests: [] } };
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

            // Always prefer the top-level DB column for payment fields (they are updated by admin actions).
            // Only fall back to JSONB 'data' if the top-level column is null/undefined.
            const paymentStatusToUse = req.payment_status !== undefined && req.payment_status !== null ? req.payment_status : requestData?.payment_status;
            const paymentMethodToUse = req.payment_method !== undefined && req.payment_method !== null ? req.payment_method : (requestData?.payment_method || 'gcash');
            const receiptUrlToUse = req.receipt_url !== undefined && req.receipt_url !== null ? req.receipt_url : requestData?.receipt_url;

            const deliveryMethodFromData = requestData?.delivery_method;
            const pickupTimeFromData = requestData?.pickup_time;

            return {
                ...req,
                status: req.status,
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

        return { data: { requests: formattedRequests } };
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
        const requests = JSON.parse(await AsyncStorage.getItem('requests') || '[]');
        const index = requests.findIndex(r => r.id === id);
        if (index !== -1) {
            requests[index].status = 'accepted';
            await AsyncStorage.setItem('requests', JSON.stringify(requests));
        }
        return { data: { success: true } };
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
            return { data: [] };
        }
        return { data: stock };
    },

    createStock: async (formData) => {
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
        };

        const { data: newStock, error } = await supabase
            .from('stock_products')
            .insert([stockToInsert])
            .select()
            .single();

        if (error) {
            console.error('Database insert error for stock:', error);
            throw error;
        }

        return { data: newStock };
    },

    updateStock: async (id, formData) => {
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
            updated_at: new Date().toISOString(),
        };

        const { data: updatedStock, error } = await supabase
            .from('stock_products')
            .update(stockToUpdate)
            .eq('id', id)
            .select()
            .single();

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

