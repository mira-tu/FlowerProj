import React, { useState } from 'react';
import qrCodeImage from '../assets/qr-code-1.jpg';

const TrackingPaymentDetails = ({
    paymentMethod,
    paymentStatus,
    totalAmount,
    amountPaid,
    receiptUrl,
    additionalReceipts,
    onUploadReceipt,
    uploadingReceipt,
    additionalFile,
    setAdditionalFile,
    shippingFee
}) => {
    const [showQR, setShowQR] = useState(false);

    if (paymentMethod?.toLowerCase() !== 'gcash') return null;

    const balance = totalAmount - (amountPaid || 0);

    return (
        <div className="card shadow-sm border-0 mb-4" style={{ borderRadius: '15px', overflow: 'hidden' }}>
            <div className="card-header bg-white border-0 pt-3 pb-0 px-3">
                <div className="d-flex justify-content-between align-items-center">
                    <h6 className="fw-bold mb-0">
                        <i className="fas fa-wallet me-2" style={{ color: 'var(--shop-pink)' }}></i>
                        GCash Payment Details
                    </h6>
                    <span className={`badge ${paymentStatus === 'paid' ? 'bg-success' : paymentStatus === 'partial' ? 'bg-warning text-dark' : 'bg-secondary'}`}>
                        {paymentStatus === 'partial' ? 'Partial Payment' : (paymentStatus?.replace(/_/g, ' ') || 'Waiting for Payment')}
                    </span>
                </div>
            </div>

            <div className="card-body p-3">
                {(amountPaid > 0 || totalAmount > 0) && (
                    <div className="mb-3 p-2 bg-light rounded shadow-sm border">
                        <div className="d-flex justify-content-between mb-1">
                            <span className="small text-muted">Item Price:</span>
                            <span className="fw-bold">₱{((totalAmount || 0) - (shippingFee || 0)).toLocaleString()}</span>
                        </div>
                        {shippingFee > 0 && (
                            <div className="d-flex justify-content-between mb-1">
                                <span className="small text-muted">Shipping Fee:</span>
                                <span className="fw-bold">₱{shippingFee.toLocaleString()}</span>
                            </div>
                        )}
                        <div className="d-flex justify-content-between mb-1 pt-1 border-top mt-1">
                            <span className="fw-bold">Total Amount:</span>
                            <span className="fw-bold">₱{totalAmount?.toLocaleString()}</span>
                        </div>
                        <div className="d-flex justify-content-between mb-1 pt-1 border-top mt-1">
                            <span className="small text-muted">Amount Paid:</span>
                            <span className="fw-bold text-success">₱{(amountPaid || 0).toLocaleString()}</span>
                        </div>
                        {balance > 0 ? (
                            <div className="d-flex justify-content-between pt-1 border-top mt-1">
                                <span className="fw-bold">Remaining Balance:</span>
                                <span className="fw-bold text-danger">₱{balance.toLocaleString()}</span>
                            </div>
                        ) : (
                            <div className="text-center mt-1 pt-1 border-top">
                                <span className="badge bg-success-light text-success w-100">Full Payment Received</span>
                            </div>
                        )}
                    </div>
                )}

                {paymentStatus === 'partial' && balance > 0 && (
                    <div className="alert alert-danger py-2 mb-3 border-0 shadow-sm" style={{ backgroundColor: '#FEF2F2', borderLeft: '4px solid #EF4444' }}>
                        <div className="d-flex align-items-center">
                            <i className="fas fa-exclamation-circle text-danger me-2"></i>
                            <div className="small text-danger">
                                <strong>Partial Payment Detected.</strong> Your payment is lacking ₱{balance.toLocaleString()}. Please upload an additional receipt to cover the remaining balance.
                            </div>
                        </div>
                    </div>
                )}

                <div className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                        <label className="form-label small fw-bold mb-0">Payment Receipts</label>
                        <button
                            className="btn btn-sm btn-link text-decoration-none p-0"
                            style={{ color: 'var(--shop-pink)', fontSize: '0.8rem' }}
                            onClick={() => setShowQR(true)}
                        >
                            <i className="fas fa-qrcode me-1"></i>View GCash QR
                        </button>
                    </div>
                    <div className="d-flex flex-wrap gap-2">
                        {receiptUrl && (
                            <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary rounded-pill">
                                <i className="fas fa-image me-1"></i>Main Receipt
                            </a>
                        )}
                        {additionalReceipts?.map((r, idx) => (
                            <a key={idx} href={r.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary rounded-pill">
                                <i className="fas fa-image me-1"></i>Receipt {idx + 2}
                            </a>
                        ))}
                        {!receiptUrl && (!additionalReceipts || additionalReceipts.length === 0) && (
                            <span className="text-muted small italic">No receipts uploaded yet.</span>
                        )}
                    </div>
                </div>

                {(!receiptUrl) && (
                    <div className="mt-3 p-2 rounded" style={{ backgroundColor: '#fdf2f8', border: '1px dashed var(--shop-pink)' }}>
                        <label className="form-label small fw-bold mb-1">Upload GCash Receipt</label>
                        <div className="input-group">
                            <input
                                type="file"
                                className="form-control form-control-sm"
                                accept="image/*"
                                onChange={(e) => setAdditionalFile(e.target.files[0])}
                            />
                            <button
                                className="btn btn-sm"
                                style={{ background: 'var(--shop-pink)', color: 'white' }}
                                onClick={onUploadReceipt}
                                disabled={!additionalFile || uploadingReceipt}
                            >
                                {uploadingReceipt ? (
                                    <span className="spinner-border spinner-border-sm"></span>
                                ) : (
                                    'Upload'
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Show waiting message whenever payment_status is waiting_for_confirmation */}
                {paymentStatus === 'waiting_for_confirmation' && (
                    <div className="alert alert-secondary py-2 mb-3 border-0 shadow-sm mt-3" style={{ backgroundColor: '#F3F4F6' }}>
                        <div className="d-flex align-items-center">
                            <i className="fas fa-clock text-secondary me-2"></i>
                            <div className="small text-secondary">
                                <strong>Verifying Receipt.</strong> We are currently reviewing your uploaded receipt. You will be notified once confirmed.
                            </div>
                        </div>
                    </div>
                )}

                {/* Upload block — shows only when admin has confirmed previous payment but balance remains */}
                {receiptUrl && paymentStatus === 'partial' && balance > 0 && (
                    <div className="mt-3 p-2 rounded" style={{ backgroundColor: '#fef2f2', border: '1px dashed #ef4444' }}>
                        <label className="form-label small fw-bold text-danger mb-1">Upload Additional Receipt for Balance</label>
                        <div className="input-group">
                            <input
                                type="file"
                                className="form-control form-control-sm border-danger"
                                accept="image/*"
                                onChange={(e) => setAdditionalFile(e.target.files[0])}
                            />
                            <button
                                className="btn btn-sm btn-danger"
                                onClick={onUploadReceipt}
                                disabled={!additionalFile || uploadingReceipt}
                            >
                                {uploadingReceipt ? (
                                    <span className="spinner-border spinner-border-sm"></span>
                                ) : (
                                    'Upload Balance Receipt'
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* QR Code Modal */}
            {showQR && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 9999
                }} onClick={() => setShowQR(false)}>
                    <div className="bg-white p-4 rounded-4 shadow-lg text-center" style={{ maxWidth: '350px', width: '90%' }} onClick={e => e.stopPropagation()}>
                        <div className="d-flex justify-content-between align-items-center mb-3">
                            <h5 className="fw-bold mb-0">GCash QR Code</h5>
                            <button className="btn-close" onClick={() => setShowQR(false)}></button>
                        </div>
                        <div className="p-2 border rounded-3 mb-3 bg-white">
                            <img src={qrCodeImage} alt="GCash QR" className="img-fluid rounded-2" />
                        </div>
                        <div className="alert alert-info py-2 small mb-0">
                            Scan this QR code using your GCash app and enter the amount needed.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TrackingPaymentDetails;
