import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/Shop.css';

const Cart = ({ cart, updateCartItem, removeFromCart }) => {
    const navigate = useNavigate();
    const [cartItems, setCartItems] = useState([]);

    useEffect(() => {
        if (cart) {
            setCartItems(cart.map((item, index) => ({
                ...item,
                // Ensure we have a stable ID for local items if needed, but prefer provided ID
                id: item.id || item.productId || `local-${index}`,
                selected: true,
                qty: item.qty || 1
            })));
        }
    }, [cart]);

    const toggleSelect = (id) => {
        setCartItems(cartItems.map(item =>
            item.id === id ? { ...item, selected: !item.selected } : item
        ));
    };

    const updateQty = (id, change) => {
        const item = cartItems.find(i => i.id === id);
        if (item) {
            const newQty = Math.max(1, item.qty + change);
            updateCartItem(id, newQty);
        }
    };

    const removeItem = (id) => {
        removeFromCart(id);
    };

    const totalAmount = cartItems
        .filter(item => item.selected)
        .reduce((acc, item) => acc + (item.price * item.qty), 0);

    const totalItems = cartItems.filter(item => item.selected).length;

    return (
        <div className="container py-5 mt-5 bg-light" style={{ minHeight: '80vh', overflowX: 'hidden' }}>
            <h2 className="fw-bold mb-4"><i className="fas fa-shopping-cart me-2"></i> Shopping Cart</h2>

            {cartItems.length === 0 ? (
                <div className="text-center py-5 bg-white rounded shadow-sm">
                    <div style={{
                        width: '100px',
                        height: '100px',
                        background: '#f5f5f5',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 20px'
                    }}>
                        <i className="fas fa-shopping-cart" style={{ fontSize: '2.5rem', color: '#ccc' }}></i>
                    </div>
                    <h4 className="text-muted mb-3">Your cart is empty</h4>
                    <p className="text-muted mb-4">Looks like you haven't added anything yet</p>
                    <Link
                        to="/"
                        className="btn rounded-pill px-4 py-2"
                        style={{ background: 'var(--shop-pink)', color: 'white' }}
                    >
                        Start Shopping
                    </Link>
                </div>
            ) : (
                <div className="row g-3">
                    <div className="col-lg-8">
                        {/* Cart Header */}
                        <div className="card border-0 shadow-sm mb-3 d-none d-md-block">
                            <div className="card-body py-2" style={{ overflowX: 'auto' }}>
                                <div className="row align-items-center text-muted small fw-bold text-uppercase g-0">
                                    <div className="col-5">Product</div>
                                    <div className="col-2 text-center">Unit Price</div>
                                    <div className="col-2 text-center">Quantity</div>
                                    <div className="col-2 text-center">Total Price</div>
                                    <div className="col-1 text-center" style={{ whiteSpace: 'nowrap' }}>Action</div>
                                </div>
                            </div>
                        </div>

                        {/* Cart Items */}
                        {cartItems.map(item => (
                            <div key={item.id} className="card border-0 shadow-sm mb-3">
                                <div className="card-body" style={{ overflowX: 'auto' }}>
                                    <div className="row align-items-center g-0">
                                        <div className="col-md-5 d-flex align-items-center mb-3 mb-md-0">
                                            <div className="form-check me-3">
                                                <input
                                                    className="form-check-input"
                                                    type="checkbox"
                                                    checked={item.selected}
                                                    onChange={() => toggleSelect(item.id)}
                                                    style={{
                                                        borderColor: item.selected ? '#4caf50' : '#dee2e6',
                                                        backgroundColor: item.selected ? '#4caf50' : 'white'
                                                    }}
                                                />
                                            </div>
                                            <img
                                                src={item.image}
                                                alt={item.name}
                                                className="rounded"
                                                style={{ width: '80px', height: '80px', objectFit: 'cover' }}
                                                onError={(e) => e.target.src = 'https://via.placeholder.com/80'}
                                            />
                                            <div className="ms-3">
                                                <h6 className="mb-0 fw-bold">{item.name}</h6>
                                            </div>
                                        </div>
                                        <div className="col-md-2 text-center mb-2 mb-md-0">
                                            <span className="d-md-none text-muted small me-2">Price:</span>
                                            ₱{item.price.toLocaleString()}
                                        </div>
                                        <div className="col-md-2 text-center mb-2 mb-md-0">
                                            <div className="input-group input-group-sm justify-content-center" style={{ width: '100px', margin: '0 auto' }}>
                                                <button className="btn btn-outline-secondary" onClick={() => updateQty(item.id, -1)}>-</button>
                                                <input type="text" className="form-control text-center bg-white" value={item.qty} readOnly />
                                                <button className="btn btn-outline-secondary" onClick={() => updateQty(item.id, 1)}>+</button>
                                            </div>
                                        </div>
                                        <div className="col-md-2 text-center fw-bold mb-2 mb-md-0" style={{ color: '#4caf50' }}>
                                            <span className="d-md-none text-muted small me-2">Total:</span>
                                            ₱{(item.price * item.qty).toLocaleString()}
                                        </div>
                                        <div className="col-md-1 text-center">
                                            <button
                                                className="btn btn-outline-danger btn-sm rounded-circle d-inline-flex align-items-center justify-content-center"
                                                style={{ width: '36px', height: '36px' }}
                                                onClick={() => removeItem(item.id)}
                                                title="Remove item"
                                            >
                                                <i className="fas fa-trash-alt"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="col-lg-4">
                        <div className="card border-0 shadow-sm position-sticky" style={{ top: '100px' }}>
                            <div className="card-body">
                                <h5 className="fw-bold mb-3">Order Summary</h5>

                                <div className="d-flex justify-content-between mb-2">
                                    <span className="text-muted">Selected Items ({totalItems})</span>
                                    <span>₱{totalAmount.toLocaleString()}</span>
                                </div>
                                <div className="d-flex justify-content-between mb-2">
                                    <span className="text-muted">Shipping Fee</span>
                                    <span>₱0</span>
                                </div>

                                <hr />

                                <div className="d-flex justify-content-between mb-4">
                                    <span className="fw-bold fs-5">Total Payment</span>
                                    <span className="fw-bold fs-5" style={{ color: '#4caf50' }}>₱{totalAmount.toLocaleString()}</span>
                                </div>

                                <button
                                    className="btn btn-primary w-100 py-2 fw-bold rounded-pill shadow-sm"
                                    style={{ background: 'var(--shop-pink)', border: 'none' }}
                                    onClick={() => {
                                        const selectedItems = cartItems.filter(item => item.selected);
                                        localStorage.setItem('checkoutItems', JSON.stringify(selectedItems));
                                        navigate('/checkout');
                                    }}
                                    disabled={totalItems === 0}
                                >
                                    Proceed to Checkout
                                </button>
                                <Link to="/" className="btn btn-outline-secondary w-100 py-2 mt-2 rounded-pill">
                                    Continue Shopping
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Cart;
