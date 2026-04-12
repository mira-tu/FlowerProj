import React from 'react';
import qrCodeImage from '../assets/qr-code-1.jpg';

const GCashQrModal = ({
    visible,
    onClose,
    amount = null,
    title = 'GCash QR Code',
}) => {
    if (!visible) {
        return null;
    }

    return (
        <div
            className="modal-overlay"
            onClick={(event) => {
                event.stopPropagation();
                onClose?.();
            }}
        >
            <div
                className="modal-content-custom"
                onClick={(event) => event.stopPropagation()}
                style={{ maxWidth: '400px' }}
            >
                <div className="modal-header-custom">
                    <h4>{title}</h4>
                    <button
                        className="modal-close"
                        onClick={(event) => {
                            event.stopPropagation();
                            onClose?.();
                        }}
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <div className="modal-body-custom text-center">
                    <div
                        className="mx-auto mb-3 p-2 bg-white"
                        style={{
                            width: '250px',
                            border: '2px solid #e0e0e0',
                            borderRadius: '12px',
                        }}
                    >
                        <img
                            src={qrCodeImage}
                            alt="GCash QR"
                            className="img-fluid rounded-3"
                        />
                    </div>
                    <div className="alert alert-info small mb-0">
                        Scan this QR using GCash, then upload your receipt and transaction number in the payment confirmation section.
                        {Number.isFinite(Number(amount)) && Number(amount) > 0 && (
                            <div className="fw-bold mt-2">
                                Amount to send: ₱{Number(amount).toLocaleString()}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GCashQrModal;
