import React, { useEffect, useMemo, useState } from 'react';
import qrCodeImage from '../assets/qr-code-1.jpg';
import { supabase } from '../config/supabase';

const resolveRequestId = (order = {}) => {
    const rawId = order?.request_id
        || order?.requestId
        || order?.id
        || null;

    if (typeof rawId === 'string' && rawId.startsWith('request-')) {
        return rawId.replace(/^request-/, '');
    }

    return rawId;
};

const CustomOrderQuotePaymentModal = ({
    visible,
    order,
    userId,
    onClose,
    onSuccess,
    onError,
}) => {
    const [receiptFile, setReceiptFile] = useState(null);
    const [receiptPreview, setReceiptPreview] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const requestId = useMemo(() => resolveRequestId(order), [order]);
    const requestNumber = order?.request_number || order?.requestNumber || requestId || '';
    const paymentAmount = Number(order?.total || order?.finalPrice || 0);

    useEffect(() => {
        if (!visible) {
            setReceiptFile(null);
            setReceiptPreview(null);
            setIsProcessing(false);
            setErrorMessage('');
        }
    }, [visible, order]);

    if (!visible || !order) {
        return null;
    }

    const handleReceiptUpload = (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            setReceiptFile(null);
            setReceiptPreview(null);
            return;
        }

        setReceiptFile(file);
        setErrorMessage('');
        const reader = new FileReader();
        reader.onloadend = () => {
            setReceiptPreview(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const handleClose = () => {
        if (isProcessing) {
            return;
        }

        setReceiptFile(null);
        setReceiptPreview(null);
        setErrorMessage('');
        onClose?.();
    };

    const handleSubmit = async () => {
        if (!receiptFile) {
            setErrorMessage('Please upload your payment receipt before confirming.');
            return;
        }

        if (!requestId) {
            const nextMessage = 'This request could not be identified for payment.';
            setErrorMessage(nextMessage);
            onError?.(new Error(nextMessage));
            return;
        }

        setIsProcessing(true);
        setErrorMessage('');

        try {
            let nextUserId = userId;
            if (!nextUserId) {
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                if (sessionError) throw sessionError;
                nextUserId = session?.user?.id || null;
            }

            if (!nextUserId) {
                throw new Error('Please sign in again before submitting your payment.');
            }

            const fileExt = receiptFile.name.split('.').pop();
            const fileName = `${nextUserId}-request-${requestId}-${Date.now()}.${fileExt}`;
            const filePath = `public/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('receipts')
                .upload(filePath, receiptFile);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('receipts')
                .getPublicUrl(filePath);

            if (!urlData?.publicUrl) {
                throw new Error('Could not retrieve the uploaded receipt URL.');
            }

            const { error: updateError } = await supabase
                .from('requests')
                .update({
                    status: 'accepted',
                    payment_status: 'waiting_for_confirmation',
                    receipt_url: urlData.publicUrl,
                })
                .eq('id', requestId);

            if (updateError) throw updateError;

            const { data: updatedRequest, error: updatedRequestError } = await supabase
                .from('requests')
                .select('*')
                .eq('id', requestId)
                .single();

            if (updatedRequestError) throw updatedRequestError;

            setReceiptFile(null);
            setReceiptPreview(null);
            if (onSuccess) {
                await onSuccess(updatedRequest);
            }
            onClose?.();
        } catch (error) {
            console.error('Error submitting custom order quote payment:', error);
            setErrorMessage(error.message || 'There was an error submitting your payment.');
            onError?.(error);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal-content-custom" onClick={(event) => event.stopPropagation()} style={{ maxWidth: '400px' }}>
                <div className="modal-header-custom">
                    <h4>GCash Payment</h4>
                    <button className="modal-close" disabled={isProcessing} onClick={handleClose}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <div className="modal-body-custom text-center">
                    <p>Please scan the QR code to pay for request #{requestNumber}.</p>
                    <div className="mb-3">
                        <img
                            src={qrCodeImage}
                            alt="GCash QR Code"
                            style={{ width: '100%', height: 'auto', maxWidth: '250px', margin: '0 auto', borderRadius: '10px' }}
                        />
                    </div>
                    <div className="p-3 rounded mb-3" style={{ background: '#f8f9fa' }}>
                        <h6 className="fw-bold mb-2">Payment Instructions:</h6>
                        <ol className="text-start small" style={{ paddingLeft: '20px' }}>
                            <li>Open your GCash app and tap "Scan QR".</li>
                            <li>Scan this QR code.</li>
                            <li>Enter the amount: <strong>₱{paymentAmount.toLocaleString()}</strong></li>
                            <li>Complete the payment and take a screenshot.</li>
                            <li>Upload the screenshot below for confirmation.</li>
                        </ol>
                    </div>

                    <div className="mt-3">
                        <label className="form-label fw-bold small">
                            <i className="fas fa-receipt me-2" style={{ color: 'var(--shop-pink)' }}></i>
                            Upload Payment Receipt
                        </label>
                        <input
                            type="file"
                            className="form-control form-control-sm"
                            accept="image/*"
                            onChange={handleReceiptUpload}
                            disabled={isProcessing}
                        />
                        {receiptPreview && (
                            <div className="mt-2">
                                <img src={receiptPreview} alt="Receipt Preview" style={{ maxWidth: '100px', maxHeight: '100px', borderRadius: '8px' }} />
                            </div>
                        )}
                        {errorMessage && (
                            <div className="mt-2 small text-danger fw-medium">
                                {errorMessage}
                            </div>
                        )}
                    </div>

                    <button
                        className="btn w-100 mt-3"
                        style={{ background: 'var(--shop-pink)', color: 'white' }}
                        onClick={handleSubmit}
                        disabled={isProcessing || !receiptFile}
                    >
                        {isProcessing ? (
                            <>
                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                Submitting...
                            </>
                        ) : 'Submit for Confirmation'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CustomOrderQuotePaymentModal;
