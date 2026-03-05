import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Shop.css';

const BookingCart = ({ user }) => {
    const navigate = useNavigate();
    const [inquiryItems, setInquiryItems] = useState([]);

    useEffect(() => {
        const cartKey = `bookingCart_${user?.id || 'guest'}`;
        const savedInquiry = localStorage.getItem(cartKey) || localStorage.getItem('bookingCart');
        if (savedInquiry) {
            setInquiryItems(JSON.parse(savedInquiry));
        } else {
            navigate('/');
        }
    }, [navigate, user]);

    const getOriginPage = () => {
        return '/book-event';
    };

    const handleRemoveItem = (id) => {
        const updatedItems = inquiryItems.filter(item => item.id !== id);
        const cartKey = `bookingCart_${user?.id || 'guest'}`;

        if (updatedItems.length === 0) {
            localStorage.removeItem(cartKey);
            navigate(getOriginPage());
        } else {
            setInquiryItems(updatedItems);
            localStorage.setItem(cartKey, JSON.stringify(updatedItems));
        }
    };

    const handleEdit = () => {
        navigate(getOriginPage());
    };

    const handleProceedToCheckout = () => {
        navigate('/booking-checkout');
    };

    if (!inquiryItems || inquiryItems.length === 0) {
        return (
            <div className="container py-5 mt-5 text-center">
                <h5>Your Custom Order cart is empty.</h5>
                <button className="btn btn-pink mt-3" onClick={() => navigate(getOriginPage())}>Return to Booking</button>
            </div>
        );
    }

    return (
        <div className="container py-5 mt-5 bg-light" style={{ minHeight: '80vh', overflowX: 'hidden' }}>
            <h2 className="fw-bold mb-4"><i className="fas fa-file-invoice me-2"></i> Confirm Your Inquiry</h2>

            <div className="row g-4">
                <div className="col-lg-8">
                    {/* Inquiry Cart Header */}
                    <div className="card border-0 shadow-sm mb-3 d-none d-md-block">
                        <div className="card-body py-2" style={{ overflowX: 'auto' }}>
                            <div className="row align-items-center text-muted small fw-bold text-uppercase g-0">
                                <div className="col-5">Product</div>
                                <div className="col-2 text-center">Price</div>
                                <div className="col-2 text-center">Quantity</div>
                                <div className="col-2 text-center">Total Price</div>
                                <div className="col-1 text-center" style={{ whiteSpace: 'nowrap' }}>Action</div>
                            </div>
                        </div>
                    </div>

                    {inquiryItems.map((item) => (
                        <div key={item.id} className="card border-0 shadow-sm mb-3">
                            <div className="card-body">
                                <div className="row align-items-center g-0">
                                    <div className="col-md-5 d-flex align-items-center mb-3 mb-md-0">
                                        <img
                                            src={item.inspirationImageBase64 || 'https://via.placeholder.com/80?text=No+Ref'}
                                            alt={item.serviceType}
                                            className="rounded"
                                            style={{ width: '80px', height: '80px', objectFit: 'cover' }}
                                        />
                                        <div className="ms-3">
                                            <h6 className="mb-0 fw-bold">{item.occasion} - {item.arrangementType}</h6>
                                            <small className="text-muted">
                                                {item.serviceType}
                                            </small>
                                        </div>
                                    </div>
                                    <div className="col-md-2 text-center mb-2 mb-md-0">
                                        <span className="d-md-none text-muted small me-2">Price:</span>
                                        <span className="fw-bold">For Discussion</span>
                                    </div>
                                    <div className="col-md-2 text-center mb-2 mb-md-0">
                                        <span className="d-md-none text-muted small me-2">Quantity:</span>
                                        1
                                    </div>
                                    <div className="col-md-2 text-center fw-bold mb-2 mb-md-0" style={{ color: '#d63384' }}>
                                        <span className="d-md-none text-muted small me-2">Total:</span>
                                        For Discussion
                                    </div>
                                    <div className="col-md-1 text-center">
                                        <button
                                            className="btn btn-outline-danger btn-sm rounded-circle d-inline-flex align-items-center justify-content-center"
                                            style={{ width: '36px', height: '36px' }}
                                            onClick={() => handleRemoveItem(item.id)}
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
                            <h5 className="fw-bold mb-3">Inquiry Summary</h5>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Total Items</span>
                                <span>{inquiryItems.length}</span>
                            </div>
                            <hr />
                            <div className="d-flex justify-content-between mb-4">
                                <span className="fw-bold fs-5">Total Payment</span>
                                <span className="fw-bold fs-5" style={{ color: '#d63384' }}>For Discussion</span>
                            </div>
                            <button
                                className="btn btn-primary w-100 py-2 fw-bold rounded-pill shadow-sm"
                                style={{ background: 'var(--shop-pink)', border: 'none' }}
                                onClick={handleProceedToCheckout}
                            >
                                Proceed to Checkout
                            </button>
                            <button onClick={handleEdit} className="btn btn-outline-secondary w-100 py-2 mt-2 rounded-pill">
                                Add Another Inquiry
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BookingCart;