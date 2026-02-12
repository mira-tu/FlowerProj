import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../styles/Home.css';
// Removed API import - using localStorage instead
import eventImg from '../assets/pictures/EVENTSPECIFIC.jpg';
import customImg from '../assets/pictures/CUSTOMIZED.jpg';
import specialImg from '../assets/pictures/SPECIALORDERPAGE.jpg';
import ProductModal from '../components/ProductModal';

// Import Occasion Images
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



const Home = ({ addToCart, products, categories }) => {
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [wishlist, setWishlist] = useState([]);
    const [showWishlistPopup, setShowWishlistPopup] = useState(false);
    const [popupMessage, setPopupMessage] = useState('');
    const [showCartPopup, setShowCartPopup] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);

    useEffect(() => {
        const savedWishlist = localStorage.getItem('wishlist');
        if (savedWishlist) {
            try {
                setWishlist(JSON.parse(savedWishlist));
            } catch (e) {
                console.error('Error parsing wishlist:', e);
            }
        }
    }, []);

    const handleAddToCart = (product, e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (product.is_active === false) {
            return;
        }
        addToCart(product.name, product.price, product.image_url, product.id);
        setShowCartPopup(true);
        setTimeout(() => setShowCartPopup(false), 2000);
    };

    const toggleWishlist = (product, e) => {
        e.preventDefault();
        e.stopPropagation();

        const isInWishlist = wishlist.some(item => item.name === product.name);
        let newWishlist;

        if (isInWishlist) {
            newWishlist = wishlist.filter(item => item.name !== product.name);
            setPopupMessage('Removed from Wishlist');
        } else {
            newWishlist = [...wishlist, {
                id: product.id,
                product_id: product.id,
                name: product.name,
                price: product.price,
                image: product.image_url
            }];
            setPopupMessage('Added to Wishlist');
        }

        setWishlist(newWishlist);
        localStorage.setItem('wishlist', JSON.stringify(newWishlist));

        setShowWishlistPopup(true);
        setTimeout(() => setShowWishlistPopup(false), 2000);
    };

    const isInWishlist = (productName) => {
        return wishlist.some(item => item.name === productName);
    };
    
    const filteredProducts = products
        .filter(product => product.name && product.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .filter(product => selectedCategory === 'All' || product.category_name === selectedCategory);


    return (
        <div>
            {/* Wishlist Popup */}
            {showWishlistPopup && (
                <div className="wishlist-popup">
                    <i className={`fas fa-heart me-2`}></i>
                    {popupMessage}
                </div>
            )}

            {/* Cart Popup */}
            {showCartPopup && (
                <div className="cart-popup">
                    <i className="fas fa-cart-plus me-2"></i>
                    Item added to Cart
                </div>
            )}

            <div id="heroCarousel" className="carousel slide carousel-fade" data-bs-ride="carousel">
                <div className="carousel-inner">
                    <div className="carousel-item active">
                        <Link to="/book-event">
                            <img src={eventImg} className="d-block w-100" alt="Event Flowers" />
                        </Link>
                        <div className="carousel-caption">
                            <h2>Booking for an Event</h2>
                            <p>Booking early helps us craft your perfect floral experience</p>
                            <Link to="/book-event" className="btn btn-hero">Book Now</Link>
                        </div>
                    </div>
                    <div className="carousel-item">
                        <Link to="/customized">
                            <img src={customImg} className="d-block w-100" alt="Custom Flowers" />
                        </Link>
                        <div className="carousel-caption">
                            <h2>Design Your Own Bouquet</h2>
                            <p>Choose your favorite flowers, colors, and ribbons</p>
                            <Link to="/customized" className="btn btn-hero">Start Customizing</Link>
                        </div>
                    </div>
                    <div className="carousel-item">
                        <Link to="/special-order">
                            <img src={specialImg} className="d-block w-100" alt="Special Orders" />
                        </Link>
                        <div className="carousel-caption">
                            <h2>Special Orders</h2>
                            <p>Add chocolates, teddy bears, and personalized gifts</p>
                            <Link to="/special-order" className="btn btn-hero">Start to Craft</Link>
                        </div>
                    </div>
                </div>
                <button className="carousel-control-prev" type="button" data-bs-target="#heroCarousel" data-bs-slide="prev">
                    <span className="carousel-control-prev-icon" aria-hidden="true"></span>
                    <span className="visually-hidden">Previous</span>
                </button>
                <button className="carousel-control-next" type="button" data-bs-target="#heroCarousel" data-bs-slide="next">
                    <span className="carousel-control-next-icon" aria-hidden="true"></span>
                    <span className="visually-hidden">Next</span>
                </button>
            </div>

            {/* Search and Categories */}
            <div className="container">
                {/* Search Bar */}
                <div className="search-section">
                    <div className="search-wrapper">
                        <i className="fa-solid fa-search search-icon"></i>
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search for flowers..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                className="search-clear"
                                onClick={() => setSearchTerm('')}
                            >
                                <i className="fa-solid fa-times"></i>
                            </button>
                        )}
                    </div>
                </div>

                {/* Category Filters */}
                <div className="category-nav text-center">
                    <button
                        type="button"
                        className={`category-btn ${selectedCategory === 'All' ? 'active' : ''}`}
                        onClick={() => setSelectedCategory('All')}
                    >
                        All
                    </button>
                    {categories.map((category) => (
                        <button
                            key={category.id}
                            type="button"
                            className={`category-btn ${selectedCategory === category.name ? 'active' : ''}`}
                            onClick={() => setSelectedCategory(category.name)}
                        >
                            {category.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Featured Products */}
            <section className="py-5">
                <div className="container">
                    <h2 className="text-center mb-5 fw-bold" style={{ color: 'var(--text-dark)' }}>Featured Collections</h2>
                    <div className="row g-4" id="productList">
                        {filteredProducts.map((product) => (
                            <div key={product.id} className="col-md-3 col-sm-6">
                                <div
                                    className={`product-card ${product.is_active === false ? 'product-card-unavailable' : ''}`}
                                    onClick={() => setSelectedProduct(product)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === 'Enter' && setSelectedProduct(product)}
                                >
                                    <div className="product-img-wrapper">
                                        <img
                                            src={product.image_url}
                                            alt={product.name}
                                            loading="lazy"
                                            decoding="async"
                                            height="250"
                                        />
                                        {product.is_active === false && <div className="unavailable-overlay">Unavailable</div>}
                                        <button
                                            className={`wishlist-heart-btn ${isInWishlist(product.name) ? 'active' : ''}`}
                                            onClick={(e) => toggleWishlist(product, e)}
                                            title={isInWishlist(product.name) ? 'Remove from Wishlist' : 'Add to Wishlist'}
                                        >
                                            <i className={`${isInWishlist(product.name) ? 'fas' : 'far'} fa-heart`}></i>
                                        </button>
                                    </div>
                                    <div className="product-body">
                                        <h5 className="product-title">{product.name}</h5>
                                        <p className="product-price">₱{product.price.toLocaleString()}</p>
                                        {product.description && <p className="product-description">{product.description}</p>}
                                    </div>
                                    <div className="product-body pt-0">
                                        <button
                                            className="btn-add-cart"
                                            onClick={(e) => handleAddToCart(product, e)}
                                            disabled={product.is_active === false}
                                        >
                                            {product.is_active === false ? 'Unavailable' : 'Add to Cart'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <ProductModal
                product={selectedProduct}
                onClose={() => setSelectedProduct(null)}
                onAddToCart={handleAddToCart}
            />
        </div>
    );
};

export default Home;
