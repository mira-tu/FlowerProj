import React, { useState } from 'react';
import GCashConfirmationSection from './GCashConfirmationSection';
import GCashQrModal from './GCashQrModal';
import { normalizeAdditionalReceiptEntries } from '../utils/gcashPayments';

const formatReferenceLabel = (value) => {
    const trimmed = String(value || '').trim();
    return trimmed || 'Not provided';
};

const TrackingPaymentDetails = ({
    paymentMethod,
    paymentStatus,
    totalAmount,
    amountPaid,
    receiptUrl,
    gcashReferenceNumber,
    additionalReceipts,
    onUploadReceipt,
    uploadingReceipt,
    additionalFile,
    setAdditionalFile,
    uploadReferenceNumber,
    setUploadReferenceNumber,
    shippingFee,
}) => {
    const [showQR, setShowQR] = useState(false);

    if (paymentMethod?.toLowerCase() !== 'gcash') return null;

    const numericTotal = Number(totalAmount || 0);
    const numericPaid = Number(amountPaid || 0);
    const numericShippingFee = Number(shippingFee || 0);
    const balance = Math.max(0, numericTotal - numericPaid);
    const normalizedReceipts = normalizeAdditionalReceiptEntries(additionalReceipts);
    const hasMainReceipt = Boolean(receiptUrl);
    const hasAnyReceipt = hasMainReceipt || normalizedReceipts.length > 0;

    const renderReceiptRow = (label, url, referenceNumber) => (
        <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap p-2 border rounded-3 bg-white" key={`${label}-${url}`}>
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-outline-primary rounded-pill"
            >
                <i className="fas fa-image me-1"></i>{label}
            </a>
            <div className="small text-muted">
                <span className="fw-semibold">Transaction No.:</span> {formatReferenceLabel(referenceNumber)}
            </div>
        </div>
    );

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
                {(numericPaid > 0 || numericTotal > 0) && (
                    <div className="mb-3 p-2 bg-light rounded shadow-sm border">
                        <div className="d-flex justify-content-between mb-1">
                            <span className="small text-muted">Item Price:</span>
                            <span className="fw-bold">₱{Math.max(0, numericTotal - numericShippingFee).toLocaleString()}</span>
                        </div>
                        {numericShippingFee > 0 && (
                            <div className="d-flex justify-content-between mb-1">
                                <span className="small text-muted">Delivery Fee:</span>
                                <span className="fw-bold">₱{numericShippingFee.toLocaleString()}</span>
                            </div>
                        )}
                        <div className="d-flex justify-content-between mb-1 pt-1 border-top mt-1">
                            <span className="fw-bold">Total Amount:</span>
                            <span className="fw-bold">₱{numericTotal.toLocaleString()}</span>
                        </div>
                        <div className="d-flex justify-content-between mb-1 pt-1 border-top mt-1">
                            <span className="small text-muted">Amount Paid:</span>
                            <span className="fw-bold text-success">₱{numericPaid.toLocaleString()}</span>
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
                                <strong>Partial Payment Detected.</strong> Your payment is lacking ₱{balance.toLocaleString()}. Please upload an additional receipt and its transaction number to cover the remaining balance.
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
                            <i className="fas fa-qrcode me-1"></i>View QR PH Code
                        </button>
                    </div>
                    <div className="d-flex flex-column gap-2">
                        {hasMainReceipt && renderReceiptRow('Main Receipt', receiptUrl, gcashReferenceNumber)}
                        {normalizedReceipts.map((receipt, index) => (
                            renderReceiptRow(`Receipt ${index + 2}`, receipt.url, receipt.reference_number)
                        ))}
                        {!hasAnyReceipt && (
                            <span className="text-muted small fst-italic">No receipts uploaded yet.</span>
                        )}
                    </div>
                </div>

                {!hasMainReceipt && (
                    <GCashConfirmationSection
                        title="Submit Your GCash Payment"
                        amount={numericTotal}
                        onViewQr={() => setShowQR(true)}
                        referenceNumber={uploadReferenceNumber}
                        onReferenceNumberChange={setUploadReferenceNumber}
                        receiptFile={additionalFile}
                        receiptPreview={null}
                        onReceiptUpload={(event) => setAdditionalFile(event.target.files?.[0] || null)}
                        onRemoveReceipt={() => setAdditionalFile(null)}
                        receiptInputId="tracking-main-gcash-receipt"
                        helperText="We will review this e-wallet payment manually. Please upload the receipt screenshot and the exact transaction number."
                        actionLabel="Upload Receipt"
                        onAction={onUploadReceipt}
                        actionDisabled={!additionalFile || !String(uploadReferenceNumber || '').trim() || uploadingReceipt}
                        actionLoading={uploadingReceipt}
                        disabled={uploadingReceipt}
                    />
                )}

                {paymentStatus === 'waiting_for_confirmation' && (
                    <div className="alert alert-secondary py-2 mb-0 border-0 shadow-sm mt-3" style={{ backgroundColor: '#F3F4F6' }}>
                        <div className="d-flex align-items-center">
                            <i className="fas fa-clock text-secondary me-2"></i>
                            <div className="small text-secondary">
                                <strong>Verifying Receipt.</strong> We are currently reviewing your uploaded receipt. You will be notified once confirmed.
                            </div>
                        </div>
                    </div>
                )}

                {hasMainReceipt && paymentStatus === 'partial' && balance > 0 && (
                    <div className="mt-3">
                        <GCashConfirmationSection
                            title="Upload Remaining Balance Receipt"
                            amount={balance}
                            onViewQr={() => setShowQR(true)}
                            referenceNumber={uploadReferenceNumber}
                            onReferenceNumberChange={setUploadReferenceNumber}
                            receiptFile={additionalFile}
                            receiptPreview={null}
                            onReceiptUpload={(event) => setAdditionalFile(event.target.files?.[0] || null)}
                            onRemoveReceipt={() => setAdditionalFile(null)}
                            receiptInputId="tracking-balance-gcash-receipt"
                            helperText="Each balance upload needs its own e-wallet transaction number so staff can verify it separately."
                            actionLabel="Upload Balance Receipt"
                            onAction={onUploadReceipt}
                            actionDisabled={!additionalFile || !String(uploadReferenceNumber || '').trim() || uploadingReceipt}
                            actionLoading={uploadingReceipt}
                            disabled={uploadingReceipt}
                        />
                    </div>
                )}
            </div>

            <GCashQrModal
                visible={showQR}
                onClose={() => setShowQR(false)}
                amount={hasMainReceipt && paymentStatus === 'partial' && balance > 0 ? balance : numericTotal}
            />
        </div>
    );
};

export default TrackingPaymentDetails;
