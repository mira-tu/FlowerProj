import React from 'react';
import {
    getRefundStatusLabel,
    maskGcashNumber,
} from '../utils/refundWorkflows';

const RefundRequestPanel = ({
    refundRequest,
    canRequestRefund = false,
    eligibleRefundAmount = 0,
    onOpenRequestModal,
    compact = false,
    onViewDetails,
    viewDetailsLabel = 'Track Refund',
    gcashName = '',
    onGcashNameChange,
    gcashNumber = '',
    onGcashNumberChange,
    onSubmitRefundDetails,
    submittingRefundDetails = false,
}) => {
    if (!refundRequest && !canRequestRefund) {
        return null;
    }

    const showRefundGcashForm = String(refundRequest?.status || '').trim().toLowerCase() === 'approved';

    if (compact) {
        return (
            <div className="mt-3 pt-3 border-top">
                <div className="rounded-4 p-3" style={{ backgroundColor: '#FFF7FB', border: '1px solid #FBCFE8' }}>
                    <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                        <div>
                            <div className="fw-bold" style={{ color: '#111827' }}>
                                <i className="fas fa-rotate-left me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                Refund
                            </div>
                            <div className="small text-muted">
                                {refundRequest
                                    ? `Status: ${getRefundStatusLabel(refundRequest.status)}`
                                    : `Refund available for your cancelled item${eligibleRefundAmount > 0 ? `s: PHP ${Number(eligibleRefundAmount).toLocaleString()}` : 's'}.`}
                            </div>
                        </div>
                        <div className="d-flex gap-2 flex-wrap">
                            {refundRequest ? (
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={onViewDetails}
                                >
                                    {viewDetailsLabel}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="btn btn-sm"
                                    style={{ background: 'var(--shop-pink)', color: '#fff' }}
                                    onClick={onOpenRequestModal}
                                >
                                    Request Refund
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="tracking-items p-4 rounded-4 shadow-sm bg-white mb-4">
            <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
                <div>
                    <h5 className="fw-bold mb-1">
                        <i className="fas fa-rotate-left me-2" style={{ color: 'var(--shop-pink)' }}></i>
                        Refund Request
                    </h5>
                    <p className="text-muted mb-0">
                        Admin approval is required first. Once approved, you can submit your GCash details here for the refund.
                    </p>
                </div>
                {refundRequest && (
                    <span className="badge rounded-pill px-3 py-2" style={{ backgroundColor: '#FCE7F3', color: '#BE185D' }}>
                        {getRefundStatusLabel(refundRequest.status)}
                    </span>
                )}
            </div>

            {refundRequest ? (
                <>
                    <div className="row g-3 mb-3">
                        <div className="col-md-6">
                            <div className="small text-muted">Requested Amount</div>
                            <div className="fw-semibold">PHP {Number(refundRequest.refund_amount || 0).toLocaleString()}</div>
                        </div>
                        <div className="col-md-6">
                            <div className="small text-muted">Reason</div>
                            <div className="fw-semibold" style={{ whiteSpace: 'pre-line' }}>
                                {refundRequest.customer_reason}
                            </div>
                        </div>
                        {refundRequest.admin_note && (
                            <div className="col-12">
                                <div className="small text-muted">Admin Note</div>
                                <div className="fw-semibold">{refundRequest.admin_note}</div>
                            </div>
                        )}
                        {refundRequest.rejection_reason && (
                            <div className="col-12">
                                <div className="small text-muted">Decision</div>
                                <div className="text-danger fw-semibold">{refundRequest.rejection_reason}</div>
                            </div>
                        )}
                        {(refundRequest.gcash_name || refundRequest.gcash_number) && (
                            <>
                                <div className="col-md-6">
                                    <div className="small text-muted">GCash Account Name</div>
                                    <div className="fw-semibold">{refundRequest.gcash_name || 'Not submitted'}</div>
                                </div>
                                <div className="col-md-6">
                                    <div className="small text-muted">GCash Number</div>
                                    <div className="fw-semibold">{maskGcashNumber(refundRequest.gcash_number)}</div>
                                </div>
                            </>
                        )}
                        {refundRequest.refund_reference && (
                            <div className="col-12">
                                <div className="small text-muted">Refund Reference</div>
                                <div className="fw-semibold">{refundRequest.refund_reference}</div>
                            </div>
                        )}
                    </div>

                    {showRefundGcashForm && (
                        <div className="border rounded-4 p-3" style={{ backgroundColor: '#FFF7FB', borderColor: '#FBCFE8' }}>
                            <h6 className="fw-bold mb-2">Submit Your GCash Details</h6>
                            <p className="text-muted small mb-3">
                                Your refund was approved. Submit the account details where you want the refund sent.
                            </p>
                            <div className="mb-3">
                                <label className="form-label">GCash Account Name</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={gcashName}
                                    onChange={(event) => onGcashNameChange?.(event.target.value)}
                                    placeholder="Enter your full GCash account name"
                                />
                            </div>
                            <div className="mb-3">
                                <label className="form-label">GCash Number</label>
                                <input
                                    type="tel"
                                    className="form-control"
                                    value={gcashNumber}
                                    onChange={(event) => onGcashNumberChange?.(event.target.value)}
                                    placeholder="09XXXXXXXXX"
                                />
                            </div>
                            <button
                                type="button"
                                className="btn"
                                style={{ background: 'var(--shop-pink)', color: '#fff' }}
                                onClick={onSubmitRefundDetails}
                                disabled={submittingRefundDetails}
                            >
                                {submittingRefundDetails ? 'Submitting...' : 'Submit GCash Details'}
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap">
                    <div>
                        <div className="small text-muted">Eligible refund amount</div>
                        <div className="fw-semibold">PHP {Number(eligibleRefundAmount || 0).toLocaleString()}</div>
                    </div>
                    <button
                        type="button"
                        className="btn"
                        style={{ background: 'var(--shop-pink)', color: '#fff' }}
                        onClick={onOpenRequestModal}
                    >
                        Request Refund
                    </button>
                </div>
            )}
        </div>
    );
};

export default RefundRequestPanel;
