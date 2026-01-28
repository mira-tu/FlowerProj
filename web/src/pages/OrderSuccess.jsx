import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import '../styles/Shop.css';

const OrderSuccess = () => {
    const { orderNumber } = useParams();
    const [order, setOrder] = useState(null);

    useEffect(() => {
        const orders = JSON.parse(localStorage.getItem('orders') || '[]');
        const foundOrder = orders.find(o => o.order_number === orderNumber);
        setOrder(foundOrder);
    }, [orderNumber]);

    return (
        <div className="checkout-container">
            <div className="container">
                <div className="row justify-content-center">
                    <div className="col-lg-6">
                        <div className="checkout-section text-center py-5">
                            <div className="mb-4">
                                <div 
                                    style={{
                                        width: '100px',
                                        height: '100px',
                                        borderRadius: '50%',
                                        background: '#e8f5e9',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        margin: '0 auto'
                                    }}
                                >
                                    <i className="fas fa-check fa-3x text-success"></i>
                                </div>
                            </div>
                            
                            <h2 className="fw-bold mb-3">Order Placed Successfully!</h2>
                            <p className="text-muted mb-4">
                                Thank you for your order. We're preparing your beautiful flowers with love!
                            </p>

                            <div 
                                className="p-4 rounded mb-4"
                                style={{ background: 'var(--shop-pink-light)' }}
                            >
                                <div className="mb-2">
                                    <small className="text-muted">Order Number</small>
                                    <h4 className="fw-bold mb-0" style={{ color: 'var(--shop-pink)' }}>
                                        {orderNumber}
                                    </h4>
                                </div>
                                {order && (
                                    <>
                                        <div className="mt-3">
                                            <small className="text-muted">Total Amount</small>
                                            <h5 className="fw-bold mb-0">₱{order.total?.toLocaleString()}</h5>
                                        </div>
                                        {order.payment?.id === 'gcash' && order.receipt && (
                                            <div className="mt-3 pt-3 border-top">
                                                <small className="text-muted d-block mb-2">
                                                    <i className="fas fa-receipt me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                                    Payment Receipt
                                                </small>
                                                <div className="text-center">
                                                    <img 
                                                        src={order.receipt} 
                                                        alt="Payment Receipt" 
                                                        style={{ 
                                                            maxWidth: '100%', 
                                                            maxHeight: '300px', 
                                                            borderRadius: '8px',
                                                            border: '2px solid var(--shop-pink)',
                                                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                                        }}
                                                    />
                                                </div>
                                                <small className="text-muted d-block mt-2 text-center">
                                                    Your GCash payment receipt has been received
                                                </small>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="mb-4">
                                <h6 className="fw-bold mb-3">What's Next?</h6>
                                <div className="d-flex justify-content-center gap-4 text-center">
                                    <div>
                                        <div 
                                            className="rounded-circle mb-2 mx-auto d-flex align-items-center justify-content-center"
                                            style={{ 
                                                width: '50px', 
                                                height: '50px', 
                                                background: 'var(--shop-pink-light)',
                                                color: 'var(--shop-pink)'
                                            }}
                                        >
                                            <i className="fas fa-envelope"></i>
                                        </div>
                                        <small>Confirmation<br/>Email</small>
                                    </div>
                                    <div>
                                        <div 
                                            className="rounded-circle mb-2 mx-auto d-flex align-items-center justify-content-center"
                                            style={{ 
                                                width: '50px', 
                                                height: '50px', 
                                                background: 'var(--shop-pink-light)',
                                                color: 'var(--shop-pink)'
                                            }}
                                        >
                                            <i className="fas fa-box"></i>
                                        </div>
                                        <small>Order<br/>Preparation</small>
                                    </div>
                                    <div>
                                        <div 
                                            className="rounded-circle mb-2 mx-auto d-flex align-items-center justify-content-center"
                                            style={{ 
                                                width: '50px', 
                                                height: '50px', 
                                                background: 'var(--shop-pink-light)',
                                                color: 'var(--shop-pink)'
                                            }}
                                        >
                                            <i className="fas fa-truck"></i>
                                        </div>
                                        <small>Delivery<br/>Updates</small>
                                    </div>
                                </div>
                            </div>

                            <div className="d-flex gap-3 justify-content-center flex-wrap">
                                <Link to={`/order-tracking/${orderNumber}`} className="btn-buy-now px-4">
                                    <i className="fas fa-shipping-fast me-2"></i>Track Order
                                </Link>
                                <Link to="/" className="btn-add-to-cart px-4">
                                    <i className="fas fa-shopping-bag me-2"></i>Continue Shopping
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderSuccess;
