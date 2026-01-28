import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Shop.css';

const BookingCart = ({ user }) => {
    const navigate = useNavigate();
    const [inquiryItem, setInquiryItem] = useState(null);

    useEffect(() => {
        const savedInquiry = localStorage.getItem('bookingInquiry');
        if (savedInquiry) {
            setInquiryItem(JSON.parse(savedInquiry));
        } else {
            navigate('/');
        }
    }, [navigate]);

    const getOriginPage = () => {
        return inquiryItem?.requestData?.type === 'booking' ? '/book-event' : '/special-order';
    };

    const handleCancel = () => {
        localStorage.removeItem('bookingInquiry');
        navigate(getOriginPage());
    };

    const handleEdit = () => {
        navigate(getOriginPage());
    };

    const handleProceedToCheckout = () => {
        navigate('/booking-checkout');
    };

    if (!inquiryItem) {
        return (
            <div className="container py-5 mt-5 text-center">
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
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
                    <div className="card border-0 shadow-sm mb-3">
                        <div className="card-body">
                            <div className="row align-items-center g-0">
                                <div className="col-md-5 d-flex align-items-center mb-3 mb-md-0">
                                    <img
                                        src={inquiryItem.image || 'https://via.placeholder.com/80'}
                                        alt={inquiryItem.name}
                                        className="rounded"
                                        style={{ width: '80px', height: '80px', objectFit: 'cover' }}
                                        onError={(e) => e.target.src = 'https://via.placeholder.com/80'}
                                    />
                                    <div className="ms-3">
                                        <h6 className="mb-0 fw-bold">{inquiryItem.name}</h6>
                                        <small className="text-muted">
                                            {inquiryItem.requestData.type === 'booking' ? 'Event Booking' : 'Special Order'}
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
                                        onClick={handleCancel}
                                        title="Cancel and start over"
                                    >
                                        <i className="fas fa-trash-alt"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="col-lg-4">
                    <div className="card border-0 shadow-sm position-sticky" style={{ top: '100px' }}>
                        <div className="card-body">
                            <h5 className="fw-bold mb-3">Inquiry Summary</h5>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Total Items</span>
                                <span>1</span>
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
                                Edit Inquiry
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BookingCart;