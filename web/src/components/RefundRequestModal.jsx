import React from 'react';

const modalOverlayStyle = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1050,
    padding: '1rem',
};

const modalCardStyle = {
    backgroundColor: 'white',
    width: 'min(100%, 32rem)',
    borderRadius: '1rem',
    boxShadow: '0 12px 40px rgba(15, 23, 42, 0.18)',
    overflow: 'hidden',
};

const RefundRequestModal = ({
    show,
    orderLabel = 'order',
    refundAmount = 0,
    refundReason = '',
    onRefundReasonChange,
    onClose,
    onSubmit,
    submitting = false,
}) => {
    if (!show) return null;

    return (
        <div style={modalOverlayStyle} onClick={onClose}>
            <div style={modalCardStyle} onClick={(event) => event.stopPropagation()}>
                <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid #F3F4F6' }}>
                    <h4 className="fw-bold mb-2">Request a refund now?</h4>
                    <p className="text-muted mb-0">
                        Your cancellation was saved. Because payment was already recorded, you can send a refund request for this {orderLabel} now.
                    </p>
                </div>

                <div style={{ padding: '1.5rem' }}>
                    <div className="rounded-4 p-3 mb-3" style={{ backgroundColor: '#FFF7FB', border: '1px solid #FBCFE8' }}>
                        <div className="small text-muted">Eligible refund amount</div>
                        <div className="fw-bold" style={{ color: 'var(--shop-pink)', fontSize: '1.15rem' }}>
                            PHP {Number(refundAmount || 0).toLocaleString()}
                        </div>
                    </div>

                    <div className="mb-0">
                        <label className="form-label fw-semibold">Refund reason</label>
                        <textarea
                            className="form-control"
                            rows="4"
                            value={refundReason}
                            onChange={(event) => onRefundReasonChange?.(event.target.value)}
                            placeholder="Tell us what happened so the admin can review your refund request."
                        />
                    </div>
                </div>

                <div style={{ padding: '1rem 1.5rem 1.5rem', borderTop: '1px solid #F3F4F6' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={onClose}
                        >
                            Not now
                        </button>
                        <button
                            type="button"
                            className="btn"
                            style={{ background: 'var(--shop-pink)', color: '#fff' }}
                            onClick={onSubmit}
                            disabled={submitting}
                        >
                            {submitting ? 'Submitting...' : 'Request Refund'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RefundRequestModal;
