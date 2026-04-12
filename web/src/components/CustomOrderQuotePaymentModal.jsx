import React, { useEffect, useMemo, useState } from 'react';
import GCashConfirmationSection from './GCashConfirmationSection';
import GCashQrModal from './GCashQrModal';
import { supabase } from '../config/supabase';
import {
    normalizeGcashReferenceNumber,
    writeWithOptionalColumns,
} from '../utils/gcashPayments';

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
    const [gcashReferenceNumber, setGcashReferenceNumber] = useState('');
    const [showQRModal, setShowQRModal] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const requestId = useMemo(() => resolveRequestId(order), [order]);
    const requestNumber = order?.request_number || order?.requestNumber || requestId || '';
    const paymentAmount = Number(order?.total || order?.finalPrice || 0);

    useEffect(() => {
        if (!visible) {
            setReceiptFile(null);
            setReceiptPreview(null);
            setGcashReferenceNumber('');
            setShowQRModal(false);
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

    const clearReceiptSelection = () => {
        setReceiptFile(null);
        setReceiptPreview(null);
    };

    const handleClose = () => {
        if (isProcessing) {
            return;
        }

        setReceiptFile(null);
        setReceiptPreview(null);
        setGcashReferenceNumber('');
        setShowQRModal(false);
        setErrorMessage('');
        onClose?.();
    };

    const handleSubmit = async () => {
        const normalizedGcashReference = normalizeGcashReferenceNumber(gcashReferenceNumber);

        if (!receiptFile) {
            setErrorMessage('Please upload your payment receipt before confirming.');
            return;
        }

        if (!normalizedGcashReference) {
            setErrorMessage('Please enter your GCash transaction number before confirming.');
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

            const existingRequestData = (
                order?.requestData && typeof order.requestData === 'object'
                    ? order.requestData
                    : (order?.data && typeof order.data === 'object' ? order.data : {})
            );

            const nextRequestData = {
                ...existingRequestData,
                payment_status: 'waiting_for_confirmation',
                receipt_url: urlData.publicUrl,
                gcash_reference_number: normalizedGcashReference,
            };

            const { error: updateError } = await writeWithOptionalColumns({
                tableName: 'requests',
                initialPayload: {
                    status: 'accepted',
                    payment_status: 'waiting_for_confirmation',
                    receipt_url: urlData.publicUrl,
                    gcash_reference_number: normalizedGcashReference,
                    data: nextRequestData,
                },
                optionalColumns: ['gcash_reference_number'],
                execute: (payload) => (
                    supabase
                        .from('requests')
                        .update(payload)
                        .eq('id', requestId)
                ),
            });

            if (updateError) throw updateError;

            const { data: updatedRequest, error: updatedRequestError } = await supabase
                .from('requests')
                .select('*')
                .eq('id', requestId)
                .single();

            if (updatedRequestError) throw updatedRequestError;

            setReceiptFile(null);
            setReceiptPreview(null);
            setGcashReferenceNumber('');
            setShowQRModal(false);
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
            <div className="modal-content-custom" onClick={(event) => event.stopPropagation()} style={{ maxWidth: '420px' }}>
                <div className="modal-header-custom">
                    <h4>GCash Payment</h4>
                    <button className="modal-close" disabled={isProcessing} onClick={handleClose}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <div className="modal-body-custom">
                    <p className="text-muted mb-3">
                        Submit your proof of payment for request #{requestNumber}. We will manually confirm the receipt before the booking moves forward.
                    </p>

                    <GCashConfirmationSection
                        title="Confirm Your Custom Order Payment"
                        amount={paymentAmount}
                        onViewQr={() => setShowQRModal(true)}
                        referenceNumber={gcashReferenceNumber}
                        onReferenceNumberChange={setGcashReferenceNumber}
                        receiptFile={receiptFile}
                        receiptPreview={receiptPreview}
                        onReceiptUpload={handleReceiptUpload}
                        onRemoveReceipt={clearReceiptSelection}
                        receiptInputId="custom-order-quote-gcash-receipt"
                        helperText="We need both the screenshot and the GCash transaction number before we can mark this quote as paid for review."
                        actionLabel="Submit for Confirmation"
                        onAction={handleSubmit}
                        actionDisabled={isProcessing || !receiptFile || !normalizeGcashReferenceNumber(gcashReferenceNumber)}
                        actionLoading={isProcessing}
                        disabled={isProcessing}
                    />
                    {errorMessage && (
                        <div className="mt-3 small text-danger fw-medium">
                            {errorMessage}
                        </div>
                    )}
                </div>
            </div>
            <GCashQrModal
                visible={showQRModal}
                onClose={() => setShowQRModal(false)}
                amount={paymentAmount}
            />
        </div>
    );
};

export default CustomOrderQuotePaymentModal;
