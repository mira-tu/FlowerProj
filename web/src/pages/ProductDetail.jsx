import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import '../styles/Shop.css';

import allSouls1 from '../assets/pictures/occasions/ALLSOULSDAY1.png';
import allSouls2 from '../assets/pictures/occasions/ALLSOULSDAY2.png';
import allSouls3 from '../assets/pictures/occasions/ALLSOULSDAY3.png';
import allSouls4 from '../assets/pictures/occasions/ALLSOULSDAY4.png';
import allSouls5 from '../assets/pictures/occasions/ALLSOULSDAY5.png';

import getWell1 from '../assets/pictures/occasions/GETWELLSOON1.png';
import getWell2 from '../assets/pictures/occasions/GETWELLSOON2.png';
import getWell3 from '../assets/pictures/occasions/GETWELLSOON3.png';

import grad1 from '../assets/pictures/occasions/GRADUATION1.png';
import grad2 from '../assets/pictures/occasions/GRADUATION2.png';
import grad3 from '../assets/pictures/occasions/GRADUATION3.png';
import grad4 from '../assets/pictures/occasions/GRADUATION4.png';

import mothers1 from '../assets/pictures/occasions/MOTHERSDAY1.png';
import mothers2 from '../assets/pictures/occasions/MOTHERSDAY2.png';
import mothers3 from '../assets/pictures/occasions/MOTHERSDAY3.png';
import mothers4 from '../assets/pictures/occasions/MOTHERSDAY4.png';
import mothers5 from '../assets/pictures/occasions/MOTHERSDAY5.png';
import mothers6 from '../assets/pictures/occasions/MOTHERSDAY6.png';
import mothers7 from '../assets/pictures/occasions/MOTHERSDAY7.png';
import mothers8 from '../assets/pictures/occasions/MOTHERSDAY8.png';
import mothers9 from '../assets/pictures/occasions/MOTHERSDAY9.png';

import sympathy1 from '../assets/pictures/occasions/SYMPATHY1.png';
import sympathy2 from '../assets/pictures/occasions/SYMPATHY2.png';
import sympathy3 from '../assets/pictures/occasions/SYMPATHY3.png';
import sympathy4 from '../assets/pictures/occasions/SYMPATHY4.png';

import val1 from '../assets/pictures/occasions/VALENTINES1.png';
import val6 from '../assets/pictures/occasions/VALENTINES6.png';
import val7 from '../assets/pictures/occasions/VALENTINES7.png';
import val8 from '../assets/pictures/occasions/VALENTINES8.png';
import val9 from '../assets/pictures/occasions/VALENTINES9.png';

const products = {
    // All Souls Day
    'as1': { id: 'as1', name: 'Peaceful Tribute', price: 1200, originalPrice: 1500, category: 'All Souls Day', image: allSouls1, rating: 4.8, sold: 156, stock: 25 },
    'as2': { id: 'as2', name: 'Eternal Memory', price: 1350, originalPrice: 1600, category: 'All Souls Day', image: allSouls2, rating: 4.7, sold: 120, stock: 20 },
    'as3': { id: 'as3', name: 'Solemn Respect', price: 1500, originalPrice: 1800, category: 'All Souls Day', image: allSouls3, rating: 4.9, sold: 98, stock: 15 },
    'as4': { id: 'as4', name: 'White Remembrance', price: 1600, originalPrice: 1900, category: 'All Souls Day', image: allSouls4, rating: 4.8, sold: 145, stock: 22 },
    'as5': { id: 'as5', name: 'Gentle Peace', price: 1450, originalPrice: 1700, category: 'All Souls Day', image: allSouls5, rating: 4.6, sold: 87, stock: 18 },

    // Get Well Soon
    'gw1': { id: 'gw1', name: 'Sunny Recovery', price: 1300, originalPrice: 1550, category: 'Get Well Soon', image: getWell1, rating: 4.7, sold: 134, stock: 28 },
    'gw2': { id: 'gw2', name: 'Bright Spirits', price: 1250, originalPrice: 1500, category: 'Get Well Soon', image: getWell2, rating: 4.8, sold: 156, stock: 30 },
    'gw3': { id: 'gw3', name: 'Healing Thoughts', price: 1400, originalPrice: 1650, category: 'Get Well Soon', image: getWell3, rating: 4.6, sold: 112, stock: 25 },

    // Graduation
    'gr1': { id: 'gr1', name: 'Victory Bloom', price: 1500, originalPrice: 1800, category: 'Graduation', image: grad1, rating: 4.9, sold: 243, stock: 18 },
    'gr2': { id: 'gr2', name: 'Success Bouquet', price: 1600, originalPrice: 1900, category: 'Graduation', image: grad2, rating: 4.8, sold: 198, stock: 20 },
    'gr3': { id: 'gr3', name: 'Bright Future', price: 1450, originalPrice: 1700, category: 'Graduation', image: grad3, rating: 4.7, sold: 176, stock: 22 },
    'gr4': { id: 'gr4', name: 'Achievement Rose', price: 1550, originalPrice: 1850, category: 'Graduation', image: grad4, rating: 4.9, sold: 234, stock: 16 },

    // Mothers Day
    'md1': { id: 'md1', name: "Mom's Delight", price: 2000, originalPrice: 2400, category: 'Mothers Day', image: mothers1, rating: 5.0, sold: 512, stock: 30 },
    'md2': { id: 'md2', name: 'Queen for a Day', price: 2200, originalPrice: 2600, category: 'Mothers Day', image: mothers2, rating: 4.9, sold: 467, stock: 25 },
    'md3': { id: 'md3', name: 'Sweetest Love', price: 1800, originalPrice: 2200, category: 'Mothers Day', image: mothers3, rating: 4.8, sold: 389, stock: 28 },
    'md4': { id: 'md4', name: 'Elegant Mom', price: 2500, originalPrice: 3000, category: 'Mothers Day', image: mothers4, rating: 5.0, sold: 598, stock: 20 },
    'md5': { id: 'md5', name: 'Pink Appreciation', price: 1900, originalPrice: 2300, category: 'Mothers Day', image: mothers5, rating: 4.7, sold: 345, stock: 32 },
    'md6': { id: 'md6', name: "Mother's Grace", price: 2100, originalPrice: 2500, category: 'Mothers Day', image: mothers6, rating: 4.9, sold: 423, stock: 24 },
    'md7': { id: 'md7', name: 'Loving Heart', price: 2300, originalPrice: 2700, category: 'Mothers Day', image: mothers7, rating: 4.8, sold: 401, stock: 26 },
    'md8': { id: 'md8', name: 'Purest Love', price: 2400, originalPrice: 2900, category: 'Mothers Day', image: mothers8, rating: 5.0, sold: 534, stock: 22 },
    'md9': { id: 'md9', name: 'Forever Mom', price: 2600, originalPrice: 3100, category: 'Mothers Day', image: mothers9, rating: 4.9, sold: 489, stock: 18 },

    // Sympathy
    'sy1': { id: 'sy1', name: 'Deepest Sympathy', price: 1400, originalPrice: 1700, category: 'Sympathy', image: sympathy1, rating: 4.6, sold: 98, stock: 20 },
    'sy2': { id: 'sy2', name: 'Comforting Lilies', price: 1600, originalPrice: 1900, category: 'Sympathy', image: sympathy2, rating: 4.7, sold: 112, stock: 18 },
    'sy3': { id: 'sy3', name: 'Peaceful Rest', price: 1500, originalPrice: 1800, category: 'Sympathy', image: sympathy3, rating: 4.5, sold: 87, stock: 22 },
    'sy4': { id: 'sy4', name: 'In Loving Memory', price: 1700, originalPrice: 2000, category: 'Sympathy', image: sympathy4, rating: 4.8, sold: 134, stock: 16 },

    // Valentines
    'v1': { id: 'v1', name: "Valentine's Passion", price: 2500, originalPrice: 3000, category: 'Valentines', image: val1, rating: 4.7, sold: 389, stock: 15 },
    'v2': { id: 'v2', name: 'Romance Red', price: 2800, originalPrice: 3300, category: 'Valentines', image: val6, rating: 4.9, sold: 456, stock: 12 },
    'v3': { id: 'v3', name: 'Sweetheart Rose', price: 2200, originalPrice: 2700, category: 'Valentines', image: val7, rating: 4.6, sold: 312, stock: 20 },
    'v4': { id: 'v4', name: 'Be Mine', price: 2400, originalPrice: 2900, category: 'Valentines', image: val8, rating: 4.8, sold: 378, stock: 18 },
    'v5': { id: 'v5', name: 'Love Struck', price: 2600, originalPrice: 3100, category: 'Valentines', image: val9, rating: 4.7, sold: 401, stock: 14 },
    'v6': { id: 'v6', name: "Cupid's Arrow", price: 2300, originalPrice: 2800, category: 'Valentines', image: val6, rating: 4.8, sold: 345, stock: 16 },
    'v7': { id: 'v7', name: 'Endless Love', price: 3000, originalPrice: 3500, category: 'Valentines', image: val7, rating: 5.0, sold: 512, stock: 10 },
    'v8': { id: 'v8', name: 'My Valentine', price: 2700, originalPrice: 3200, category: 'Valentines', image: val8, rating: 4.9, sold: 467, stock: 13 },
    'v9': { id: 'v9', name: 'Forever Yours', price: 2900, originalPrice: 3400, category: 'Valentines', image: val9, rating: 4.8, sold: 423, stock: 11 },
};

const reviews = [
    { id: 1, user: 'Maria Santos', avatar: 'https://i.pravatar.cc/100?img=1', rating: 5, date: '2024-01-15', text: 'Absolutely stunning arrangement! The flowers were fresh and beautifully arranged. Perfect for my mothers birthday.' },
    { id: 2, user: 'Juan dela Cruz', avatar: 'https://i.pravatar.cc/100?img=3', rating: 4, date: '2024-01-10', text: 'Great quality flowers. Delivery was on time. Would definitely order again.' },
    { id: 3, user: 'Ana Reyes', avatar: 'https://i.pravatar.cc/100?img=5', rating: 5, date: '2024-01-05', text: 'The bouquet exceeded my expectations! My wife loved it. Thank you Jocerys!' },
];

const ProductDetail = ({ addToCart }) => {
    const { productId } = useParams();
    const navigate = useNavigate();
    const [quantity, setQuantity] = useState(1);
    const [activeTab, setActiveTab] = useState('description');
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadProduct();
    }, [productId]);

    const loadProduct = () => {
        try {
            // First try to get from localStorage products
            const savedProducts = localStorage.getItem('products');
            let productData = null;

            if (savedProducts) {
                const allProducts = JSON.parse(savedProducts);
                // Try to find by ID
                productData = allProducts.find(p => p.id === productId);
            }

            // If not found in localStorage, try local products object
            if (!productData) {
                productData = products[productId];
            }

            // If still not found, use first product as fallback
            if (!productData) {
                productData = Object.values(products)[0] || products['md1'];
            }

            setProduct(productData);
        } catch (error) {
            console.error('Error loading product:', error);
            // Fallback to local products
            const localProduct = products[productId] || products['md1'];
            setProduct(localProduct);
        } finally {
            setLoading(false);
        }
    };

    if (loading || !product) {
        return (
            <div className="product-detail-container">
                <div className="container text-center py-5">
                    <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                </div>
            </div>
        );
    }

    const handleQuantityChange = (change) => {
        const newQty = quantity + change;
        if (newQty >= 1 && newQty <= product.stock) {
            setQuantity(newQty);
        }
    };

    const handleAddToCart = () => {
        for (let i = 0; i < quantity; i++) {
            addToCart(product.name, product.price, product.image, product.id);
        }
        navigate('/cart');
    };

    const handleBuyNow = () => {
        for (let i = 0; i < quantity; i++) {
            addToCart(product.name, product.price, product.image, product.id);
        }
        navigate('/checkout');
    };

    const renderStars = (rating) => {
        return [...Array(5)].map((_, i) => (
            <i key={i} className={`fas fa-star ${i < Math.floor(rating) ? '' : 'text-muted'}`}></i>
        ));
    };

    return (
        <div className="product-detail-container">
            <div className="container">
                <nav aria-label="breadcrumb" className="mb-3">
                    <ol className="breadcrumb">
                        <li className="breadcrumb-item"><Link to="/">Home</Link></li>
                        <li className="breadcrumb-item"><Link to="/">{product.category}</Link></li>
                        <li className="breadcrumb-item active">{product.name}</li>
                    </ol>
                </nav>

                <div className="row">
                    <div className="col-lg-5">
                        <div className="product-detail-card">
                            <div className="product-gallery">
                                <img src={product.image} alt={product.name} className="main-product-image" />
                                <div className="thumbnail-gallery">
                                    <img src={product.image} alt="" className="thumbnail-item active" />
                                    <img src={product.image} alt="" className="thumbnail-item" />
                                    <img src={product.image} alt="" className="thumbnail-item" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="col-lg-7">
                        <div className="product-detail-card">
                            <div className="product-info">
                                <h1>{product.name}</h1>

                                <div className="product-rating">
                                    <span className="rating-stars">{renderStars(product.rating)}</span>
                                    <span className="rating-count">{product.rating} ({reviews.length} reviews)</span>
                                    <span className="sold-count">{product.sold} sold</span>
                                </div>

                                <div className="product-price-box">
                                    <span className="current-price">₱{product.price.toLocaleString()}</span>
                                </div>

                                <div className="quantity-selector">
                                    <span className="option-label mb-0">Quantity</span>
                                    <div className="qty-controls">
                                        <button className="qty-btn" onClick={() => handleQuantityChange(-1)}>-</button>
                                        <input type="text" className="qty-input" value={quantity} readOnly />
                                        <button className="qty-btn" onClick={() => handleQuantityChange(1)}>+</button>
                                    </div>
                                    <span className="stock-info">{product.stock} pieces available</span>
                                </div>

                                <div className="action-buttons">
                                    <button className="btn-add-to-cart" onClick={handleAddToCart}>
                                        <i className="fas fa-cart-plus me-2"></i>Add to Cart
                                    </button>
                                    <button className="btn-buy-now" onClick={handleBuyNow}>
                                        Buy Now
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="product-details-section">
                    <div className="details-tabs">
                        <button
                            className={`detail-tab ${activeTab === 'description' ? 'active' : ''}`}
                            onClick={() => setActiveTab('description')}
                        >
                            Description
                        </button>
                        <button
                            className={`detail-tab ${activeTab === 'reviews' ? 'active' : ''}`}
                            onClick={() => setActiveTab('reviews')}
                        >
                            Reviews ({reviews.length})
                        </button>
                    </div>

                    {activeTab === 'description' && (
                        <div className="description-content">
                            <p>A beautiful hand-crafted floral arrangement perfect for {product.category.toLowerCase()} celebrations. Our expert florists carefully select the freshest blooms to create this stunning masterpiece.</p>
                            <h5 className="mt-4">What's Included:</h5>
                            <ul>
                                <li>Premium fresh flowers</li>
                                <li>Elegant wrapper of your choice</li>
                                <li>Beautiful ribbon finishing</li>
                                <li>Complimentary message card</li>
                                <li>Care instructions</li>
                            </ul>
                            <h5 className="mt-4">Care Tips:</h5>
                            <ul>
                                <li>Keep flowers in a cool area away from direct sunlight</li>
                                <li>Change water every 2-3 days</li>
                                <li>Trim stems at an angle for better water absorption</li>
                            </ul>
                        </div>
                    )}

                    {activeTab === 'reviews' && (
                        <div className="reviews-content">
                            {reviews.map(review => (
                                <div key={review.id} className="review-item">
                                    <div className="review-header">
                                        <img src={review.avatar} alt={review.user} className="review-avatar" />
                                        <div>
                                            <div className="review-username">{review.user}</div>
                                            <div className="review-date">{review.date}</div>
                                        </div>
                                    </div>
                                    <div className="review-stars">{renderStars(review.rating)}</div>
                                    <p className="review-text">{review.text}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductDetail;
