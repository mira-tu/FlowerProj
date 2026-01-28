import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/Shop.css';
import { supabase } from '../config/supabase';

const CustomizedCart = ({ user }) => {
    const navigate = useNavigate();
    const [cartItems, setCartItems] = useState([]);
    const [shippingFee, setShippingFee] = useState(0);
    const [address, setAddress] = useState(null);

    useEffect(() => {
        const savedCart = localStorage.getItem('customizedCart');
        if (savedCart) {
            setCartItems(JSON.parse(savedCart).map(item => ({ ...item, selected: true })));
        }
    }, []);
    
    useEffect(() => {
        const fetchDefaultAddress = async () => {
            if (user) {
                const { data, error } = await supabase
                    .from('addresses')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('is_default', true)
                    .limit(1);

                if (error) {
                    console.error('Error fetching default address:', error);
                    return;
                }
                
                if (data && data.length > 0) {
                    setAddress(data[0]);
                } else {
                    const { data: anyData, error: anyError } = await supabase
                        .from('addresses')
                        .select('*')
                        .eq('user_id', user.id)
                        .limit(1);

                    if (anyError) {
                        console.error('Error fetching any address:', anyError);
                    } else if (anyData && anyData.length > 0) {
                        setAddress(anyData[0]);
                    }
                }
            }
        };
        fetchDefaultAddress();
    }, [user]);

    const totalAmount = cartItems
        .filter(item => item.selected)
        .reduce((acc, item) => acc + (item.price * item.qty), 0);

    useEffect(() => {
        const fetchFee = async () => {
            if (address && address.barangay) {
                const { data, error } = await supabase
                    .from('barangay_fee')
                    .select('delivery_fee')
                    .ilike('barangay_name', `%${address.barangay}%`);

                if (error) {
                    console.error('Error fetching fee for barangay:', address.barangay, error);
                    setShippingFee(100); // Fallback
                } else if (data && data.length > 0) {
                    const fee = data[0].delivery_fee;
                    setShippingFee(totalAmount >= 2000 ? 0 : fee);
                } else {
                    setShippingFee(100); // Fallback
                }
            } else if (user && !address) {
                // If user is logged in but has no address, we can't determine the fee.
                // It will be determined at checkout.
                setShippingFee(0); // Or display 'TBD'
            }
        };

        if (cartItems.length > 0) {
            fetchFee();
        } else {
            setShippingFee(0);
        }
    }, [address, cartItems, totalAmount, user]);

    const toggleSelect = (id) => {
        setCartItems(cartItems.map(item =>
            item.id === id ? { ...item, selected: !item.selected } : item
        ));
    };

    const removeItem = (id) => {
        const updatedCart = cartItems.filter(item => item.id !== id);
        setCartItems(updatedCart);
        localStorage.setItem('customizedCart', JSON.stringify(updatedCart));
    };

    const totalItems = cartItems.filter(item => item.selected).length;
    const totalPayment = totalAmount + shippingFee;

    return (
        <div className="container py-5 mt-5 bg-light" style={{ minHeight: '80vh', overflowX: 'hidden' }}>
            <h2 className="fw-bold mb-4"><i className="fas fa-shopping-cart me-2"></i> Custom Bouquets Cart</h2>

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
                        <i className="fas fa-cut" style={{ fontSize: '2.5rem', color: '#ccc' }}></i>
                    </div>
                    <h4 className="text-muted mb-3">Your custom cart is empty</h4>
                    <p className="text-muted mb-4">Go create a unique bouquet!</p>
                    <Link
                        to="/customized"
                        className="btn rounded-pill px-4 py-2"
                        style={{ background: 'var(--shop-pink)', color: 'white' }}
                    >
                        Create a Bouquet
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
                                                <small className="text-muted">{item.bundleSize} stems</small>
                                            </div>
                                        </div>
                                        <div className="col-md-2 text-center mb-2 mb-md-0">
                                            <span className="d-md-none text-muted small me-2">Price:</span>
                                            ₱{item.price.toLocaleString()}
                                        </div>
                                        <div className="col-md-2 text-center mb-2 mb-md-0">
                                            1
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
                                    <span>{cartItems.length > 0 && user && address ? `₱${shippingFee.toLocaleString()}` : 'TBD at checkout'}</span>
                                </div>

                                <hr />

                                <div className="d-flex justify-content-between mb-4">
                                    <span className="fw-bold fs-5">Total Payment</span>
                                    <span className="fw-bold fs-5" style={{ color: '#4caf50' }}>₱{totalPayment.toLocaleString()}</span>
                                </div>

                                <button
                                    className="btn btn-primary w-100 py-2 fw-bold rounded-pill shadow-sm"
                                    style={{ background: 'var(--shop-pink)', border: 'none' }}
                                    onClick={() => {
                                        const selectedItems = cartItems.filter(item => item.selected);
                                        localStorage.setItem('checkoutItems', JSON.stringify(selectedItems));
                                        navigate('/customized-checkout');
                                    }}
                                    disabled={totalItems === 0}
                                >
                                    Proceed to Checkout
                                </button>
                                <Link to="/customized" className="btn btn-outline-secondary w-100 py-2 mt-2 rounded-pill">
                                    Create Another Bouquet
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomizedCart;