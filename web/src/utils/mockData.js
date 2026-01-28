// Mock data for FlowerProject - extracted from backend database
// This data will be loaded into localStorage/AsyncStorage on first app load

export const initialCategories = [
    {
        id: 1,
        name: 'All Souls Day',
        slug: 'all-souls-day',
        description: 'Flowers for All Souls Day remembrance',
        display_order: 0,
        is_active: true
    },
    {
        id: 2,
        name: 'Get Well Soon',
        slug: 'get-well-soon',
        description: 'Cheerful flowers for recovery',
        display_order: 1,
        is_active: true
    },
    {
        id: 3,
        name: 'Graduation',
        slug: 'graduation',
        description: 'Celebratory flowers for graduation',
        display_order: 2,
        is_active: true
    },
    {
        id: 4,
        name: 'Mothers Day',
        slug: 'mothers-day',
        description: 'Special flowers for Mother\'s Day',
        display_order: 3,
        is_active: true
    },
    {
        id: 5,
        name: 'Sympathy',
        slug: 'sympathy',
        description: 'Flowers expressing condolences',
        display_order: 4,
        is_active: true
    },
    {
        id: 6,
        name: 'Valentines',
        slug: 'valentines',
        description: 'Romantic flowers for Valentine\'s Day',
        display_order: 5,
        is_active: true
    }
];

export const initialProducts = [
    // All Souls Day Products
    { id: 1, name: 'Peaceful Tribute', description: 'A solemn arrangement perfect for All Souls Day remembrance', price: 1200, category_id: 1, image_url: '/uploads/products/ALLSOULSDAY1.png', stock_quantity: 25, is_active: true },
    { id: 2, name: 'Eternal Memory', description: 'White flowers symbolizing eternal peace and memory', price: 1350, category_id: 1, image_url: '/uploads/products/ALLSOULSDAY2.png', stock_quantity: 20, is_active: true },
    { id: 3, name: 'Solemn Respect', description: 'Elegant tribute arrangement for honoring loved ones', price: 1500, category_id: 1, image_url: '/uploads/products/ALLSOULSDAY3.png', stock_quantity: 15, is_active: true },
    { id: 4, name: 'White Remembrance', description: 'Pure white blooms for peaceful remembrance', price: 1600, category_id: 1, image_url: '/uploads/products/ALLSOULSDAY4.png', stock_quantity: 22, is_active: true },
    { id: 5, name: 'Gentle Peace', description: 'Soft arrangement bringing comfort and peace', price: 1450, category_id: 1, image_url: '/uploads/products/ALLSOULSDAY5.png', stock_quantity: 18, is_active: true },

    // Get Well Soon Products
    { id: 6, name: 'Sunny Recovery', description: 'Bright yellow flowers to lift spirits', price: 1300, category_id: 2, image_url: '/uploads/products/GETWELLSOON1.png', stock_quantity: 28, is_active: true },
    { id: 7, name: 'Bright Spirits', description: 'Cheerful blooms for a speedy recovery', price: 1250, category_id: 2, image_url: '/uploads/products/GETWELLSOON2.png', stock_quantity: 30, is_active: true },
    { id: 8, name: 'Healing Thoughts', description: 'Warm arrangement sending healing wishes', price: 1400, category_id: 2, image_url: '/uploads/products/GETWELLSOON3.png', stock_quantity: 25, is_active: true },

    // Graduation Products
    { id: 9, name: 'Victory Bloom', description: 'Celebrate achievement with vibrant flowers', price: 1500, category_id: 3, image_url: '/uploads/products/GRADUATION1.png', stock_quantity: 18, is_active: true },
    { id: 10, name: 'Success Bouquet', description: 'Perfect gift for graduation success', price: 1600, category_id: 3, image_url: '/uploads/products/GRADUATION2.png', stock_quantity: 20, is_active: true },
    { id: 11, name: 'Bright Future', description: 'Colorful arrangement for a bright future ahead', price: 1450, category_id: 3, image_url: '/uploads/products/GRADUATION3.png', stock_quantity: 22, is_active: true },
    { id: 12, name: 'Achievement Rose', description: 'Elegant roses celebrating academic achievement', price: 1550, category_id: 3, image_url: '/uploads/products/GRADUATION4.png', stock_quantity: 16, is_active: true },

    // Mothers Day Products
    { id: 13, name: 'Mom\'s Delight', description: 'Beautiful arrangement to delight any mother', price: 2000, category_id: 4, image_url: '/uploads/products/MOTHERSDAY1.png', stock_quantity: 30, is_active: true },
    { id: 14, name: 'Queen for a Day', description: 'Make mom feel like royalty', price: 2200, category_id: 4, image_url: '/uploads/products/MOTHERSDAY2.png', stock_quantity: 25, is_active: true },
    { id: 15, name: 'Sweetest Love', description: 'Sweet blooms expressing pure love', price: 1800, category_id: 4, image_url: '/uploads/products/MOTHERSDAY3.png', stock_quantity: 28, is_active: true },
    { id: 16, name: 'Elegant Mom', description: 'Sophisticated arrangement for an elegant mother', price: 2500, category_id: 4, image_url: '/uploads/products/MOTHERSDAY4.png', stock_quantity: 20, is_active: true },
    { id: 17, name: 'Pink Appreciation', description: 'Pink flowers showing appreciation and love', price: 1900, category_id: 4, image_url: '/uploads/products/MOTHERSDAY5.png', stock_quantity: 32, is_active: true },
    { id: 18, name: 'Mother\'s Grace', description: 'Graceful blooms honoring mothers', price: 2100, category_id: 4, image_url: '/uploads/products/MOTHERSDAY6.png', stock_quantity: 24, is_active: true },
    { id: 19, name: 'Loving Heart', description: 'Heart-shaped arrangement full of love', price: 2300, category_id: 4, image_url: '/uploads/products/MOTHERSDAY7.png', stock_quantity: 26, is_active: true },
    { id: 20, name: 'Purest Love', description: 'Pure white and pink expressing deepest love', price: 2400, category_id: 4, image_url: '/uploads/products/MOTHERSDAY8.png', stock_quantity: 22, is_active: true },
    { id: 21, name: 'Forever Mom', description: 'Timeless arrangement for eternal gratitude', price: 2600, category_id: 4, image_url: '/uploads/products/MOTHERSDAY9.png', stock_quantity: 18, is_active: true },

    // Sympathy Products
    { id: 22, name: 'Deepest Sympathy', description: 'Expressing heartfelt condolences', price: 1400, category_id: 5, image_url: '/uploads/products/SYMPATHY1.png', stock_quantity: 20, is_active: true },
    { id: 23, name: 'Comforting Lilies', description: 'White lilies bringing comfort in difficult times', price: 1600, category_id: 5, image_url: '/uploads/products/SYMPATHY2.png', stock_quantity: 18, is_active: true },
    { id: 24, name: 'Peaceful Rest', description: 'Serene arrangement for peaceful remembrance', price: 1500, category_id: 5, image_url: '/uploads/products/SYMPATHY3.png', stock_quantity: 22, is_active: true },
    { id: 25, name: 'In Loving Memory', description: 'Honoring cherished memories', price: 1700, category_id: 5, image_url: '/uploads/products/SYMPATHY4.png', stock_quantity: 16, is_active: true },

    // Valentines Products
    { id: 26, name: 'Valentine\'s Passion', description: 'Passionate red roses for your valentine', price: 2500, category_id: 6, image_url: '/uploads/products/VALENTINES1.png', stock_quantity: 15, is_active: true },
    { id: 27, name: 'Romance Red', description: 'Classic red roses expressing romance', price: 2800, category_id: 6, image_url: '/uploads/products/VALENTINES6.png', stock_quantity: 12, is_active: true },
    { id: 28, name: 'Sweetheart Rose', description: 'Sweet pink roses for your sweetheart', price: 2200, category_id: 6, image_url: '/uploads/products/VALENTINES7.png', stock_quantity: 20, is_active: true },
    { id: 29, name: 'Be Mine', description: 'Romantic arrangement saying "Be Mine"', price: 2400, category_id: 6, image_url: '/uploads/products/VALENTINES8.png', stock_quantity: 18, is_active: true },
    { id: 30, name: 'Love Struck', description: 'Stunning blooms for those love struck', price: 2600, category_id: 6, image_url: '/uploads/products/VALENTINES9.png', stock_quantity: 14, is_active: true },
    { id: 31, name: 'Cupid\'s Arrow', description: 'Hit by Cupid\'s arrow of love', price: 2300, category_id: 6, image_url: '/uploads/products/VALENTINES6.png', stock_quantity: 16, is_active: true },
    { id: 32, name: 'Endless Love', description: 'Premium arrangement for endless love', price: 3000, category_id: 6, image_url: '/uploads/products/VALENTINES7.png', stock_quantity: 10, is_active: true },
    { id: 33, name: 'My Valentine', description: 'Perfect gift for your one and only', price: 2700, category_id: 6, image_url: '/uploads/products/VALENTINES8.png', stock_quantity: 13, is_active: true },
    { id: 34, name: 'Forever Yours', description: 'Declaring forever commitment', price: 2900, category_id: 6, image_url: '/uploads/products/VALENTINES9.png', stock_quantity: 11, is_active: true }
];

export const initialStock = [
    { id: 1, name: 'Red Satin Ribbon', category: 'Ribbons', quantity: 50, price: 25.00, unit: 'meters', reorder_level: 10, is_available: true },
    { id: 2, name: 'Gold Foil Wrapper', category: 'Wrappers', quantity: 100, price: 15.00, unit: 'pieces', reorder_level: 20, is_available: true },
    { id: 3, name: 'Fresh Red Roses', category: 'Flowers', quantity: 200, price: 50.00, unit: 'stems', reorder_level: 50, is_available: true },
    { id: 4, name: 'Blue Organza Ribbon', category: 'Ribbons', quantity: 30, price: 30.00, unit: 'meters', reorder_level: 10, is_available: true },
    { id: 5, name: 'Clear Cellophane', category: 'Wrappers', quantity: 75, price: 20.00, unit: 'sheets', reorder_level: 15, is_available: true },
    { id: 6, name: 'White Lilies', category: 'Flowers', quantity: 150, price: 45.00, unit: 'stems', reorder_level: 40, is_available: true },
    { id: 7, name: 'Pink Ribbon', category: 'Ribbons', quantity: 40, price: 28.00, unit: 'meters', reorder_level: 10, is_available: true },
    { id: 8, name: 'Brown Kraft Paper', category: 'Wrappers', quantity: 60, price: 12.00, unit: 'sheets', reorder_level: 15, is_available: true }
];

// Helper function to initialize localStorage with mock data
export function initializeLocalStorage() {
    // Only initialize if data doesn't exist
    if (!localStorage.getItem('products')) {
        localStorage.setItem('products', JSON.stringify(initialProducts));
    }
    if (!localStorage.getItem('categories')) {
        localStorage.setItem('categories', JSON.stringify(initialCategories));
    }
    if (!localStorage.getItem('stock')) {
        localStorage.setItem('stock', JSON.stringify(initialStock));
    }

    // Initialize empty arrays for other data
    if (!localStorage.getItem('cart')) {
        localStorage.setItem('cart', JSON.stringify([]));
    }
    if (!localStorage.getItem('orders')) {
        localStorage.setItem('orders', JSON.stringify([]));
    }
    if (!localStorage.getItem('wishlist')) {
        localStorage.setItem('wishlist', JSON.stringify([]));
    }
    if (!localStorage.getItem('addresses')) {
        localStorage.setItem('addresses', JSON.stringify([]));
    }
}
