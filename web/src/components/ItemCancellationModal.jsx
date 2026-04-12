import React from 'react';
import { getCancellationItemDisplayLabel } from '../utils/orderCancellation';

const modalOverlayStyle = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: '1rem',
};

const modalCardStyle = {
    backgroundColor: 'white',
    width: 'min(100%, 36rem)',
    maxHeight: 'min(85vh, 50rem)',
    borderRadius: '1rem',
    boxShadow: '0 12px 40px rgba(15, 23, 42, 0.18)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
};

const selectableItemStyle = (selected) => ({
    width: '100%',
    textAlign: 'left',
    borderRadius: '1rem',
    border: `1px solid ${selected ? 'var(--shop-pink)' : '#E5E7EB'}`,
    backgroundColor: selected ? '#FFF1F7' : '#FFFFFF',
    padding: '0.9rem 1rem',
    transition: 'border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease',
    boxShadow: selected ? '0 0 0 1px rgba(236, 72, 153, 0.12)' : 'none',
});

const quantityOptionStyle = (selected) => ({
    minWidth: '2.75rem',
    borderRadius: '9999px',
    border: `1px solid ${selected ? 'var(--shop-pink)' : '#D1D5DB'}`,
    backgroundColor: selected ? '#FFF1F7' : '#FFFFFF',
    color: selected ? '#BE185D' : '#111827',
    fontWeight: 600,
    padding: '0.55rem 0.9rem',
    cursor: 'pointer',
    transition: 'border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease',
});

const ItemCancellationModal = ({
    show,
    orderLabel = 'order',
    items = [],
    selectedItemKey = '',
    onSelectItem,
    selectedItem,
    cancelQuantity = 1,
    onCancelQuantityChange,
    cancelReason = '',
    onCancelReasonChange,
    reasonError = '',
    onClose,
    onConfirm,
    confirmLabel = 'Cancel Selected Quantity',
}) => {
    if (!show) return null;

    return (
        <div
            className="modal-overlay"
            onClick={onClose}
            style={modalOverlayStyle}
        >
            <div
                className="modal-content-custom"
                onClick={(event) => event.stopPropagation()}
                style={modalCardStyle}
            >
                <div style={{ padding: '1.75rem 1.5rem 1rem', borderBottom: '1px solid #F3F4F6', textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', color: '#dc3545', marginBottom: '0.75rem' }}>
                        <i className="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3 style={{ marginBottom: '0.75rem', color: '#111827' }}>
                        Cancel item from this {orderLabel}?
                    </h3>
                    <p style={{ marginBottom: 0, color: '#4B5563' }}>
                        Choose the item and quantity you want to cancel. We will keep the rest of your {orderLabel} active.
                    </p>
                </div>

                <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
                    <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
                        <label style={{ display: 'block', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                            Item to cancel
                        </label>
                        <div style={{ display: 'grid', gap: '0.75rem', maxHeight: '14rem', overflowY: 'auto', paddingRight: '0.25rem' }}>
                            {items.map((item) => {
                                const selected = item.cancellationKey === String(selectedItemKey);
                                return (
                                    <button
                                        key={item.cancellationKey}
                                        type="button"
                                        style={selectableItemStyle(selected)}
                                        onClick={() => onSelectItem?.(item.cancellationKey)}
                                    >
                                        <div style={{ fontWeight: 600, color: '#111827', lineHeight: 1.45, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                            {getCancellationItemDisplayLabel(item)}
                                        </div>
                                        <div style={{ marginTop: '0.35rem', color: '#6B7280', fontSize: '0.9rem' }}>
                                            {item.cancelledQuantity > 0
                                                ? `${item.cancelledQuantity} already cancelled`
                                                : `${item.remainingQuantity} ready to cancel`}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {selectedItem && (
                        <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
                            <label style={{ display: 'block', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
                                Quantity to cancel
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {Array.from({ length: selectedItem.remainingQuantity }, (_, index) => index + 1).map((quantity) => {
                                    const isSelected = Number(cancelQuantity) === quantity;
                                    return (
                                        <button
                                            key={quantity}
                                            type="button"
                                            onClick={() => onCancelQuantityChange?.(quantity)}
                                            style={quantityOptionStyle(isSelected)}
                                        >
                                            {quantity}
                                        </button>
                                    );
                                })}
                            </div>
                            <div style={{ marginTop: '0.5rem', color: '#6B7280', fontSize: '0.9rem' }}>
                                Remaining after this cancellation: {Math.max(0, selectedItem.remainingQuantity - cancelQuantity)} of {selectedItem.originalQuantity}
                            </div>
                        </div>
                    )}

                    <div style={{ textAlign: 'left' }}>
                        <label htmlFor="sharedCancelReason" style={{ display: 'block', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
                            Reason for cancellation
                        </label>
                        <textarea
                            id="sharedCancelReason"
                            value={cancelReason}
                            onChange={(event) => onCancelReasonChange?.(event.target.value)}
                            placeholder="Tell us why you want to cancel."
                            rows={4}
                            style={{
                                width: '100%',
                                borderRadius: '0.75rem',
                                border: `1px solid ${reasonError ? '#dc3545' : '#D1D5DB'}`,
                                padding: '0.75rem 0.9rem',
                                resize: 'vertical',
                                outline: 'none',
                                color: '#111827',
                            }}
                        />
                        {reasonError && (
                            <div style={{ marginTop: '0.5rem', color: '#dc3545', fontSize: '0.9rem' }}>
                                {reasonError}
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ padding: '1rem 1.5rem 1.5rem', borderTop: '1px solid #F3F4F6' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                backgroundColor: 'transparent',
                                color: '#4B5563',
                                border: '1px solid #D1D5DB',
                                padding: '0.65rem 1.5rem',
                                borderRadius: '9999px',
                                cursor: 'pointer',
                                fontWeight: 600,
                                minWidth: '10rem',
                            }}
                        >
                            Keep {orderLabel === 'request' ? 'Request' : 'Order'}
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            style={{
                                backgroundColor: '#dc3545',
                                color: 'white',
                                border: 'none',
                                padding: '0.65rem 1.5rem',
                                borderRadius: '9999px',
                                cursor: 'pointer',
                                fontWeight: 600,
                                minWidth: '13rem',
                            }}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ItemCancellationModal;
