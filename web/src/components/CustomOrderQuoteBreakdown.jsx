import React from 'react';
import {
    getCustomOrderQuoteTypeLabel,
    summarizeCustomOrderQuoteBreakdown,
} from '../utils/customOrderQuoteBreakdown';

const PESO = '\u20b1';

const CustomOrderQuoteBreakdown = ({
    breakdown,
    shippingFee = 0,
    title = 'Price Breakdown',
    className = '',
    style = {},
}) => {
    const {
        groupedLineItems,
        lineItems,
        subtotal,
        discountTotal,
        subtotalAfterDiscount,
        shipping,
        total,
    } = summarizeCustomOrderQuoteBreakdown(
        breakdown,
        shippingFee,
    );

    return (
        <div className={className} style={style}>
            <div
                className="p-3 rounded-3"
                style={{ background: '#fff5f8', border: '1px solid #fbcfe8' }}
            >
                <div className="small fw-bold mb-2" style={{ color: 'var(--shop-pink)' }}>
                    {title}
                </div>

                {lineItems.length > 0 ? (
                    groupedLineItems.map((group) => (
                        <div key={group.key} className="mb-3">
                            {group.title ? (
                                <div
                                    className="small fw-semibold mb-2"
                                    style={{ color: '#9d174d', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                                >
                                    {group.title}
                                </div>
                            ) : null}

                            {group.items.map((item) => (
                                <div key={item.key} className="mb-2">
                                    <div className="d-flex justify-content-between gap-2">
                                        <div className="flex-grow-1">
                                            <div className="d-flex flex-wrap align-items-center gap-2">
                                                <span
                                                    className="small fw-semibold"
                                                    style={{
                                                        background: '#fce7f3',
                                                        color: '#9d174d',
                                                        borderRadius: '999px',
                                                        padding: '2px 8px',
                                                    }}
                                                >
                                                    {getCustomOrderQuoteTypeLabel(item.type)}
                                                </span>
                                                <span className="small text-dark fw-semibold">
                                                    {item.label}
                                                    {item.showQuantity ? ` (${item.quantity} x ${PESO}${item.unitAmount.toLocaleString()})` : ''}
                                                </span>
                                            </div>
                                            {item.reason ? (
                                                <div className="small mt-1" style={{ color: '#6b7280' }}>
                                                    {item.reason}
                                                </div>
                                            ) : null}
                                        </div>
                                        <span className="small fw-semibold text-dark">
                                            {PESO}{item.amount.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))
                ) : (
                    <div className="small text-muted mb-1">No line-item breakdown available.</div>
                )}

                <div className="d-flex justify-content-between small border-top pt-2 mt-2">
                    <span>Subtotal</span>
                    <span className="fw-semibold">{PESO}{subtotal.toLocaleString()}</span>
                </div>
                {discountTotal > 0 ? (
                    <>
                        <div className="d-flex justify-content-between small text-success">
                            <span>Discount{breakdown?.applied_promo_code ? ` (${breakdown.applied_promo_code})` : ''}</span>
                            <span className="fw-semibold">-{PESO}{discountTotal.toLocaleString()}</span>
                        </div>
                        <div className="d-flex justify-content-between small">
                            <span>Subtotal After Discount</span>
                            <span className="fw-semibold">{PESO}{subtotalAfterDiscount.toLocaleString()}</span>
                        </div>
                    </>
                ) : null}
                <div className="d-flex justify-content-between small">
                    <span>Delivery Fee</span>
                    <span className="fw-semibold">{PESO}{shipping.toLocaleString()}</span>
                </div>
                <div className="d-flex justify-content-between fw-bold mt-1" style={{ color: 'var(--shop-pink)' }}>
                    <span>Total</span>
                    <span>{PESO}{total.toLocaleString()}</span>
                </div>
            </div>
        </div>
    );
};

export default CustomOrderQuoteBreakdown;
