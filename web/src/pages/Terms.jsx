import React from 'react';
import { Link } from 'react-router-dom';

const Terms = () => {
    return (
        <div className="container py-5 mt-5">
            <div className="row justify-content-center">
                <div className="col-lg-8">
                    <h1 className="mb-4 text-center" style={{ color: '#E83E8C', fontWeight: 'bold' }}>Terms & Agreement</h1>
                    <div className="card shadow-sm border-0 p-4 p-md-5 rounded-4 bg-white">
                        <div className="card-body">
                            <p className="text-muted mb-4 pb-3 border-bottom">Last Updated: {new Date().toLocaleDateString()}</p>

                            <h4 className="mb-3 text-dark fw-bold">Terms & Agreement</h4>
                            <p className="mb-4 text-muted" style={{ lineHeight: '1.8' }}>
                                By signing in or creating an account with Jocerry's Flowershop, you agree to follow our terms and conditions. Customers are required to provide correct and complete information when placing orders. All orders depend on product availability and confirmed payment. Delivery schedules may vary due to location or unexpected circumstances. Flower substitutions may be made if certain flowers are unavailable with customer consent, while keeping the design and value of the arrangement. Any personal information collected will only be used for processing orders and providing customer support.
                            </p>
                            <p className="mb-4 text-muted" style={{ lineHeight: '1.8' }}>
                                By continuing to use our services, you confirm that you accept these terms.
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
