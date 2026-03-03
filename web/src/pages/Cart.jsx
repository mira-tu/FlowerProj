import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/Shop.css';

const Cart = ({ cart, updateCartItem, removeFromCart }) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('products');
    const [cartItems, setCartItems] = useState([]);
    const [customizedItems, setCustomizedItems] = useState([]);
    const [bookingItems, setBookingItems] = useState([]);

    // Load main products cart
    useEffect(() => {
        if (cart) {
            setCartItems(prevCartItems => {
                const existingSelection = {};
                prevCartItems.forEach(item => { existingSelection[item.id] = item.selected; });

                const savedSelectionStr = localStorage.getItem('cartSelection');
                const savedSelection = savedSelectionStr ? JSON.parse(savedSelectionStr) : {};

                return cart.map((item, index) => {
                    const itemId = item.id || item.productId || `local-${index}`;
                    let isSelected = true;
                    if (existingSelection[itemId] !== undefined) {
                        isSelected = existingSelection[itemId];
                    } else if (savedSelection[itemId] !== undefined) {
                        isSelected = savedSelection[itemId];
                    }
                    return { ...item, id: itemId, selected: isSelected, qty: item.qty || 1, stockQuantity: item.stockQuantity || null };
                });
            });
        }
    }, [cart]);

    // Load customized bouquets cart
    useEffect(() => {
        const savedCustomized = localStorage.getItem('customizedCart');
        if (savedCustomized) {
            try {
                const parsed = JSON.parse(savedCustomized);
                setCustomizedItems(Array.isArray(parsed) ? parsed.map((item, idx) => ({ ...item, listId: `cust-${idx}`, selected: true })) : []);
            } catch (e) {
                console.error("Failed to parse customized cart", e);
            }
        }
    }, []);

    // Load custom order (booking) cart
    useEffect(() => {
        const savedBookings = localStorage.getItem('bookingCart');
        if (savedBookings) {
            try {
                const parsed = JSON.parse(savedBookings);
                setBookingItems(Array.isArray(parsed) ? parsed.map((item, idx) => ({ ...item, listId: `book-${idx}`, selected: true })) : []);
            } catch (e) {
                console.error("Failed to parse booking cart", e);
            }
        }
    }, []);

    const toggleSelect = (id, type = 'product') => {
        if (type === 'product') {
            setCartItems(prevItems => {
                const newItems = prevItems.map(item => item.id === id ? { ...item, selected: !item.selected } : item);
                const selectionMap = {};
                newItems.forEach(item => { selectionMap[item.id] = item.selected; });
                localStorage.setItem('cartSelection', JSON.stringify(selectionMap));
                return newItems;
            });
        } else if (type === 'customized') {
            setCustomizedItems(prev => prev.map(item => item.listId === id ? { ...item, selected: !item.selected } : item));
        } else if (type === 'booking') {
            setBookingItems(prev => prev.map(item => item.listId === id ? { ...item, selected: !item.selected } : item));
        }
    };

    const updateQty = (id, change) => {
        const item = cartItems.find(i => i.id === id);
        if (item) {
            let newQty = Math.max(1, item.qty + change);
            if (item.stockQuantity && newQty > item.stockQuantity) {
                newQty = item.stockQuantity;
                if (change > 0) {
                    alert(`Only ${item.stockQuantity} items in stock for ${item.name}`);
                }
            }
            updateCartItem(id, newQty);
        }
    };

    const removeItem = (id, type = 'product') => {
        if (type === 'product') {
            removeFromCart(id);
        } else if (type === 'customized') {
            const newItems = customizedItems.filter(item => item.listId !== id);
            setCustomizedItems(newItems);
            localStorage.setItem('customizedCart', JSON.stringify(newItems));
        } else if (type === 'booking') {
            const newItems = bookingItems.filter(item => item.listId !== id);
            setBookingItems(newItems);
            localStorage.setItem('bookingCart', JSON.stringify(newItems));
        }
    };

    const productTotal = cartItems.filter(item => item.selected).reduce((acc, item) => acc + (item.price * item.qty), 0);
    const customizedTotal = customizedItems.filter(item => item.selected).reduce((acc, item) => acc + (item.price || 0), 0);
    const totalAmount = productTotal + customizedTotal;

    const productCount = cartItems.filter(item => item.selected).length;
    const customizedCount = customizedItems.filter(item => item.selected).length;
    const bookingCount = bookingItems.filter(item => item.selected).length;
    const servicesCount = customizedCount + bookingCount;

    const isCartEmpty = cartItems.length === 0 && customizedItems.length === 0 && bookingItems.length === 0;

    return (
        <div className="container py-5 mt-5 bg-light" style={{ minHeight: '80vh', overflowX: 'hidden' }}>
            <h2 className="fw-bold mb-4"><i className="fas fa-shopping-cart me-2"></i> Shopping Cart</h2>

            {isCartEmpty ? (
                <div className="text-center py-5 bg-white rounded shadow-sm">
                    <div style={{ width: '100px', height: '100px', background: '#f5f5f5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                        <i className="fas fa-shopping-cart" style={{ fontSize: '2.5rem', color: '#ccc' }}></i>
                    </div>
                    <h4 className="text-muted mb-3">Your cart is empty</h4>
                    <p className="text-muted mb-4">Looks like you haven't added anything yet</p>
                    <Link to="/" className="btn rounded-pill px-4 py-2" style={{ background: 'var(--shop-pink)', color: 'white' }}>Start Shopping</Link>
                </div>
            ) : (
                <>
                    {/* Tab Bar */}
                    <div className="d-flex gap-2 mb-4">
                        <button
                            className={`btn rounded-pill px-4 py-2 fw-semibold ${activeTab === 'products' ? 'text-white' : 'btn-outline-secondary'}`}
                            style={activeTab === 'products' ? { background: '#4caf50', border: 'none' } : {}}
                            onClick={() => setActiveTab('products')}
                        >
                            <i className="fas fa-box-open me-2"></i>Products
                            {cartItems.length > 0 && <span className="badge bg-white text-dark ms-2">{cartItems.length}</span>}
                        </button>
                        <button
                            className={`btn rounded-pill px-4 py-2 fw-semibold ${activeTab === 'customized' ? 'text-white' : 'btn-outline-secondary'}`}
                            style={activeTab === 'customized' ? { background: '#9c27b0', border: 'none' } : {}}
                            onClick={() => setActiveTab('customized')}
                        >
                            <i className="fas fa-magic me-2"></i>Customized Bouquets
                            {customizedItems.length > 0 && <span className="badge bg-white text-dark ms-2">{customizedItems.length}</span>}
                        </button>
                        <button
                            className={`btn rounded-pill px-4 py-2 fw-semibold ${activeTab === 'booking' ? 'text-dark' : 'btn-outline-secondary'}`}
                            style={activeTab === 'booking' ? { background: '#f39c12', border: 'none' } : {}}
                            onClick={() => setActiveTab('booking')}
                        >
                            <i className="fas fa-calendar-alt me-2"></i>Custom Orders
                            {bookingItems.length > 0 && <span className="badge bg-white text-dark ms-2">{bookingItems.length}</span>}
                        </button>
                    </div>

                    <div className="row g-4">
                        <div className="col-lg-8">

                            {/* ===== PRODUCTS TAB ===== */}
                            {activeTab === 'products' && (
                                <div>
                                    {cartItems.length === 0 ? (
                                        <div className="text-center py-5 bg-white rounded shadow-sm">
                                            <i className="fas fa-box-open text-muted mb-3" style={{ fontSize: '2.5rem' }}></i>
                                            <h5 className="text-muted">No products in cart</h5>
                                            <Link to="/" className="btn btn-outline-secondary rounded-pill mt-3 px-4">Browse Products</Link>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="card border-0 shadow-sm mb-3 d-none d-md-block">
                                                <div className="card-body py-2">
                                                    <div className="row align-items-center text-muted small fw-bold text-uppercase g-0">
                                                        <div className="col-5">Product</div>
                                                        <div className="col-2 text-center">Unit Price</div>
                                                        <div className="col-2 text-center">Quantity</div>
                                                        <div className="col-2 text-center">Total Price</div>
                                                        <div className="col-1 text-center">Action</div>
                                                    </div>
                                                </div>
                                            </div>
                                            {cartItems.map(item => (
                                                <div key={item.id}
                                                    className="card border-0 shadow-sm mb-3"
                                                    style={{ cursor: 'pointer', transition: 'box-shadow 0.2s', border: item.selected ? '1px solid #4caf50' : 'none' }}
                                                    onClick={() => toggleSelect(item.id)}
                                                >
                                                    <div className="card-body position-relative">
                                                        <div className="position-absolute top-0 end-0 p-3 d-md-none" style={{ zIndex: 10 }}>
                                                            <button className="btn btn-outline-danger btn-sm rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '32px', height: '32px', border: 'none' }} onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}>
                                                                <i className="fas fa-trash-alt"></i>
                                                            </button>
                                                        </div>
                                                        <div className="row align-items-center g-2">
                                                            <div className="col-12 col-md-5 d-flex align-items-center">
                                                                <div className="form-check me-2 me-md-3 mb-0" onClick={(e) => e.stopPropagation()}>
                                                                    <input className="form-check-input" type="checkbox" checked={item.selected} onChange={() => toggleSelect(item.id, 'product')} style={{ borderColor: item.selected ? '#4caf50' : '#dee2e6', backgroundColor: item.selected ? '#4caf50' : 'white', cursor: 'pointer' }} />
                                                                </div>
                                                                <img src={item.image} alt={item.name} className="rounded flex-shrink-0" style={{ width: '70px', height: '70px', objectFit: 'cover' }} onError={(e) => e.target.src = 'https://via.placeholder.com/80'} />
                                                                <div className="ms-2 ms-md-3 pe-4 pe-md-0 flex-grow-1">
                                                                    <h6 className="mb-0 fw-bold" style={{ fontSize: '0.95rem' }}>{item.name}</h6>
                                                                    <div className="d-md-none text-muted small mt-1">₱{item.price.toLocaleString()}</div>
                                                                </div>
                                                            </div>
                                                            <div className="col-md-2 text-center d-none d-md-block">₱{item.price.toLocaleString()}</div>
                                                            <div className="col-6 col-md-2 mt-2 mt-md-0">
                                                                <div className="ms-4 ms-md-0 ps-3 ps-md-0 d-flex justify-content-start justify-content-md-center">
                                                                    <div className="input-group input-group-sm" style={{ width: '90px' }} onClick={(e) => e.stopPropagation()}>
                                                                        <button className="btn btn-outline-secondary px-2" onClick={(e) => { e.stopPropagation(); updateQty(item.id, -1); }}>-</button>
                                                                        <input type="text" className="form-control text-center bg-white px-1" value={item.qty} readOnly />
                                                                        <button className="btn btn-outline-secondary px-2" onClick={(e) => { e.stopPropagation(); updateQty(item.id, 1); }}>+</button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="col-6 col-md-2 text-end text-md-center fw-bold mt-2 mt-md-0 align-self-end align-self-md-center" style={{ color: '#4caf50' }}>₱{(item.price * item.qty).toLocaleString()}</div>
                                                            <div className="col-md-1 text-center d-none d-md-block">
                                                                <button className="btn btn-outline-danger btn-sm rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '36px', height: '36px' }} onClick={(e) => { e.stopPropagation(); removeItem(item.id, 'product'); }} title="Remove item">
                                                                    <i className="fas fa-trash-alt"></i>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* ===== CUSTOMIZED TAB ===== */}
                            {activeTab === 'customized' && (
                                <div>
                                    {customizedItems.length === 0 ? (
                                        <div className="text-center py-5 bg-white rounded shadow-sm">
                                            <i className="fas fa-magic text-muted mb-3" style={{ fontSize: '2.5rem' }}></i>
                                            <h5 className="text-muted">No custom bouquets in cart</h5>
                                            <Link to="/customized" className="btn btn-outline-secondary rounded-pill mt-3 px-4">Design a Bouquet</Link>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Customized Bouquets */}
                                            {customizedItems.length > 0 && (
                                                <div className="mb-4">
                                                    {customizedItems.map(item => (
                                                        <div key={item.listId} className="card border-0 shadow-sm mb-3" style={{ cursor: 'pointer', transition: 'box-shadow 0.2s', border: item.selected ? '1px solid #9c27b0' : 'none' }} onClick={() => toggleSelect(item.listId, 'customized')}>
                                                            <div className="card-body position-relative">
                                                                <div className="position-absolute top-0 end-0 p-3" style={{ zIndex: 10 }}>
                                                                    <button className="btn btn-outline-danger btn-sm rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '32px', height: '32px', border: 'none' }} onClick={(e) => { e.stopPropagation(); removeItem(item.listId, 'customized'); }}>
                                                                        <i className="fas fa-trash-alt"></i>
                                                                    </button>
                                                                </div>
                                                                <div className="row align-items-center g-2">
                                                                    <div className="col-12 col-md-8 d-flex align-items-center">
                                                                        <div className="form-check me-2 mb-0" onClick={(e) => e.stopPropagation()}>
                                                                            <input className="form-check-input" type="checkbox" checked={item.selected} onChange={() => toggleSelect(item.listId, 'customized')} style={{ borderColor: item.selected ? '#9c27b0' : '#dee2e6', backgroundColor: item.selected ? '#9c27b0' : 'white', cursor: 'pointer' }} />
                                                                        </div>
                                                                        {item.image && (
                                                                            <img src={item.image} alt="Custom Bouquet" className="rounded border bg-light flex-shrink-0" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
                                                                        )}
                                                                        <div className="ms-3 pe-4 flex-grow-1">
                                                                            <h6 className="mb-1 fw-bold">Customized Bouquet ({item.bundleSize || '?'} stems)</h6>
                                                                            <div className="text-muted small">
                                                                                <div><strong>Flowers:</strong> {(item.flowers || []).map(f => f.name).join(', ')}</div>
                                                                                {item.wrapper && <div><strong>Wrapper:</strong> {item.wrapper.name}</div>}
                                                                                {item.ribbon && <div><strong>Ribbon:</strong> {item.ribbon.name}</div>}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="col-12 col-md-4 text-end fw-bold align-self-end align-self-md-center fs-5" style={{ color: '#9c27b0' }}>
                                                                        ₱{(item.price || 0).toLocaleString()}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* ===== BOOKING TAB ===== */}
                            {activeTab === 'booking' && (
                                <div>
                                    {bookingItems.length === 0 ? (
                                        <div className="text-center py-5 bg-white rounded shadow-sm">
                                            <i className="fas fa-calendar-alt text-muted mb-3" style={{ fontSize: '2.5rem' }}></i>
                                            <h5 className="text-muted">No custom orders in cart</h5>
                                            <Link to="/book-event" className="btn btn-outline-secondary rounded-pill mt-3 px-4">Create a Custom Order</Link>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Custom Orders */}
                                            {bookingItems.length > 0 && (
                                                <div className="mb-4">
                                                    {bookingItems.map(item => (
                                                        <div key={item.listId} className="card border-0 shadow-sm mb-3" style={{ cursor: 'pointer', transition: 'box-shadow 0.2s', border: item.selected ? '1px solid #f39c12' : 'none' }} onClick={() => toggleSelect(item.listId, 'booking')}>
                                                            <div className="card-body position-relative">
                                                                <div className="position-absolute top-0 end-0 p-3" style={{ zIndex: 10 }}>
                                                                    <button className="btn btn-outline-danger btn-sm rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '32px', height: '32px', border: 'none' }} onClick={(e) => { e.stopPropagation(); removeItem(item.listId, 'booking'); }}>
                                                                        <i className="fas fa-trash-alt"></i>
                                                                    </button>
                                                                </div>
                                                                <div className="row align-items-center g-2">
                                                                    <div className="col-12 col-md-8 d-flex align-items-center">
                                                                        <div className="form-check me-2 mb-0" onClick={(e) => e.stopPropagation()}>
                                                                            <input className="form-check-input" type="checkbox" checked={item.selected} onChange={() => toggleSelect(item.listId, 'booking')} style={{ borderColor: item.selected ? '#f39c12' : '#dee2e6', backgroundColor: item.selected ? '#f39c12' : 'white', cursor: 'pointer' }} />
                                                                        </div>
                                                                        {item.inspirationImageBase64 ? (
                                                                            <img src={item.inspirationImageBase64} alt="Inspiration" className="rounded border bg-light flex-shrink-0" style={{ width: '80px', height: '80px', objectFit: 'cover' }} />
                                                                        ) : (
                                                                            <div className="rounded border bg-light d-flex align-items-center justify-content-center text-muted" style={{ width: '80px', height: '80px' }}>
                                                                                <i className="fas fa-image fs-4"></i>
                                                                            </div>
                                                                        )}
                                                                        <div className="ms-3 pe-4 flex-grow-1">
                                                                            <h6 className="mb-1 fw-bold">{item.arrangementType} Event Order</h6>
                                                                            <div className="text-muted small">
                                                                                <div><strong>Occasion:</strong> {item.occasion}</div>
                                                                                <div><strong>Date:</strong> {new Date(item.eventDate).toLocaleDateString()}</div>
                                                                                {item.flowers && <div><strong>Flowers:</strong> {item.flowers}</div>}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="col-12 col-md-4 text-end fw-bold align-self-end align-self-md-center" style={{ color: '#f39c12' }}>
                                                                        <span className="badge bg-light text-dark border p-2">For Discussion</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ===== ORDER SUMMARY SIDEBAR ===== */}
                        <div className="col-lg-4">
                            <div className="card border-0 shadow-sm position-sticky" style={{ top: '100px' }}>
                                <div className="card-body">
                                    <h5 className="fw-bold mb-3">Order Summary</h5>

                                    {activeTab === 'products' && (
                                        <>
                                            <div className="d-flex justify-content-between mb-2">
                                                <span className="text-muted">Selected Products ({productCount})</span>
                                                <span>₱{productTotal.toLocaleString()}</span>
                                            </div>
                                            <div className="d-flex justify-content-between mb-2">
                                                <span className="text-muted">Shipping Fee</span>
                                                <span>₱0</span>
                                            </div>
                                            <hr />
                                            <div className="d-flex justify-content-between mb-4 mt-3">
                                                <span className="fw-bold fs-5">Total</span>
                                                <span className="fw-bold fs-5" style={{ color: '#4caf50' }}>₱{productTotal.toLocaleString()}</span>
                                            </div>
                                            <div className="d-grid gap-2 mb-3">
                                                <button
                                                    className="btn btn-primary w-100 py-2 fw-bold shadow-sm"
                                                    style={{ background: '#4caf50', border: 'none', borderRadius: '8px' }}
                                                    onClick={() => {
                                                        const selectedItems = cartItems.filter(item => item.selected);
                                                        localStorage.setItem('checkoutItems', JSON.stringify(selectedItems));
                                                        navigate('/checkout');
                                                    }}
                                                    disabled={productCount === 0}
                                                >
                                                    Checkout Products ({productCount})
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    {activeTab === 'customized' && (
                                        <>
                                            <div className="d-flex justify-content-between mb-2">
                                                <span className="text-muted">Custom Bouquets ({customizedCount})</span>
                                                <span>₱{customizedTotal.toLocaleString()}</span>
                                            </div>
                                            <hr />
                                            <div className="d-flex justify-content-between mb-4 mt-3">
                                                <span className="fw-bold fs-5">Total</span>
                                                <span className="fw-bold fs-5" style={{ color: '#9c27b0' }}>₱{customizedTotal.toLocaleString()}</span>
                                            </div>
                                            <div className="d-grid gap-2 mb-3">
                                                <button
                                                    className="btn w-100 py-2 fw-bold shadow-sm text-white"
                                                    style={{ background: '#9c27b0', border: 'none', borderRadius: '8px' }}
                                                    onClick={() => navigate('/customized-checkout')}
                                                    disabled={customizedCount === 0}
                                                >
                                                    Checkout Custom Bouquet
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    {activeTab === 'booking' && (
                                        <>
                                            <div className="d-flex justify-content-between mb-2">
                                                <span className="text-muted">Custom Orders ({bookingCount})</span>
                                                <span className="text-warning small fst-italic">For Discussion</span>
                                            </div>
                                            <hr />
                                            <div className="d-flex justify-content-between mb-4 mt-3">
                                                <span className="fw-bold fs-5">Est. Total</span>
                                                <span className="fw-bold fs-5" style={{ color: '#f39c12' }}>For Discussion</span>
                                            </div>
                                            <div className="d-grid gap-2 mb-3">
                                                <button
                                                    className="btn w-100 py-2 fw-bold shadow-sm text-dark"
                                                    style={{ background: '#f39c12', border: 'none', borderRadius: '8px' }}
                                                    onClick={() => navigate('/booking-checkout')}
                                                    disabled={bookingCount === 0}
                                                >
                                                    Checkout Custom Order
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    <Link to="/" className="btn btn-outline-secondary w-100 py-2 mt-1 rounded-pill">
                                        Continue Shopping
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Cart;
