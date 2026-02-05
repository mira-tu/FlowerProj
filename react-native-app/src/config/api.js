import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { decode } from 'base64-arraybuffer';

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
            `)
            .eq('is_active', true);

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
        
        console.log('=== CREATE PRODUCT DEBUG ===');
        console.log('imageFile type:', typeof imageFile);
        console.log('imageFile:', imageFile);

        if (imageFile && imageFile.base64) {
            try {
                const fileName = imageFile.fileName || `product-${Date.now()}.jpg`;
                // The expo-image-picker result includes mimeType.
                const contentType = imageFile.mimeType || 'image/jpeg';
                
                console.log(`Uploading ${fileName} with contentType: ${contentType}`);

                // Decode base64 to ArrayBuffer, which is more reliable for uploads.
                const arrayBuffer = decode(imageFile.base64);
                
                // Upload to Supabase Storage
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
                
                console.log('Upload successful, path:', uploadData.path);
                
                // Get public URL
                const { data: publicUrlData } = supabase.storage
                    .from('product-images')
                    .getPublicUrl(uploadData.path);
                
                imageUrl = publicUrlData.publicUrl;
                console.log('Public URL generated:', imageUrl);
                
            } catch (error) {
                console.error('Error processing image:', error);
                throw new Error('Failed to upload image: ' + error.message);
            }
        } else {
            console.log('No image file with base64 data provided.');
        }

        // Prepare product data
        const productToInsert = {
            name: formData.name,
            price: parseFloat(formData.price),
            stock_quantity: parseInt(formData.stock_quantity, 10) || 0,
            description: formData.description || '',
            category_id: parseInt(formData.category_id, 10),
            image_url: imageUrl,
            is_active: true,
        };

        console.log('Inserting product to database:', productToInsert);

        // Insert into database
        const { data: newProduct, error } = await supabase
            .from('products')
            .insert(productToInsert)
            .select()
            .single();

        if (error) {
            console.error('Database insert error:', error);
            throw error;
        }

        console.log('Product created successfully:', newProduct);
        console.log('=== END CREATE PRODUCT DEBUG ===');

        return { data: newProduct };
    },

    update: async function(id, formData) {
        let imageUrl = formData.image_url_hidden;
        const imageFile = formData.image;
        console.log('productAPI.update: existing imageUrl (hidden):', imageUrl);
        console.log('productAPI.update: imageFile from formData (full object):', imageFile);

        // If a new image is picked, it will have base64 data.
        if (imageFile && imageFile.base64) {
            try {
                const fileName = imageFile.fileName || `${Date.now()}.jpg`;
                const contentType = imageFile.mimeType || 'image/jpeg';
                const arrayBuffer = decode(imageFile.base64);

                console.log(`Uploading new image for update: ${fileName}`);

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
            // This is the case where no new image was selected, so we keep the old one.
            imageUrl = imageFile.uri;
        }

        const productToUpdate = {
            name: formData.name,
            price: parseFloat(formData.price),
            stock_quantity: parseInt(formData.stock_quantity, 10),
            description: formData.description,
            category_id: parseInt(formData.category_id, 10),
            image_url: imageUrl,
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
    }
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
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('role, name')
            .eq('id', user.id)
            .single();

        if (profileError) {
            console.error('Error fetching user profile:', profileError);
            // Sign out the user as we can't verify their role
            await supabase.auth.signOut();
            throw new Error('Could not verify user role. Your account might not be set up correctly.');
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
                pickup_time,
                total,
                subtotal,
                shipping_fee,
                delivery_method,
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
                )
            `)
            .order('created_at', { ascending: false });

        if (params?.status) {
            query = query.eq('status', params.status);
        }

        const { data: orders, error } = await query;

        if (error) {
            console.error('Supabase query error for orders:', error);
            return { data: [] };
        }

        const formattedOrders = orders.map(order => {
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
                const { street, city, province, zip } = order.shipping_address;
                shippingAddressDescription = [street, city, province, zip].filter(Boolean).join(', ');
            }

            return {
                ...order,
                customer_name: customerName,
                customer_email: customerEmail,
                customer_phone: customerPhone,
                items: items,
                order_items: undefined, // Remove the raw order_items object
                shipping_address: order.shipping_address ? { // Reconstruct shipping_address to add description
                    ...order.shipping_address,
                    description: shippingAddressDescription
                } : null,
            };
        });

        return { data: formattedOrders };
    },

    updateOrderStatus: async (id, status) => {
        const { data, error } = await supabase
            .from('orders')
            .update({ status: status })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating order status:', error);
            throw error;
        }
        return { data: { success: true, order: data } };
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
        const { data, error } = await supabase
            .from('orders')
            .update({ payment_status: status })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating order payment status:', error);
            throw error;
        }
        return { data: { success: true, order: data } };
    },

    /** For GCash: admin verifies amount received; updates payment_status and amount_paid. */
    updateOrderPaymentVerified: async (id, { payment_status, amount_paid }) => {
        const payload = { payment_status };
        if (amount_paid != null && !isNaN(amount_paid)) payload.amount_paid = parseFloat(amount_paid);
        const { data, error } = await supabase
            .from('orders')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating order payment verified:', error);
            throw error;
        }
        return { data: { success: true, order: data } };
    },

    acceptOrder: async (id, status) => {
        const { data, error } = await supabase
            .from('orders')
            .update({ status: status })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error accepting order:', error);
            throw error;
        }
        return { data: { success: true, order: data } };
    },

    declineOrder: async (id, status) => {
        const { data, error } = await supabase
            .from('orders')
            .update({ status: status })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error declining order:', error);
            throw error;
        }
        return { data: { success: true, order: data } };
    },

    assignRider: async (orderId, riderId) => {
        const { data, error } = await supabase
            .from('orders')
            .update({ assigned_rider: riderId })
            .eq('id', orderId)
            .select()
            .single();

        if (error) {
            console.error('Error assigning rider:', error);
            throw error;
        }
        return { data: { success: true, order: data } };
    },

    getStats: async () => {
        const { count: completedOrders, error: completedOrdersError } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .in('status', ['completed', 'claimed']);

        const { count: pendingOrders, error: pendingOrdersError } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        const { count: completedRequests, error: completedRequestsError } = await supabase
            .from('requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'completed');
            
        const { count: pendingRequests, error: pendingRequestsError } = await supabase
            .from('requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        if(completedOrdersError || pendingOrdersError || completedRequestsError || pendingRequestsError) {
            console.error({completedOrdersError, pendingOrdersError, completedRequestsError, pendingRequestsError});
            throw new Error("Could not fetch stats");
        }

        return { data: { 
            completedOrders: completedOrders || 0,
            pendingOrders: pendingOrders || 0,
            completedRequests: completedRequests || 0,
            pendingRequests: pendingRequests || 0,
        } };
    },



    getSalesSummary: async () => {
        console.log("Fetching sales summary...");

        // 1. Calculate sales figures from `sales` table
        const { data: sales, error: salesError } = await supabase.from('sales').select('total_amount, sale_date');
        
        console.log("Sales data from Supabase:", sales);
        console.log("Error from Supabase:", salesError);

        if (salesError) {
            console.error("Error fetching sales:", salesError);
            throw salesError;
        }
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        let totalSales = 0, todaySales = 0, weekSales = 0, monthSales = 0;

        console.log(`Found ${sales ? sales.length : 0} sales records to process.`);

        (sales || []).forEach((sale, index) => {
            const saleDate = new Date(sale.sale_date);
            const saleAmount = parseFloat(sale.total_amount || 0);

            console.log(`Processing sale #${index + 1}: Amount=${saleAmount}, Date=${saleDate}`);

            if (!isNaN(saleAmount) && saleDate.getTime()) {
                totalSales += saleAmount;
                if (saleDate >= today) todaySales += saleAmount;
                if (saleDate >= new Date(weekAgo)) weekSales += saleAmount;
                if (saleDate >= new Date(monthAgo)) monthSales += saleAmount;
            } else {
                console.warn(`Skipping invalid sale record:`, sale);
            }
        });

        console.log("Calculated sales:", { totalSales, todaySales, weekSales, monthSales });

        // 2. Get other stats for other cards
        const { data: stats, error: statsError } = await adminAPI.getStats();
        if(statsError) {
            console.error("Error fetching stats:", statsError);
            throw statsError;
        }

        const { count: totalOrders, error: totalOrdersError } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true });
        if (totalOrdersError) {
            console.error("Error fetching total orders:", totalOrdersError);
            throw totalOrdersError;
        }
        
        const { count: totalRequests, error: totalRequestsError } = await supabase
            .from('requests')
            .select('*', { count: 'exact', head: true });
        if (totalRequestsError) {
            console.error("Error fetching total requests:", totalRequestsError);
            throw totalRequestsError;
        }

        const summary = {
            totalSales,
            todaySales,
            weekSales,
            monthSales,
            totalOrders: (totalOrders || 0) + (totalRequests || 0),
            completedOrders: stats.completedOrders + stats.completedRequests,
            pendingOrders: stats.pendingOrders + stats.pendingRequests,
        };

        console.log("Returning final summary:", summary);

        // 3. Combine and return
        return { data: summary };
    },

    getSalesChartData: async () => {
        const { data, error } = await supabase
            .from('sales')
            .select('sale_date, total_amount')
            .order('sale_date', { ascending: true });

        if (error) {
            console.error('Error fetching sales chart data:', error);
            throw error;
        }
        return { data };
    },


    getAllRequests: async (params) => {
        let query = supabase
            .from('requests')
            .select(`
                id,
                request_number,
                type,
                status,
                contact_number,
                image_url,
                notes,
                data,
                created_at,
                delivery_method,
                pickup_time,
                final_price,
                shipping_fee,
                payment_status,
                receipt_url,
                assigned_rider,
                users (
                    id,
                    name,
                    email,
                    phone
                )
            `)
            .order('created_at', { ascending: false });

        const { data: requests, error } = await query;

        if (error) {
            console.error('Supabase query error for requests:', error);
            return { data: { requests: [] } };
        }

        const formattedRequests = requests.map(req => {
            const userData = req.users || {};

            let paymentStatusToUse = req.payment_status; // Default to top-level
            let paymentMethodToUse = req.payment_method; // Default to top-level
            let receiptUrlToUse = req.receipt_url;     // Default to top-level

            let requestData = req.data;
            if (typeof requestData === 'string') {
                try {
                    requestData = JSON.parse(requestData);
                } catch (e) {
                    console.error("Failed to parse request.data in adminAPI.getAllRequests:", e);
                    requestData = {};
                }
            }
            
            // If it's a customized request, prioritize fields from the 'data' JSONB
            if (req.type === 'customized' && requestData) {
                paymentStatusToUse = requestData.payment_status !== undefined ? requestData.payment_status : paymentStatusToUse;
                paymentMethodToUse = requestData.payment_method !== undefined ? requestData.payment_method : paymentMethodToUse;
                receiptUrlToUse = requestData.receipt_url !== undefined ? requestData.receipt_url : receiptUrlToUse;
            }
            const amountPaid = parseFloat(requestData?.amount_paid ?? req.amount_paid ?? 0);
            const totalAmount = parseFloat(req.final_price || 0);
            const remainingBalance = Math.max(0, totalAmount - amountPaid);
            // For other types like 'booking' or 'special_order', if they also happen to store these in data
            // (even if there are top-level columns), this ensures `data` takes precedence if present.
            // If they are only top-level, paymentStatusToUse, paymentMethodToUse, receiptUrlToUse remain `req.payment_status`, etc.

            const deliveryMethodFromData = requestData?.delivery_method;
            const pickupTimeFromData = requestData?.pickup_time;

            return {
                ...req,
                status: req.status === 'accepted' ? 'processing' : req.status,
                payment_status: paymentStatusToUse,
                payment_method: paymentMethodToUse,
                receipt_url: receiptUrlToUse,
                delivery_method: deliveryMethodFromData || req.delivery_method,
                pickup_time: pickupTimeFromData || req.pickup_time,
                amount_paid: amountPaid,
                total_amount: totalAmount,
                remaining_balance: remainingBalance,
                user_name: userData.name,
                user_email: userData.email,
                user_phone: userData.phone,
                users: userData,
                data: requestData,
            };
        });

        return { data: { requests: formattedRequests } };
    },

    provideQuote: async (id, price) => {
        const { data: request, error } = await supabase
            .from('requests')
            .update({ 
                final_price: price,
                status: 'quoted' 
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error providing quote:', error);
            throw error;
        }
        
        // Send notification to the user who made the request
        if (request && request.user_id) {
            const notification = {
                user_id: request.user_id,
                title: `You have a new quote!`,
                message: `A quote of ₱${parseFloat(price).toFixed(2)} has been provided for your request #${request.request_number}. Please review and accept it.`,
                type: 'request_update',
                link: '/profile' // Changed to '/profile' as requested
            };

            const { error: notificationError } = await supabase
                .from('notifications')
                .insert([notification]);
            
            if (notificationError) {
                // Log the error but don't fail the whole operation
                console.error("Failed to send quote notification:", notificationError);
            }
        }

        return { data: { success: true, request: request } };
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

    updateRequestStatus: async (id, status) => {
        const { data, error } = await supabase
            .from('requests')
            .update({ status: status })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating request status:', error);
            throw error;
        }
        return { data: { success: true, request: data } };
    },

    updateRequestPaymentStatus: async (requestToUpdate, newStatus, amountVerified) => {
        const requestId = requestToUpdate.id;
        const requestType = requestToUpdate.type;

        if (requestType === 'customized') {
            // Logic for customized requests (update within data JSONB)
            // First, fetch the current request to get its 'data' JSONB object
            const { data: currentRequest, error: fetchError } = await supabase
                .from('requests')
                .select('data')
                .eq('id', requestId)
                .single();

            if (fetchError) {
                console.error('Error fetching request for payment status update:', fetchError);
                throw fetchError;
            }

            let requestData = currentRequest.data;
            if (typeof requestData === 'string') {
                try {
                    requestData = JSON.parse(requestData);
                } catch (e) {
                    console.error("Failed to parse request.data during payment status update:", e);
                    requestData = {};
                }
            }
            
            // Update the payment_status within the data JSONB object (optionally amount_paid when admin verifies receipt)
            const updatedData = {
                ...requestData,
                payment_status: newStatus,
            };
            if (amountVerified != null && !isNaN(amountVerified)) {
                updatedData.amount_paid = parseFloat(amountVerified);
            }

            const { data, error } = await supabase
                .from('requests')
                .update({ data: updatedData }) // Update the entire data JSONB column
                .eq('id', requestId)
                .select()
                .single();

            if (error) {
                console.error('Error updating request payment status:', error);
                throw error;
            }
            return { data: { success: true, request: data } };
        } else {
            // Logic for booking and special_order requests (update top-level payment_status)
            const { data, error } = await supabase
                .from('requests')
                .update({ payment_status: newStatus })
                .eq('id', requestId)
                .select()
                .single();

            if (error) {
                console.error('Error updating top-level payment status:', error);
                throw error;
            }
            return { data: { success: true, request: data } };
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
    },

    getAllMessages: async () => {
        return { data: [] };
    },

    sendMessage: async (data) => {
        return { data: { id: Date.now(), ...data } };
    },

    getAllNotifications: async () => {
        return { data: [] };
    },

    sendNotification: async (notificationData) => {
        // If a specific user_id is provided, send to that user.
        if (notificationData.user_id) {
            const { data, error } = await supabase
                .from('notifications')
                .insert([notificationData])
                .select()
                .single();

            if (error) {
                console.error('Error sending single notification:', error);
                throw error;
            }
            return { data };
        }
        
        // If no user_id, it's a broadcast to all customers.
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id')
            .eq('role', 'customer');

        if (usersError) {
            console.error('Error fetching users for broadcast:', usersError);
            throw usersError;
        }

        if (!users || users.length === 0) {
            return { data: { success: true, message: "No customers to notify." } };
        }

        const notifications = users.map(user => ({
            user_id: user.id,
            title: notificationData.title,
            message: notificationData.message,
            link: notificationData.link || null,
            type: 'broadcast',
        }));

        const { data, error } = await supabase
            .from('notifications')
            .insert(notifications)
            .select();

        if (error) {
            console.error('Error sending broadcast notifications:', error);
            throw error;
        }

        return { data: { success: true, count: data ? data.length : 0 } };
    },

    deleteNotification: async (id) => {
        return { data: { success: true } };
    },

    getAbout: async () => {
        return { data: { title: 'About Us', description: 'FlowerForge' } };
    },

    updateAbout: async (data) => {
        return { data: { success: true } };
    },

    getContact: async () => {
        return { data: { phone: '+63 912 345 6789', email: 'info@flowerforge.com' } };
    },

    updateContact: async (data) => {
        return { data: { success: true } };
    },

    getEmployees: async () => {
        return { data: [] };
    },

    addEmployee: async (data) => {
        return { data: { id: Date.now(), ...data } };
    },

    deleteEmployee: async (id) => {
        return { data: { success: true } };
    },

    getAllConversations: async () => {
        const adminId = (await authAPI.getMe())?.data?.id;
        if (!adminId) return { data: [] };

        const { data: messages, error } = await supabase
            .from('messages')
            .select(`
                *,
                sender:sender_id(id, name, email),
                receiver:receiver_id(id, name, email)
            `)
            .or(`sender_id.eq.${adminId},receiver_id.eq.${adminId}`)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching all messages:', error);
            return { data: [] };
        }

        const conversations = new Map();
        messages.forEach(message => {
            const otherUser = message.sender_id === adminId ? message.receiver : message.sender;
            if (!otherUser) return;

            if (!conversations.has(otherUser.id)) {
                conversations.set(otherUser.id, {
                    user: otherUser,
                    lastMessage: message.message,
                    timestamp: message.created_at,
                });
            }
        });

        const sortedConversations = Array.from(conversations.values())
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
        return { data: sortedConversations };
    },

    getMessagesWithUser: async (userId) => {
        const adminId = (await authAPI.getMe())?.data?.id;
        if (!adminId) return { data: [] };

        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${adminId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${adminId})`)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching messages:', error);
            return { data: [] };
        }
        return { data };
    },

    sendMessage: async (receiverId, messageText) => {
        const adminId = (await authAPI.getMe())?.data?.id;
        if (!adminId) return { error: { message: "Not logged in" } };

        const message = {
            sender_id: adminId,
            receiver_id: receiverId,
            message: messageText,
        };

        const { data, error } = await supabase.from('messages').insert([message]).select().single();
        
        if (error) {
            console.error('Error sending message:', error);
            return { error };
        }
        return { data };
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
