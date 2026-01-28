// Local storage API - replaces backend API calls
// This file provides localStorage-based implementations of all API methods

// Helper to generate unique IDs
const generateId = () => `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Products API
export const productAPI = {
    getAll: (params) => {
        return new Promise((resolve) => {
            const products = JSON.parse(localStorage.getItem('products') || '[]');
            let filtered = products.filter(p => p.is_available);

            if (params?.category_id) {
                filtered = filtered.filter(p => p.category_id === parseInt(params.category_id));
            }

            resolve({ data: filtered });
        });
    },

    getById: (id) => {
        return new Promise((resolve) => {
            const products = JSON.parse(localStorage.getItem('products') || '[]');
            const product = products.find(p => p.id === parseInt(id));
            resolve({ data: product });
        });
    },

    create: (data) => {
        return new Promise((resolve) => {
            const products = JSON.parse(localStorage.getItem('products') || '[]');
            const newProduct = { ...data, id: Date.now(), is_active: true };
            products.push(newProduct);
            localStorage.setItem('products', JSON.stringify(products));
            resolve({ data: newProduct });
        });
    },

    update: (id, data) => {
        return new Promise((resolve) => {
            const products = JSON.parse(localStorage.getItem('products') || '[]');
            const index = products.findIndex(p => p.id === parseInt(id));
            if (index !== -1) {
                products[index] = { ...products[index], ...data };
                localStorage.setItem('products', JSON.stringify(products));
                resolve({ data: products[index] });
            }
        });
    },

    delete: (id) => {
        return new Promise((resolve) => {
            const products = JSON.parse(localStorage.getItem('products') || '[]');
            const filtered = products.filter(p => p.id !== parseInt(id));
            localStorage.setItem('products', JSON.stringify(filtered));
            resolve({ data: { success: true } });
        });
    }
};

// Categories API
export const categoryAPI = {
    getAll: () => {
        return new Promise((resolve) => {
            const categories = JSON.parse(localStorage.getItem('categories') || '[]');
            resolve({ data: categories.filter(c => c.is_available) });
        });
    }
};

// Wishlist API
export const wishlistAPI = {
    getAll: () => {
        return new Promise((resolve) => {
            const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
            resolve({ data: { success: true, wishlist } });
        });
    },

    add: (productId) => {
        return new Promise((resolve) => {
            const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
            const products = JSON.parse(localStorage.getItem('products') || '[]');
            const product = products.find(p => p.id === productId);

            if (product && !wishlist.find(w => w.product_id === productId)) {
                wishlist.push({ id: Date.now(), product_id: productId, product });
                localStorage.setItem('wishlist', JSON.stringify(wishlist));
            }
            resolve({ data: { success: true } });
        });
    },

    remove: (productId) => {
        return new Promise((resolve) => {
            const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
            const filtered = wishlist.filter(w => w.product_id !== productId);
            localStorage.setItem('wishlist', JSON.stringify(filtered));
            resolve({ data: { success: true } });
        });
    }
};

// Orders API
export const orderAPI = {
    getAll: (params) => {
        return new Promise((resolve) => {
            const orders = JSON.parse(localStorage.getItem('orders') || '[]');
            resolve({ data: orders });
        });
    },

    getById: (id) => {
        return new Promise((resolve) => {
            const orders = JSON.parse(localStorage.getItem('orders') || '[]');
            const order = orders.find(o => o.id === id || o.order_number === id);
            resolve({ data: order });
        });
    },

    create: (data) => {
        return new Promise((resolve) => {
            const orders = JSON.parse(localStorage.getItem('orders') || '[]');
            const orderNumber = `ORD-${Date.now()}`;
            const newOrder = {
                ...data,
                id: Date.now(),
                order_number: orderNumber,
                status: 'pending',
                payment_status: 'to_pay',
                created_at: new Date().toISOString()
            };
            orders.push(newOrder);
            localStorage.setItem('orders', JSON.stringify(orders));
            resolve({ data: newOrder });
        });
    },

    cancel: (id) => {
        return new Promise((resolve) => {
            const orders = JSON.parse(localStorage.getItem('orders') || '[]');
            const index = orders.findIndex(o => o.id === id);
            if (index !== -1) {
                orders[index].status = 'cancelled';
                localStorage.setItem('orders', JSON.stringify(orders));
            }
            resolve({ data: { success: true } });
        });
    }
};

// Requests API (for special orders, bookings, etc.)
export const requestAPI = {
    getAll: () => {
        return new Promise((resolve) => {
            const requests = JSON.parse(localStorage.getItem('requests') || '[]');
            resolve({ data: requests });
        });
    },

    getById: (id) => {
        return new Promise((resolve) => {
            const requests = JSON.parse(localStorage.getItem('requests') || '[]');
            const request = requests.find(r => r.id === id);
            resolve({ data: request });
        });
    },

    create: (data) => {
        return new Promise((resolve) => {
            const requests = JSON.parse(localStorage.getItem('requests') || '[]');
            const requestNumber = `REQ-${Date.now()}`;
            const newRequest = {
                ...data,
                id: Date.now(),
                request_number: requestNumber,
                status: 'pending',
                created_at: new Date().toISOString()
            };
            requests.push(newRequest);
            localStorage.setItem('requests', JSON.stringify(requests));
            resolve({ data: newRequest });
        });
    },

    cancel: (id) => {
        return new Promise((resolve) => {
            const requests = JSON.parse(localStorage.getItem('requests') || '[]');
            const index = requests.findIndex(r => r.id === id);
            if (index !== -1) {
                requests[index].status = 'cancelled';
                localStorage.setItem('requests', JSON.stringify(requests));
            }
            resolve({ data: { success: true } });
        });
    }
};

// Auth API - using localStorage for demo/local mode
export const authAPI = {
    register: (data) => {
        return new Promise((resolve, reject) => {
            const users = JSON.parse(localStorage.getItem('users') || '[]');

            // Check if user already exists
            if (users.find(u => u.email === data.email)) {
                reject({ response: { data: { message: 'Email already exists' } } });
                return;
            }

            const newUser = {
                id: Date.now(),
                ...data,
                role: 'customer',
                created_at: new Date().toISOString()
            };
            users.push(newUser);
            localStorage.setItem('users', JSON.stringify(users));

            // Auto login
            const token = `local-token-${newUser.id}`;
            resolve({ data: { token, user: newUser } });
        });
    },

    login: (data) => {
        return new Promise((resolve, reject) => {
            const users = JSON.parse(localStorage.getItem('users') || '[]');
            const user = users.find(u => u.email === data.email && u.password === data.password);

            if (user) {
                const token = `local-token-${user.id}`;
                resolve({ data: { token, user } });
            } else {
                reject({ response: { data: { message: 'Invalid credentials' } } });
            }
        });
    },

    adminLogin: (data) => {
        return new Promise((resolve, reject) => {
            // For demo: accept any admin login
            const adminUser = {
                id: 1,
                email: data.email,
                name: 'Admin',
                role: 'admin'
            };
            const token = 'local-admin-token';
            resolve({ data: { token, user: adminUser } });
        });
    },

    changePassword: (data) => {
        return new Promise((resolve) => {
            resolve({ data: { success: true, message: 'Password changed successfully' } });
        });
    },

    getMe: () => {
        return new Promise((resolve) => {
            const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
            resolve({ data: user });
        });
    }
};

// Upload API - mock for local development
export const uploadAPI = {
    image: (file) => {
        return new Promise((resolve) => {
            // In a real app, you'd use FileReader to convert to base64 and store
            // For demo, just return a placeholder URL
            const url = `/uploads/local-${Date.now()}.jpg`;
            resolve({ data: { url } });
        });
    }
};

// Admin API - localStorage-based admin operations
export const adminAPI = {
    getAllOrders: (params) => orderAPI.getAll(params),
    getAllRequests: (params) => requestAPI.getAll(params),

    updateOrderStatus: (id, status) => {
        return new Promise((resolve) => {
            const orders = JSON.parse(localStorage.getItem('orders') || '[]');
            const index = orders.findIndex(o => o.id === id);
            if (index !== -1) {
                orders[index].status = status;
                localStorage.setItem('orders', JSON.stringify(orders));
            }
            resolve({ data: { success: true } });
        });
    },

    updatePaymentStatus: (id, payment_status) => {
        return new Promise((resolve) => {
            const orders = JSON.parse(localStorage.getItem('orders') || '[]');
            const index = orders.findIndex(o => o.id === id);
            if (index !== -1) {
                orders[index].payment_status = payment_status;
                localStorage.setItem('orders', JSON.stringify(orders));
            }
            resolve({ data: { success: true } });
        });
    },

    acceptOrder: (id) => {
        return new Promise((resolve) => {
            const orders = JSON.parse(localStorage.getItem('orders') || '[]');
            const index = orders.findIndex(o => o.id === id);
            if (index !== -1) {
                orders[index].status = 'accepted';
                localStorage.setItem('orders', JSON.stringify(orders));
            }
            resolve({ data: { success: true } });
        });
    },

    declineOrder: (id, reason) => {
        return new Promise((resolve) => {
            const orders = JSON.parse(localStorage.getItem('orders') || '[]');
            const index = orders.findIndex(o => o.id === id);
            if (index !== -1) {
                orders[index].status = 'declined';
                orders[index].decline_reason = reason;
                localStorage.setItem('orders', JSON.stringify(orders));
            }
            resolve({ data: { success: true } });
        });
    },

    getSalesSummary: (params) => {
        return new Promise((resolve) => {
            const orders = JSON.parse(localStorage.getItem('orders') || '[]');
            const summary = {
                total_sales: orders.reduce((sum, o) => sum + (o.total || 0), 0),
                total_orders: orders.length,
                pending_orders: orders.filter(o => o.status === 'pending').length
            };
            resolve({ data: summary });
        });
    },

    provideQuote: (id, data) => {
        return new Promise((resolve) => {
            const requests = JSON.parse(localStorage.getItem('requests') || '[]');
            const index = requests.findIndex(r => r.id === id);
            if (index !== -1) {
                requests[index] = { ...requests[index], ...data, status: 'quoted' };
                localStorage.setItem('requests', JSON.stringify(requests));
            }
            resolve({ data: { success: true } });
        });
    },

    acceptRequest: (id) => {
        return new Promise((resolve) => {
            const requests = JSON.parse(localStorage.getItem('requests') || '[]');
            const index = requests.findIndex(r => r.id === id);
            if (index !== -1) {
                requests[index].status = 'accepted';
                localStorage.setItem('requests', JSON.stringify(requests));
            }
            resolve({ data: { success: true } });
        });
    },

    updateRequestStatus: (id, status) => {
        return new Promise((resolve) => {
            const requests = JSON.parse(localStorage.getItem('requests') || '[]');
            const index = requests.findIndex(r => r.id === id);
            if (index !== -1) {
                requests[index].status = status;
                localStorage.setItem('requests', JSON.stringify(requests));
            }
            resolve({ data: { success: true } });
        });
    }
};

// Addresses API
export const addressAPI = {
    getAll: () => {
        return new Promise((resolve) => {
            const addresses = JSON.parse(localStorage.getItem('addresses') || '[]');
            resolve({ data: addresses });
        });
    },

    create: (data) => {
        return new Promise((resolve) => {
            const addresses = JSON.parse(localStorage.getItem('addresses') || '[]');
            const newAddress = { ...data, id: Date.now() };
            addresses.push(newAddress);
            localStorage.setItem('addresses', JSON.stringify(addresses));
            resolve({ data: newAddress });
        });
    },

    update: (id, data) => {
        return new Promise((resolve) => {
            const addresses = JSON.parse(localStorage.getItem('addresses') || '[]');
            const index = addresses.findIndex(a => a.id === id);
            if (index !== -1) {
                addresses[index] = { ...addresses[index], ...data };
                localStorage.setItem('addresses', JSON.stringify(addresses));
                resolve({ data: addresses[index] });
            }
        });
    },

    delete: (id) => {
        return new Promise((resolve) => {
            const addresses = JSON.parse(localStorage.getItem('addresses') || '[]');
            const filtered = addresses.filter(a => a.id !== id);
            localStorage.setItem('addresses', JSON.stringify(filtered));
            resolve({ data: { success: true } });
        });
    },

    setDefault: (id) => {
        return new Promise((resolve) => {
            const addresses = JSON.parse(localStorage.getItem('addresses') || '[]');
            addresses.forEach((addr, index) => {
                addresses[index].is_default = addr.id === id;
            });
            localStorage.setItem('addresses', JSON.stringify(addresses));
            resolve({ data: { success: true } });
        });
    }
};

// Notifications and Messages - mock implementations
export const notificationAPI = {
    getAll: () => Promise.resolve({ data: [] }),
    markAsRead: (id) => Promise.resolve({ data: { success: true } }),
    delete: (id) => Promise.resolve({ data: { success: true } })
};

export const messageAPI = {
    getAll: (params) => Promise.resolve({ data: [] }),
    send: (data) => Promise.resolve({ data: { id: Date.now(), ...data } }),
    markAsRead: (id) => Promise.resolve({ data: { success: true } })
};

// Reviews API
export const reviewAPI = {
    create: (data) => Promise.resolve({ data: { id: Date.now(), ...data } }),
    getByProduct: (productId) => Promise.resolve({ data: [] })
};

// Cart API - using localStorage
export const cartAPI = {
    get: () => {
        return new Promise((resolve) => {
            const cart = JSON.parse(localStorage.getItem('cart') || '[]');
            resolve({ data: cart });
        });
    },

    add: (data) => {
        return new Promise((resolve) => {
            const cart = JSON.parse(localStorage.getItem('cart') || '[]');
            cart.push({ ...data, id: Date.now() });
            localStorage.setItem('cart', JSON.stringify(cart));
            resolve({ data: { success: true } });
        });
    },

    update: (id, data) => {
        return new Promise((resolve) => {
            const cart = JSON.parse(localStorage.getItem('cart') || '[]');
            const index = cart.findIndex(item => item.id === id);
            if (index !== -1) {
                cart[index] = { ...cart[index], ...data };
                localStorage.setItem('cart', JSON.stringify(cart));
            }
            resolve({ data: { success: true } });
        });
    },

    delete: (id) => {
        return new Promise((resolve) => {
            const cart = JSON.parse(localStorage.getItem('cart') || '[]');
            const filtered = cart.filter(item => item.id !== id);
            localStorage.setItem('cart', JSON.stringify(filtered));
            resolve({ data: { success: true } });
        });
    },

    clear: () => {
        return new Promise((resolve) => {
            localStorage.setItem('cart', JSON.stringify([]));
            resolve({ data: { success: true } });
        });
    },

    getCount: () => {
        return new Promise((resolve) => {
            const cart = JSON.parse(localStorage.getItem('cart') || '[]');
            const count = cart.reduce((sum, item) => sum + (item.qty || item.quantity || 1), 0);
            resolve({ data: { count } });
        });
    }
};

import { supabase } from '../config/supabase'; // Import supabase client

// Stock API - fetching from Supabase
export const stockAPI = {
    getAll: async () => {
        try {
            const { data, error } = await supabase
                .from('stock_products') // Assuming your table name is 'stock_products'
                .select('*')
                .eq('is_available', true); // Assuming you only want available stock items

            if (error) throw error;

            // Map data to the format expected by Customized.jsx
            const mappedData = data.map(item => ({
                id: item.id,
                name: item.name,
                category: item.category,
                price: item.price,
                img: item.image_url,
                layerImg: item.image_url,
                stemImg: item.image_url, // Flowers will use this, others can just ignore
                unit: item.unit,
                reorder_level: item.reorder_level,
                is_available: item.is_available,
            }));
            
            
            return { data: mappedData };
        } catch (error) {
            console.error('Error fetching stock items from Supabase:', error.message || error);
            throw error;
        }
    }
};

// Default export for importing as 'api'
export default {
    productAPI,
    categoryAPI,
    wishlistAPI,
    orderAPI,
    requestAPI,
    authAPI,
    uploadAPI,
    adminAPI,
    addressAPI,
    notificationAPI,
    messageAPI,
    reviewAPI,
    cartAPI,
    stockAPI
};
