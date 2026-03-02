import React from 'react';
import { Link } from 'react-router-dom';

const Privacy = () => {
    return (
        <div className="container py-5 mt-5">
            <div className="row justify-content-center">
                <div className="col-lg-8">
                    <h1 className="mb-4 text-center" style={{ color: '#E83E8C', fontWeight: 'bold' }}>Privacy Policy</h1>
                    <div className="card shadow-sm border-0 p-4 p-md-5 rounded-4 bg-white">
                        <div className="card-body">
                            <p className="text-muted mb-4 pb-3 border-bottom">Last Updated: {new Date().toLocaleDateString()}</p>

                            <h4 className="mb-3 text-dark fw-bold">1. Information We Collect</h4>
                            <p className="mb-4 text-muted" style={{ lineHeight: '1.8' }}>
                                We collect personal information that you voluntarily provide to us when you register on the website, express an interest in obtaining information about our products/services, or when you participate in activities on the site (such as purchasing floral arrangements or communicating with us). This includes your contact details (name, email, phone number) and delivery addresses.
                            </p>

                            <h4 className="mb-3 text-dark fw-bold">2. How We Use Your Information</h4>
                            <p className="mb-4 text-muted" style={{ lineHeight: '1.8' }}>
                                We use personal information collected via our website for a variety of business purposes, primarily to fulfill orders, process payments, and communicate with you effectively regarding your floral journey. We may also send critical updates about the status of your orders.
                            </p>

                            <h4 className="mb-3 text-dark fw-bold">3. Information Sharing</h4>
                            <p className="mb-4 text-muted" style={{ lineHeight: '1.8' }}>
                                We do not sell your personal data. We only share essential information with our trusted partners, such as payment gateways (e.g., GCash integration) and third-party delivery dispatch riders, strictly for logistical delivery purposes and order fulfillment.
                            </p>

                            <h4 className="mb-3 text-dark fw-bold">4. Data Security</h4>
                            <p className="mb-4 text-muted" style={{ lineHeight: '1.8' }}>
                                We have implemented appropriate technical security measures designed to protect the security of any personal information we process. All user account details and order records are securely persisted into our backend infrastructure and stored safely.
                            </p>

                            <h4 className="mb-3 text-dark fw-bold">5. Your Privacy Rights</h4>
                            <p className="mb-4 text-muted" style={{ lineHeight: '1.8' }}>
                                Subject to certain exceptions resulting from our legal obligations, you generally have the right to request access to the personal information we collect from you, change that information, or request deletion under certain circumstances. Please contact our support team to exercise these rights.
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

export default Privacy;
