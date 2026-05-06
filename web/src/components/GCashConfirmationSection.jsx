import React from 'react';

const buildDefaultSteps = (amount) => {
    const numericAmount = Number(amount);
    return [
        'Open your GCash app and scan the Qr Ph code.',
        Number.isFinite(numericAmount) && numericAmount > 0
            ? `Send exactly ₱${numericAmount.toLocaleString()} to Jocerry's Flower Shop.`
            : 'Send the amount shown in your order or quote summary.',
        'Take a screenshot of the successful payment confirmation.',
        'Enter the GCash transaction number and upload the screenshot for manual verification.',
    ];
};

const GCashConfirmationSection = ({
    title = 'GCash Payment Confirmation',
    amount = null,
    onViewQr,
    referenceNumber,
    onReferenceNumberChange,
    receiptFile,
    receiptPreview,
    onReceiptUpload,
    onRemoveReceipt,
    helperText = 'Both the receipt image and transaction number are required before we can review your payment.',
    steps = null,
    receiptLabel = 'Upload Payment Receipt',
    receiptInputId = 'gcash-receipt-upload',
    referenceLabel = 'GCash Transaction Number',
    referencePlaceholder = 'Enter your transaction number',
    actionLabel = '',
    onAction = null,
    actionDisabled = false,
    actionLoading = false,
    actionVariant = 'primary',
    disabled = false,
}) => {
    const displaySteps = Array.isArray(steps) && steps.length ? steps : buildDefaultSteps(amount);
    const buttonClassName = actionVariant === 'danger' ? 'btn-danger' : 'btn-primary';

    return (
        <div className="p-3 rounded-4 border" style={{ backgroundColor: '#fff8fb', borderColor: '#f3bfd3' }}>
            <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
                <div>
                    <h6 className="fw-bold mb-1">
                        <i className="fas fa-wallet me-2" style={{ color: 'var(--shop-pink)' }}></i>
                        {title}
                    </h6>
                    <p className="text-muted small mb-0">
                        Follow the steps below, then submit your receipt and GCash transaction number for confirmation.
                    </p>
                </div>
                {typeof onViewQr === 'function' && (
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={onViewQr}
                        disabled={disabled}
                    >
                        <i className="fas fa-qrcode me-2"></i>
                        View Qr Ph code
                    </button>
                )}
            </div>

            {Number.isFinite(Number(amount)) && Number(amount) > 0 && (
                <div className="mb-3 px-3 py-2 rounded-3 d-inline-flex align-items-center gap-2" style={{ backgroundColor: '#ffe4ef', color: '#c2185b' }}>
                    <i className="fas fa-receipt"></i>
                    <span className="small fw-semibold">Amount to send: ₱{Number(amount).toLocaleString()}</span>
                </div>
            )}

            <ol className="small ps-3 mb-3">
                {displaySteps.map((step, index) => (
                    <li key={`${step}-${index}`} className="mb-1">{step}</li>
                ))}
            </ol>

            <div className="row g-3">
                <div className="col-md-6">
                    <label className="form-label fw-bold small mb-1">{referenceLabel}</label>
                    <input
                        type="text"
                        className="form-control form-control-sm"
                        value={referenceNumber}
                        onChange={(event) => onReferenceNumberChange?.(event.target.value)}
                        placeholder={referencePlaceholder}
                        disabled={disabled}
                    />
                    <small className="text-muted d-block mt-1">
                        Example: the transaction number shown in your GCash confirmation.
                    </small>
                </div>
                <div className="col-md-6">
                    <label className="form-label fw-bold small mb-1" htmlFor={receiptInputId}>{receiptLabel}</label>
                    <input
                        id={receiptInputId}
                        type="file"
                        className="form-control form-control-sm"
                        accept="image/*"
                        onChange={onReceiptUpload}
                        disabled={disabled}
                    />
                    {receiptFile && (
                        <div className="text-muted small mt-1">
                            <i className="fas fa-check-circle text-success me-1"></i>
                            File selected: {receiptFile.name}
                        </div>
                    )}
                </div>
            </div>

            {receiptPreview && (
                <div className="mt-3">
                    <img
                        src={receiptPreview}
                        alt="Receipt Preview"
                        style={{
                            maxWidth: '100%',
                            maxHeight: '220px',
                            borderRadius: '10px',
                            border: '1px solid #ddd',
                        }}
                    />
                    {typeof onRemoveReceipt === 'function' && (
                        <button
                            type="button"
                            className="btn btn-sm btn-link text-danger mt-2 p-0"
                            onClick={onRemoveReceipt}
                            disabled={disabled}
                        >
                            <i className="fas fa-times me-1"></i>Remove
                        </button>
                    )}
                </div>
            )}

            <small className="text-muted d-block mt-3">
                <i className="fas fa-info-circle me-1"></i>
                {helperText}
            </small>

            {typeof onAction === 'function' && actionLabel && (
                <button
                    type="button"
                    className={`btn ${buttonClassName} w-100 mt-3`}
                    style={actionVariant === 'danger' ? undefined : { background: 'var(--shop-pink)', borderColor: 'var(--shop-pink)' }}
                    onClick={onAction}
                    disabled={actionDisabled || disabled}
                >
                    {actionLoading ? (
                        <>
                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                            Processing...
                        </>
                    ) : actionLabel}
                </button>
            )}
        </div>
    );
};

export default GCashConfirmationSection;
