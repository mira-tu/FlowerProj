import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/Shop.css';
import { supabase } from '../config/supabase';
import { wishlistAPI } from '../config/api';
import InfoModal from '../components/InfoModal';

const Wishlist = ({ cart, addToCart, products = [] }) => {
    const navigate = useNavigate();
    const [wishlistItems, setWishlistItems] = useState([]);
    const [showPopup, setShowPopup] = useState(false);
    const [user, setUser] = useState(null);
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '', linkTo: null, linkText: '', linkState: null });

    // Fetch user on mount
    useEffect(() => {
        const fetchUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setUser(session?.user ?? null);
        };
        fetchUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });
        return () => subscription.unsubscribe();
    }, []);

    // Filter local storage wishlist against active products
    const filterAndSetWishlist = (rawWishlist) => {
        if (!products || products.length === 0) {
            setWishlistItems(rawWishlist); // fallback if products not loaded yet
            return;
        }

        const validWishlist = rawWishlist.filter(item => {
            return products.some(p => p.id === item.product_id || p.id === item.id || p.name === item.name);
        });

        // Optionally update storage to clean it up automatically
        if (validWishlist.length !== rawWishlist.length && rawWishlist.length > 0) {
            localStorage.setItem('wishlist', JSON.stringify(validWishlist));
        }

        setWishlistItems(validWishlist);
    };

    useEffect(() => {
        if (user) {
            fetchWishlist();
        } else {
            setWishlistItems([]);
        }
    }, [user, products]); // Re-run when products load or user changes

    const fetchWishlist = async () => {
        try {
            const response = await wishlistAPI.getAll();
            if (response.data.success) {
                filterAndSetWishlist(response.data.wishlist);
            }
        } catch (error) {
            console.error('Error fetching wishlist:', error);
        }
    };

    const removeFromWishlist = async (item) => {
        if (!user) return;

        // Optimistic UI update
        const newItems = wishlistItems.filter(i => i.product_id !== item.product_id && i.id !== item.id);
        setWishlistItems(newItems);

        try {
            await wishlistAPI.remove(item.product_id || item.id, user.id);
        } catch (error) {
            console.error("Error removing from wishlist in DB:", error);
        }
    };

    const handleAddToCart = (item) => {
        if (!user) {
            setInfoModal({
                show: true,
                title: 'Login Required',
                message: 'Please login first to add items to your cart.',
                linkTo: '/login',
                linkText: 'Log In'
            });
            return;
        }

        // item from API: { product_id, name, price, image_url }
        // item from local: { name, price, image }
        const productId = item.product_id || item.id;
        addToCart(item.name, item.price, item.image || item.image_url, productId);
        removeFromWishlist(item);
        setShowPopup(true);
        setTimeout(() => setShowPopup(false), 2000);
    };

    return (
        <div style={{ background: '#f8f9fa', minHeight: '100vh', paddingTop: '90px', paddingBottom: '40px' }}>
            <InfoModal
                show={infoModal.show}
                onClose={() => setInfoModal({ show: false, title: '', message: '' })}
                title={infoModal.title}
                message={infoModal.message}
                linkTo={infoModal.linkTo}
                linkText={infoModal.linkText}
                linkState={infoModal.linkState}
            />

            {/* Popup */}
            {showPopup && (
                <div style={{
                    position: 'fixed',
                    top: '100px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)',
                    color: 'white',
                    padding: '14px 28px',
                    borderRadius: '50px',
                    boxShadow: '0 8px 25px rgba(76, 175, 80, 0.4)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    fontWeight: '600',
                    animation: 'slideDown 0.4s ease'
                }}>
                    <i className="fas fa-check-circle me-2"></i>
                    Added to Cart
                </div>
            )}

            <div className="container">
                {/* Header */}
                <div className="d-flex align-items-center justify-content-between mb-4">
                    <div className="d-flex align-items-center">
                        <i className="fas fa-heart me-3" style={{ color: 'var(--shop-pink)', fontSize: '1.5rem' }}></i>
                        <div>
                            <h4 className="fw-bold mb-0">My Wishlist</h4>
                            <small className="text-muted">{wishlistItems.length} {wishlistItems.length === 1 ? 'item' : 'items'}</small>
                        </div>
                    </div>
                    <Link to="/" className="btn btn-outline-secondary btn-sm rounded-pill px-3">
                        <i className="fas fa-arrow-left me-2"></i>Back to Shop
                    </Link>
                </div>

                {wishlistItems.length === 0 ? (
                    <div className="text-center py-5 bg-white rounded-4 shadow-sm">
                        <i className="far fa-heart" style={{ fontSize: '4rem', color: '#ddd' }}></i>
                        <h5 className="mt-4 text-muted">Your wishlist is empty</h5>
                        <p className="text-muted mb-4">Save items you love by tapping the heart icon</p>
                        <Link to="/" className="btn rounded-pill px-4" style={{ background: 'var(--shop-pink)', color: 'white' }}>
                            Explore Products
                        </Link>
                    </div>
                ) : (
                    <div className="bg-white rounded-4 shadow-sm overflow-hidden">
                        {wishlistItems.map((item, index) => (
                            <div
                                key={index}
                                className="d-flex align-items-center p-3"
                                style={{ borderBottom: index < wishlistItems.length - 1 ? '1px solid #eee' : 'none' }}
                            >
                                <img
                                    src={item.image}
                                    alt={item.name}
                                    className="rounded-3"
                                    style={{ width: '80px', height: '80px', objectFit: 'cover' }}
                                    onError={(e) => e.target.src = 'https://via.placeholder.com/80'}
                                />
                                <div className="ms-3 flex-grow-1">
                                    <h6 className="fw-bold mb-1">{item.name}</h6>
                                    <span className="fw-bold" style={{ color: 'var(--shop-pink)', fontSize: '1.1rem' }}>
                                        ₱{item.price?.toLocaleString()}
                                    </span>
                                </div>
                                <div className="d-flex gap-2">
                                    <button
                                        className="btn btn-sm rounded-pill px-3"
                                        style={{ background: '#4caf50', color: 'white', border: 'none' }}
                                        onClick={() => handleAddToCart(item)}
                                    >
                                        <i className="fas fa-cart-plus me-1"></i>Add
                                    </button>
                                    <button
                                        className="btn btn-outline-danger btn-sm rounded-circle d-flex align-items-center justify-content-center"
                                        style={{ width: '36px', height: '36px' }}
                                        onClick={() => removeFromWishlist(item)}
                                        title="Remove"
                                    >
                                        <i className="fas fa-trash-alt" style={{ fontSize: '0.8rem' }}></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Wishlist;
