import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getStatusLabel, getPaymentStatusDisplay } from '../adminHelpers';

/**
 * Shared Payment Details Section for OrdersTab and RequestsTab.
 *
 * Props:
 *  - item           : the order or request object
 *  - styles         : the shared AdminDashboard styles object
 *  - onRecordPay    : () => void  – opens the record payment modal (add mode)
 *  - onEditAmount   : () => void  – opens the modal pre-filled to edit/replace amount
 *  - onViewReceipt  : (url) => void  – opens the receipt image modal
 *  - requireReceipt : boolean (default false)
 *    When true, "Record Pay" only shows if item.receipt_url exists.
 */
const PaymentDetailsSection = ({ item, styles, onRecordPay, onEditAmount, onViewReceipt, requireReceipt = false }) => {
    const isGCash = item.payment_method?.toLowerCase() === 'gcash' || !item.payment_method;
    const isPaid = item.payment_status === 'paid';
    const isTerminal = ['pending', 'cancelled', 'declined'].includes(item.status);
    const hasReceipt = !!(item.receipt_url);

    const showRecordPay = isGCash && !isPaid && !isTerminal && (requireReceipt ? hasReceipt : true);

    const methodLabel = item.payment_method
        ? (item.payment_method.toLowerCase() === 'cod' ? 'Cash On Delivery' : getStatusLabel(item.payment_method))
        : 'Not specified';

    const statusColor = isPaid ? '#22C55E' : '#FFA726';

    return (
        <View style={styles.eoSection}>
            {/* Section Header with Record Pay button */}
            <View style={[styles.eoSectionHeader, { justifyContent: 'space-between', marginBottom: 16 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="card" size={16} color="#6B7280" />
                    <Text style={styles.eoSectionTitle}>Payment Details</Text>
                </View>
                {showRecordPay && (
                    <TouchableOpacity
                        onPress={onRecordPay}
                        style={{ backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 }}
                    >
                        <Text style={{ color: 'white', fontSize: 13, fontWeight: 'bold' }}>Record Pay</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={{ gap: 8 }}>
                {/* Payment Method + Status badges */}
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {item.payment_method && (
                        <View style={[styles.eoPaymentStatus, { backgroundColor: '#3B82F6' }]}>
                            <Text style={styles.eoPaymentStatusText}>{methodLabel}</Text>
                        </View>
                    )}
                    {item.payment_status && (
                        <View style={[styles.eoPaymentStatus, { backgroundColor: statusColor }]}>
                            <Text style={styles.eoPaymentStatusText}>
                                {getPaymentStatusDisplay(item.payment_status, item.payment_method)}
                            </Text>
                        </View>
                    )}
                </View>

                {/* All receipts section — main receipt first, followed by additionals */}
                {((isGCash && item.payment_method && item.receipt_url) || (item.additional_receipts && item.additional_receipts.length > 0)) && (
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                        {isGCash && item.payment_method && item.receipt_url && (
                            <TouchableOpacity onPress={() => onViewReceipt(item.receipt_url)}>
                                <Text style={styles.eoViewReceipt}>Main Receipt</Text>
                            </TouchableOpacity>
                        )}
                        {item.additional_receipts && item.additional_receipts.length > 0 && (
                            item.additional_receipts.map((receipt, idx) => (
                                <TouchableOpacity key={idx} onPress={() => onViewReceipt(receipt.url)}>
                                    <Text style={styles.eoViewReceipt}>Receipt {idx + 2}</Text>
                                </TouchableOpacity>
                            ))
                        )}
                    </View>
                )}

                {/* Pricing breakdown */}
                <View style={styles.eoDivider}>
                    <View style={styles.eoPriceRow}>
                        <Text style={styles.eoDetailText}>Subtotal:</Text>
                        <Text style={styles.eoDetailText}>
                            ₱{(item.subtotal ?? (item.final_price != null ? item.final_price - (item.shipping_fee || 0) : 0)).toFixed(2)}
                        </Text>
                    </View>
                    {(item.shipping_fee > 0) && (
                        <View style={styles.eoPriceRow}>
                            <Text style={styles.eoDetailText}>Delivery Fee:</Text>
                            <Text style={styles.eoDetailText}>₱{item.shipping_fee.toFixed(2)}</Text>
                        </View>
                    )}
                    {(item.amount_received > 0) && (
                        <>
                            {/* Amount Received row with edit (pencil) button */}
                            <View style={styles.eoPriceRow}>
                                <Text style={styles.eoDetailText}>Amount Received:</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text style={[styles.eoDetailText, { color: '#22C55E', fontWeight: 'bold' }]}>
                                        ₱{(item.amount_received || 0).toLocaleString()}
                                    </Text>
                                    {!isPaid && onEditAmount && (
                                        <TouchableOpacity
                                            onPress={onEditAmount}
                                            style={{ padding: 4, backgroundColor: '#FEF3C7', borderRadius: 4 }}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        >
                                            <Ionicons name="pencil" size={13} color="#D97706" />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                            <View style={styles.eoPriceRow}>
                                <Text style={styles.eoDetailText}>Balance:</Text>
                                <Text style={[styles.eoDetailText, {
                                    color: ((item.total ?? item.final_price ?? 0) - (item.amount_received || 0)) > 0 ? '#EF4444' : '#6B7280',
                                    fontWeight: 'bold'
                                }]}>
                                    ₱{((item.total ?? item.final_price ?? 0) - (item.amount_received || 0)).toLocaleString()}
                                </Text>
                            </View>
                        </>
                    )}
                    <View style={[styles.eoPriceRow, { marginTop: 12 }]}>
                        <Text style={styles.eoTotalLabel}>Total:</Text>
                        <Text style={styles.eoTotalValue}>₱{(item.total ?? item.final_price ?? 0).toLocaleString()}</Text>
                    </View>
                    {item.payment_status === 'partial' && (
                        <View style={{ marginTop: 8, padding: 8, backgroundColor: '#FEF2F2', borderRadius: 4, borderWidth: 1, borderColor: '#FCA5A5' }}>
                            <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
                                {item.amount_received > 0
                                    ? `Warning: Partial Payment (₱${item.amount_received.toLocaleString()} received out of ₱${item.total ?? item.final_price})`
                                    : `Warning: Receipt uploaded but payment not yet confirmed by admin.`}
                            </Text>
                            <Text style={{ color: '#DC2626', fontSize: 11, textAlign: 'center', marginTop: 2 }}>
                                {item.amount_received > 0
                                    ? 'Customer needs to pay the remaining balance.'
                                    : 'Please review the receipt and use "Record Pay" to confirm the amount received.'}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
};

export default PaymentDetailsSection;
