import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import '../styles/Shop.css';
import InfoModal from '../components/InfoModal';

const Cart = ({ cart, updateCartItem, removeFromCart, user }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [cartItems, setCartItems] = useState([]);
    const [customizedItems, setCustomizedItems] = useState([]);
    const [bookingItems, setBookingItems] = useState([]);
    const [filter, setFilter] = useState('all');
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '' });

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

    // Load customized bouquets cart (user-scoped key)
    useEffect(() => {
        const userId = user?.id;
        if (!userId) { setCustomizedItems([]); return; }
        const key = `customizedCart_${userId}`;
        const savedCustomized = localStorage.getItem(key);
        if (savedCustomized) {
            try {
                const parsed = JSON.parse(savedCustomized);
                const justAdded = location.state?.justAdded;
                const savedSelStr = localStorage.getItem(`custSelection_${userId}`);
                const savedSel = savedSelStr ? JSON.parse(savedSelStr) : {};
                setCustomizedItems(Array.isArray(parsed) ? parsed.map((item, idx) => {
                    const listId = `cust-${idx}`;
                    let selected = false;
                    if (justAdded === 'customized' && idx === parsed.length - 1) {
                        selected = true;
                    } else if (savedSel[listId] !== undefined) {
                        selected = savedSel[listId];
                    }
                    return { ...item, listId, selected };
                }) : []);
            } catch (e) {
                console.error("Failed to parse customized cart", e);
            }
        } else {
            setCustomizedItems([]);
        }
        if (location.state?.justAdded === 'customized') {
            window.history.replaceState({}, '');
        }
    }, [user]);

    // Load custom order (booking) cart (user-scoped key)
    useEffect(() => {
        const userId = user?.id;
        if (!userId) { setBookingItems([]); return; }
        const key = `bookingCart_${userId}`;
        const savedBookings = localStorage.getItem(key);
        if (savedBookings) {
            try {
                const parsed = JSON.parse(savedBookings);
                const justAdded = location.state?.justAdded;
                const savedSelStr = localStorage.getItem(`bookSelection_${userId}`);
                const savedSel = savedSelStr ? JSON.parse(savedSelStr) : {};
                setBookingItems(Array.isArray(parsed) ? parsed.map((item, idx) => {
                    const listId = `book-${idx}`;
                    let selected = false;
                    if (justAdded === 'booking' && idx === parsed.length - 1) {
                        selected = true;
                    } else if (savedSel[listId] !== undefined) {
                        selected = savedSel[listId];
                    }
                    return { ...item, listId, selected };
                }) : []);
            } catch (e) {
                console.error("Failed to parse booking cart", e);
            }
        } else {
            setBookingItems([]);
        }
        if (location.state?.justAdded === 'booking') {
            window.history.replaceState({}, '');
        }
    }, [user]);

    // ===== DERIVED: which type is currently active =====
    const selectedProductsCount = cartItems.filter(item => item.selected).length;
    const selectedCustomizedCount = customizedItems.filter(item => item.selected).length;
    const selectedBookingCount = bookingItems.filter(item => item.selected).length;

    const activeSelectionType = selectedProductsCount > 0
        ? 'product'
        : selectedCustomizedCount > 0
            ? 'customized'
            : selectedBookingCount > 0
                ? 'booking'
                : null;

    // ===== HELPERS: clear other types =====
    const clearProductSelections = () => {
        setCartItems(prev => {
            const cleared = prev.map(item => ({ ...item, selected: false }));
            const selMap = {};
            cleared.forEach(item => { selMap[item.id] = false; });
            localStorage.setItem('cartSelection', JSON.stringify(selMap));
            return cleared;
        });
    };

    const clearCustomizedSelections = () => {
        setCustomizedItems(prev => {
            const cleared = prev.map(item => ({ ...item, selected: false }));
            if (user?.id) {
                const selMap = {};
                cleared.forEach(item => { selMap[item.listId] = false; });
                localStorage.setItem(`custSelection_${user.id}`, JSON.stringify(selMap));
            }
            return cleared;
        });
    };

    const clearBookingSelections = () => {
        setBookingItems(prev => {
            const cleared = prev.map(item => ({ ...item, selected: false }));
            if (user?.id) {
                const selMap = {};
                cleared.forEach(item => { selMap[item.listId] = false; });
                localStorage.setItem(`bookSelection_${user.id}`, JSON.stringify(selMap));
            }
            return cleared;
        });
    };

    // ===== TOGGLE WITH MUTUAL EXCLUSION =====
    const toggleSelect = (id, type = 'product') => {
        if (type === 'product') {
            // If another type is active, clear it first
            if (activeSelectionType && activeSelectionType !== 'product') {
                clearCustomizedSelections();
                clearBookingSelections();
            }
            setCartItems(prevItems => {
                const newItems = prevItems.map(item => item.id === id ? { ...item, selected: !item.selected } : item);
                const selectionMap = {};
                newItems.forEach(item => { selectionMap[item.id] = item.selected; });
                localStorage.setItem('cartSelection', JSON.stringify(selectionMap));
                return newItems;
            });
        } else if (type === 'customized') {
            if (activeSelectionType && activeSelectionType !== 'customized') {
                clearProductSelections();
                clearBookingSelections();
            }
            setCustomizedItems(prev => {
                const newItems = prev.map(item => item.listId === id ? { ...item, selected: !item.selected } : item);
                if (user?.id) {
                    const selMap = {};
                    newItems.forEach(item => { selMap[item.listId] = item.selected; });
                    localStorage.setItem(`custSelection_${user.id}`, JSON.stringify(selMap));
                }
                return newItems;
            });
        } else if (type === 'booking') {
            if (activeSelectionType && activeSelectionType !== 'booking') {
                clearProductSelections();
                clearCustomizedSelections();
            }
            setBookingItems(prev => {
                const newItems = prev.map(item => item.listId === id ? { ...item, selected: !item.selected } : item);
                if (user?.id) {
                    const selMap = {};
                    newItems.forEach(item => { selMap[item.listId] = item.selected; });
                    localStorage.setItem(`bookSelection_${user.id}`, JSON.stringify(selMap));
                }
                return newItems;
            });
        }
    };

    const updateQty = (id, change) => {
        const item = cartItems.find(i => i.id === id);
        if (item) {
            let newQty = Math.max(1, item.qty + change);
            if (item.stockQuantity && newQty > item.stockQuantity) {
                newQty = item.stockQuantity;
                if (change > 0) {
                    setInfoModal({
                        show: true,
                        title: 'Stock Limit Reached',
                        message: `Only ${item.stockQuantity} items in stock for ${item.name}`
                    });
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
            if (user?.id) localStorage.setItem(`customizedCart_${user.id}`, JSON.stringify(newItems));
        } else if (type === 'booking') {
            const newItems = bookingItems.filter(item => item.listId !== id);
            setBookingItems(newItems);
            if (user?.id) localStorage.setItem(`bookingCart_${user.id}`, JSON.stringify(newItems));
        }
    };

    // ===== TOTALS =====
    const productTotal = cartItems.filter(item => item.selected).reduce((acc, item) => acc + (item.price * item.qty), 0);
    const customizedTotal = customizedItems.filter(item => item.selected).reduce((acc, item) => acc + (item.price || 0), 0);

    const isCartEmpty = cartItems.length === 0 && customizedItems.length === 0 && bookingItems.length === 0;

    // ===== DISABLED STATE =====
    const isTypeDisabled = (type) => activeSelectionType !== null && activeSelectionType !== type;

    // ===== CHECKOUT HANDLERS =====
    const handleProductCheckout = () => {
        const selectedItems = cartItems.filter(item => item.selected);
        localStorage.setItem('checkoutItems', JSON.stringify(selectedItems));
        navigate('/checkout');
    };

    const handleCustomizedCheckout = () => {
        // CustomizedCheckout.jsx reads from 'checkoutItems' in localStorage
        const selectedBouquets = customizedItems.filter(item => item.selected).map(item => ({
            ...item,
            name: `Customized Bouquet (${item.bundleSize || '?'} stems)`,
            qty: 1,
        }));
        localStorage.setItem('checkoutItems', JSON.stringify(selectedBouquets));
        navigate('/customized-checkout');
    };

    const handleBookingSubmit = () => {
        // BookingCheckout.jsx reads from the non-scoped 'bookingCart' key
        const selectedBookings = bookingItems.filter(item => item.selected);
        localStorage.setItem('bookingCart', JSON.stringify(selectedBookings));
        navigate('/booking-checkout');
    };

    // ===== FILTER =====
    const filterOptions = [
        { key: 'all', label: 'All' },
        { key: 'products', label: 'Products', count: cartItems.length },
        { key: 'customized', label: 'Bouquets', count: customizedItems.length },
        { key: 'booking', label: 'Custom Orders', count: bookingItems.length },
    ];

    const showProducts = filter === 'all' || filter === 'products';
    const showCustomized = filter === 'all' || filter === 'customized';
    const showBooking = filter === 'all' || filter === 'booking';

    // ===== DISABLED OVERLAY STYLE =====
    const disabledSectionStyle = { opacity: 0.45, pointerEvents: 'none', filter: 'grayscale(30%)' };

    // ===== ORDER SUMMARY RENDERERS =====
    const renderProductSummary = () => (
        <>
            <div className="d-flex justify-content-between mb-2 pb-2">
                <span className="text-muted">Standard Products ({selectedProductsCount})</span>
                <span>₱{productTotal.toLocaleString()}</span>
            </div>
            <div className="d-flex justify-content-between mb-2">
                                        <span className="text-muted">Delivery Fee</span>
                <span className="fst-italic text-muted small mt-1">Calculated at checkout</span>
            </div>
            <hr />
            <div className="d-flex justify-content-between mb-4 mt-3">
                <span className="fw-bold fs-5">Estimated Total</span>
                <span className="fw-bold fs-4" style={{ color: 'var(--shop-pink)' }}>₱{productTotal.toLocaleString()}</span>
            </div>
            <button
                className="btn w-100 py-3 fw-bold shadow-sm text-white rounded-pill"
                style={{ background: 'var(--shop-pink)', border: 'none', fontSize: '1.1rem' }}
                onClick={handleProductCheckout}
            >
                <i className="fas fa-shopping-bag me-2"></i>Proceed to Checkout ({selectedProductsCount})
            </button>
        </>
    );

    const renderCustomizedSummary = () => (
        <>
            <div className="d-flex justify-content-between mb-2 pb-2">
                <span className="text-muted">Custom Bouquets ({selectedCustomizedCount})</span>
                <span>₱{customizedTotal.toLocaleString()}</span>
            </div>
            <div className="d-flex justify-content-between mb-2">
                                            <span className="text-muted">Delivery Fee</span>
                <span className="fst-italic text-muted small mt-1">Calculated at checkout</span>
            </div>
            <hr />
            <div className="d-flex justify-content-between mb-4 mt-3">
                <span className="fw-bold fs-5">Estimated Total</span>
                <span className="fw-bold fs-4" style={{ color: 'var(--shop-pink)' }}>₱{customizedTotal.toLocaleString()}</span>
            </div>
            <button
                className="btn w-100 py-3 fw-bold shadow-sm text-white rounded-pill"
                style={{ background: 'var(--shop-pink)', border: 'none', fontSize: '1.1rem' }}
                onClick={handleCustomizedCheckout}
            >
                <i className="fas fa-paint-brush me-2"></i>Checkout Bouquets ({selectedCustomizedCount})
            </button>
        </>
    );

    const renderBookingSummary = () => (
        <>
            <div className="d-flex justify-content-between mb-2 pb-2">
                <span className="text-muted">Custom Order Requests ({selectedBookingCount})</span>
                <span className="badge text-white" style={{ background: 'var(--shop-pink)' }}>Pending Quote</span>
            </div>
            <div className="text-muted small mb-3 p-3 rounded" style={{ background: '#fff5f8', border: '1px dashed var(--shop-pink)' }}>
                <i className="fas fa-info-circle me-2" style={{ color: 'var(--shop-pink)' }}></i>
                Custom orders require admin review before pricing. No monetary total will be charged at this step.
            </div>
            <button
                className="btn w-100 py-3 fw-bold shadow-sm rounded-pill"
                style={{ background: '#fff', color: 'var(--shop-pink)', border: '2px solid var(--shop-pink)', fontSize: '1.1rem' }}
                onClick={handleBookingSubmit}
            >
                <i className="fas fa-paper-plane me-2"></i>Submit for Review ({selectedBookingCount})
            </button>
        </>
    );

    const renderEmptySummary = () => (
        <>
            <div className="text-center text-muted mb-3 pt-2">
                <p className="mb-0">Select items to proceed.</p>
            </div>
            <div className="alert alert-light border mb-0 text-center small text-muted">
                <i className="fas fa-hand-pointer me-2"></i>Select items using the checkboxes to proceed.
            </div>
            <div className="mt-3 text-center small text-muted" style={{ lineHeight: '1.6' }}>
                <i className="fas fa-info-circle me-1"></i>
                You can only select one type of item at a time.
            </div>
        </>
    );

    // ===== SUMMARY HEADER COLORS =====
    const summaryHeaderColor = activeSelectionType === 'product'
        ? 'var(--shop-pink)'
        : activeSelectionType === 'customized'
            ? 'var(--shop-pink)'
            : activeSelectionType === 'booking'
                ? 'var(--shop-pink)'
                : 'var(--shop-pink)';

    const summaryTitle = activeSelectionType === 'product'
        ? 'Product Checkout'
        : activeSelectionType === 'customized'
            ? 'Bouquet Checkout'
            : activeSelectionType === 'booking'
                ? 'Event Request'
                : 'Order Summary';

    return (
        <div className="container py-5 mt-5 bg-light" style={{ minHeight: '80vh', overflowX: 'hidden' }}>
            <InfoModal
                show={infoModal.show}
                onClose={() => setInfoModal({ show: false, title: '', message: '' })}
                title={infoModal.title}
                message={infoModal.message}
            />
            <h2 className="fw-bold mb-4"><i className="fas fa-shopping-cart me-2"></i> Unified Shopping Cart</h2>

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
                    {/* Filter Bar */}
                    <div className="d-flex flex-wrap gap-2 mb-4">
                        {filterOptions.map(opt => (
                            <button
                                key={opt.key}
                                className={`btn btn-sm rounded-pill px-3 py-2 d-flex align-items-center gap-2 shadow-sm ${filter === opt.key ? 'text-white' : 'bg-white text-dark border'}`}
                                style={filter === opt.key ? { background: 'var(--shop-pink)', border: 'none' } : {}}
                                onClick={() => setFilter(opt.key)}
                            >
                                <span className="fw-semibold">{opt.label}</span>
                                {opt.count !== undefined && opt.count > 0 && (
                                    <span className="badge rounded-pill ms-1" style={filter === opt.key ? { background: 'rgba(255,255,255,0.3)', color: 'white' } : { background: '#eee', color: '#333' }}>{opt.count}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="row g-4">
                        <div className="col-lg-8">

                            {/* Standard Products */}
                            {showProducts && cartItems.length > 0 && (
                                <div className="mb-5" style={isTypeDisabled('product') ? disabledSectionStyle : {}}>
                                    <div className="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
                                        <h5 className="fw-bold mb-0">Ready-To-Buy Products</h5>
                                        {isTypeDisabled('product') && (
                                            <span className="badge bg-light text-muted border small"><i className="fas fa-lock me-1"></i>Deselect current items first</span>
                                        )}
                                    </div>
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
                                            className="card border-0 shadow-sm mb-3 cart-item-card"
                                            style={{ cursor: isTypeDisabled('product') ? 'not-allowed' : 'pointer', transition: 'box-shadow 0.2s', border: item.selected ? '2px solid var(--shop-pink)' : '1px solid transparent' }}
                                            onClick={() => !isTypeDisabled('product') && toggleSelect(item.id)}
                                        >
                                            <div className="card-body position-relative">
                                                <div className="position-absolute top-0 end-0 p-3 d-md-none" style={{ zIndex: 10 }}>
                                                    <button className="btn btn-outline-danger btn-sm rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '32px', height: '32px', border: 'none' }} onClick={(e) => { e.stopPropagation(); removeItem(item.id, 'product'); }}>
                                                        <i className="fas fa-trash-alt"></i>
                                                    </button>
                                                </div>
                                                <div className="row align-items-center g-2">
                                                    <div className="col-12 col-md-5 d-flex align-items-center">
                                                        <div className="form-check me-2 me-md-3 mb-0" onClick={(e) => e.stopPropagation()}>
                                                            <input className="form-check-input" type="checkbox" checked={item.selected} disabled={isTypeDisabled('product')} onChange={() => toggleSelect(item.id, 'product')} style={{ borderColor: item.selected ? 'var(--shop-pink)' : '#dee2e6', backgroundColor: item.selected ? 'var(--shop-pink)' : 'white', cursor: isTypeDisabled('product') ? 'not-allowed' : 'pointer', transform: 'scale(1.2)' }} />
                                                        </div>
                                                        <img src={item.image} alt={item.name} className="rounded flex-shrink-0" style={{ width: '70px', height: '70px', objectFit: 'cover' }} onError={(e) => e.target.src = 'https://via.placeholder.com/80'} />
                                                        <div className="ms-2 ms-md-3 pe-4 pe-md-0 flex-grow-1">
                                                            <h6 className="mb-0 fw-bold" style={{ fontSize: '0.95rem' }}>{item.name}</h6>
                                                            <div className="d-md-none text-muted small mt-1">₱{item.price.toLocaleString()}</div>
                                                        </div>
                                                    </div>
                                                    <div className="col-md-2 text-center d-none d-md-block text-muted">₱{item.price.toLocaleString()}</div>
                                                    <div className="col-6 col-md-2 mt-2 mt-md-0">
                                                        <div className="ms-4 ms-md-0 ps-3 ps-md-0 d-flex justify-content-start justify-content-md-center">
                                                            <div className="input-group input-group-sm" style={{ width: '90px' }} onClick={(e) => e.stopPropagation()}>
                                                                <button className="btn btn-outline-secondary px-2" onClick={(e) => { e.stopPropagation(); updateQty(item.id, -1); }}>-</button>
                                                                <input type="text" className="form-control text-center bg-white px-1 fw-bold" value={item.qty} readOnly />
                                                                <button className="btn btn-outline-secondary px-2" onClick={(e) => { e.stopPropagation(); updateQty(item.id, 1); }}>+</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="col-6 col-md-2 text-end text-md-center fw-bold mt-2 mt-md-0 align-self-end align-self-md-center" style={{ color: 'var(--shop-pink)', fontSize: '1.1rem' }}>₱{(item.price * item.qty).toLocaleString()}</div>
                                                    <div className="col-md-1 text-center d-none d-md-block">
                                                        <button className="btn btn-outline-danger btn-sm rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '36px', height: '36px' }} onClick={(e) => { e.stopPropagation(); removeItem(item.id, 'product'); }} title="Remove item">
                                                            <i className="fas fa-trash-alt"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Customized Bouquets */}
                            {showCustomized && customizedItems.length > 0 && (
                                <div className="mb-5" style={isTypeDisabled('customized') ? disabledSectionStyle : {}}>
                                    <div className="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
                                        <h5 className="fw-bold mb-0">Customized Bouquets</h5>
                                        {isTypeDisabled('customized') && (
                                            <span className="badge bg-light text-muted border small"><i className="fas fa-lock me-1"></i>Deselect current items first</span>
                                        )}
                                    </div>
                                    {customizedItems.map(item => (
                                        <div key={item.listId} className="card border-0 shadow-sm mb-3" style={{ cursor: isTypeDisabled('customized') ? 'not-allowed' : 'pointer', transition: 'box-shadow 0.2s', border: item.selected ? '2px solid var(--shop-pink)' : '1px solid transparent' }} onClick={() => !isTypeDisabled('customized') && toggleSelect(item.listId, 'customized')}>
                                            <div className="card-body position-relative">
                                                <div className="position-absolute top-0 end-0 p-3" style={{ zIndex: 10 }}>
                                                    <button className="btn btn-outline-danger btn-sm rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '32px', height: '32px', border: 'none', pointerEvents: 'auto' }} onClick={(e) => { e.stopPropagation(); removeItem(item.listId, 'customized'); }}>
                                                        <i className="fas fa-trash-alt"></i>
                                                    </button>
                                                </div>
                                                <div className="row align-items-center g-2">
                                                    <div className="col-12 col-md-8 d-flex align-items-center">
                                                        <div className="form-check me-3 mb-0" onClick={(e) => e.stopPropagation()}>
                                                            <input className="form-check-input" type="checkbox" checked={item.selected} disabled={isTypeDisabled('customized')} onChange={() => toggleSelect(item.listId, 'customized')} style={{ borderColor: item.selected ? 'var(--shop-pink)' : '#dee2e6', backgroundColor: item.selected ? 'var(--shop-pink)' : 'white', cursor: isTypeDisabled('customized') ? 'not-allowed' : 'pointer', transform: 'scale(1.2)' }} />
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
                                                    <div className="col-12 col-md-4 text-end fw-bold align-self-end align-self-md-center fs-4 mt-4 mt-md-0 pt-md-4 pe-3" style={{ color: 'var(--shop-pink)' }}>
                                                        ₱{(item.price || 0).toLocaleString()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Custom Orders (Bookings) */}
                            {showBooking && bookingItems.length > 0 && (
                                <div className="mb-5" style={isTypeDisabled('booking') ? disabledSectionStyle : {}}>
                                    <div className="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
                                        <h5 className="fw-bold mb-0">Custom Order Requests <span className="badge text-white fs-6 ms-2 align-middle" style={{ background: 'var(--shop-pink)' }}>Pending Quote</span></h5>
                                        {isTypeDisabled('booking') && (
                                            <span className="badge bg-light text-muted border small"><i className="fas fa-lock me-1"></i>Deselect current items first</span>
                                        )}
                                    </div>
                                    {bookingItems.map(item => (
                                        <div key={item.listId} className="card border-0 shadow-sm mb-3" style={{ cursor: isTypeDisabled('booking') ? 'not-allowed' : 'pointer', transition: 'box-shadow 0.2s', border: item.selected ? '2px solid var(--shop-pink)' : '1px solid transparent', backgroundColor: '#ffffff' }} onClick={() => !isTypeDisabled('booking') && toggleSelect(item.listId, 'booking')}>
                                            <div className="card-body position-relative">
                                                <div className="position-absolute top-0 end-0 p-3" style={{ zIndex: 10 }}>
                                                    <button className="btn btn-outline-danger btn-sm rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '32px', height: '32px', border: 'none', pointerEvents: 'auto' }} onClick={(e) => { e.stopPropagation(); removeItem(item.listId, 'booking'); }}>
                                                        <i className="fas fa-trash-alt"></i>
                                                    </button>
                                                </div>
                                                <div className="row align-items-center g-2">
                                                    <div className="col-12 col-md-8 d-flex align-items-center">
                                                        <div className="form-check me-3 mb-0" onClick={(e) => e.stopPropagation()}>
                                                            <input className="form-check-input" type="checkbox" checked={item.selected} disabled={isTypeDisabled('booking')} onChange={() => toggleSelect(item.listId, 'booking')} style={{ borderColor: item.selected ? 'var(--shop-pink)' : '#dee2e6', backgroundColor: item.selected ? 'var(--shop-pink)' : 'white', cursor: isTypeDisabled('booking') ? 'not-allowed' : 'pointer', transform: 'scale(1.2)' }} />
                                                        </div>
                                                        {item.inspirationImageBase64 ? (
                                                            <img src={item.inspirationImageBase64} alt="Inspiration" className="rounded border bg-light flex-shrink-0" style={{ width: '80px', height: '80px', objectFit: 'cover' }} />
                                                        ) : (
                                                            <div className="rounded border bg-light d-flex align-items-center justify-content-center text-muted" style={{ width: '80px', height: '80px' }}>
                                                                <i className="fas fa-image fs-4"></i>
                                                            </div>
                                                        )}
                                                        <div className="ms-3 pe-4 flex-grow-1">
                                                            <h6 className="mb-1 fw-bold text-dark">{(item.arrangementSummary || item.arrangementType || (Array.isArray(item.arrangementTypes) ? item.arrangementTypes.join(', ') : 'Custom Arrangement'))} Event Request</h6>
                                                            <div className="text-muted small">
                                                                <div><strong>Occasion:</strong> {item.occasion}</div>
                                                                <div><strong>Date:</strong> {new Date(item.eventDate).toLocaleDateString()}</div>
                                                                {item.flowers && <div><strong>Flowers:</strong> {item.flowers}</div>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="col-12 col-md-4 text-end fw-bold align-self-end align-self-md-center mt-4 mt-md-0 pt-md-4 pe-3">
                                                        <span className="badge bg-white shadow-sm text-dark border p-2" style={{ color: 'var(--shop-pink)' }}><i className="fas fa-search-dollar me-1" style={{ color: 'var(--shop-pink)' }}></i> For Discussion</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ===== DYNAMIC ORDER SUMMARY SIDEBAR ===== */}
                        <div className="col-lg-4">
                            <div className="card shadow-sm border-0 position-sticky" style={{ top: '100px', borderRadius: '12px', overflow: 'hidden', transition: 'all 0.3s ease' }}>
                                <div className="card-header text-white py-3" style={{ background: summaryHeaderColor, transition: 'background 0.3s ease' }}>
                                    <h5 className="fw-bold mb-0 text-center">{summaryTitle}</h5>
                                </div>
                                <div className="card-body p-4 bg-white">
                                    {activeSelectionType === 'product' && renderProductSummary()}
                                    {activeSelectionType === 'customized' && renderCustomizedSummary()}
                                    {activeSelectionType === 'booking' && renderBookingSummary()}
                                    {activeSelectionType === null && renderEmptySummary()}
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

