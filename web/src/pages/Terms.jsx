import React from 'react';
import { Link } from 'react-router-dom';

const Terms = () => {
    return (
        <div className="container py-5 mt-5">
            <div className="row justify-content-center">
                <div className="col-lg-8">
                    <h1 className="mb-4 text-center" style={{ color: '#E83E8C', fontWeight: 'bold' }}>Terms of Service</h1>
                    <div className="card shadow-sm border-0 p-4 p-md-5 rounded-4 bg-white">
                        <div className="card-body">
                            <p className="text-muted mb-4 pb-3 border-bottom">Last Updated: {new Date().toLocaleDateString()}</p>

                            <h4 className="mb-3 text-dark fw-bold">1. Acceptance of Terms</h4>
                            <p className="mb-4 text-muted" style={{ lineHeight: '1.8' }}>
                                By accessing or using our website and services, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not access or use our services.
                            </p>

                            <h4 className="mb-3 text-dark fw-bold">2. User Accounts</h4>
                            <p className="mb-4 text-muted" style={{ lineHeight: '1.8' }}>
                                You are entirely responsible for maintaining the confidentiality of your account credentials. You must provide accurate, current, and complete information when registering for an account. We reserve the right to suspend or terminate accounts that provide false information.
                            </p>

                            <h4 className="mb-3 text-dark fw-bold">3. Orders and Payments</h4>
                            <p className="mb-4 text-muted" style={{ lineHeight: '1.8' }}>
                                All flower arrangements and custom requests are subject to availability. We reserve the right to substitute flowers of equal or greater value if certain materials are out of stock. Payments processed through our integrated providers (e.g., GCash) must be successfully verified before we begin order fulfillment.
                            </p>

                            <h4 className="mb-3 text-dark fw-bold">4. Delivery Obligations</h4>
                            <p className="mb-4 text-muted" style={{ lineHeight: '1.8' }}>
                                Deliveries are carried out by dedicated riders or authorized third-party logistics. While we strive to meet specific delivery slots, we cannot be held liable for unavoidable delays caused by severe weather, traffic, or other circumstances beyond our direct control.
                            </p>

                            <h4 className="mb-3 text-dark fw-bold">5. Cancellations, Modifications, & Refunds</h4>
                            <p className="mb-4 text-muted" style={{ lineHeight: '1.8' }}>
                                Event bookings and customized bouquets require adequate advance notice to modify or cancel. Approved refunds will be processed based on the timing of the cancellation relative to the scheduled arrangement block. Last-minute cancellations for perishable goods may not be refundable.
                            </p>

                            <div className="text-center mt-5 pt-3 border-top">
                                <Link to="/" className="btn shadow-sm" style={{ backgroundColor: '#E83E8C', color: 'white', borderRadius: '30px', padding: '12px 35px', fontWeight: '600' }}>
                                    Return to Home
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Terms;
