import { supabase } from '../config/supabase'; // Import supabase client

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
                quantity: item.quantity ?? 0, // <-- CRITICAL: stock limit enforcement
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
    wishlistAPI,
    stockAPI
};
