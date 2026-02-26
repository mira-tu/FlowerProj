import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

const SHOP_NAME = "Jocery's Flower Shop";
const SHOP_ADDRESS = "123 Flower St., Quezon City";
const SHOP_CONTACT = "+63 909 123 4567";

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount || 0);
};

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const formatPaymentStatus = (paymentStatus, paymentMethod) => {
    if (!paymentStatus) return 'Unpaid';
    if (paymentStatus === 'waiting_for_confirmation') return 'Verifying Receipt';

    // For COD
    if (paymentMethod === 'cod') {
        if (paymentStatus === 'to_pay') return 'To Pay / Unpaid';
        if (paymentStatus === 'paid') return 'Paid';
        return paymentStatus.replace(/_/g, ' ');
    }

    return paymentStatus.replace(/_/g, ' ');
};

export const generateAndShareReceipt = async (item, isRequest = false) => {
    try {
        let referenceNumber = isRequest ? item.request_number : item.order_number;
        let customerName = isRequest ? item.user_name : item.user?.user_metadata?.name || 'Customer';
        let customerPhone = isRequest ? (item.contact_number || item.user_phone) : item.address?.phone || 'N/A';
        let customerEmail = isRequest ? item.user_email : item.user?.user_metadata?.email || 'N/A';
        let orderDate = formatDate(item.created_at);
        let deliveryMethod = (isRequest ? item.delivery_method : item.delivery_method) === 'delivery' ? 'Delivery' : 'Pick-up';
        let deliveryDate = isRequest ? (item.data?.event_date || item.pickup_time || 'N/A') : (item.pickup_time || 'N/A');

        let subtotal = item.subtotal || 0;
        let shippingFee = item.shipping_fee || 0;
        let total = item.total || item.final_price || 0;
        let amountReceived = item.amount_received || 0;
        let balance = Math.max(0, total - amountReceived);

        let itemsHtml = '';

        if (!isRequest) {
            // Standard Order Items
            if (item.order_items && item.order_items.length > 0) {
                itemsHtml = item.order_items.map(orderItem => `
                    <tr>
                        <td class="item-name">${orderItem.name}</td>
                        <td class="item-qty">${orderItem.quantity}</td>
                        <td class="item-price">${formatCurrency(orderItem.price)}</td>
                        <td class="item-total">${formatCurrency(orderItem.price * orderItem.quantity)}</td>
                    </tr>
                `).join('');
            } else {
                itemsHtml = `<tr><td colspan="4" class="text-center text-muted">No items found</td></tr>`;
            }
        } else {
            // Request Data Handling
            let requestData = item.data;
            if (typeof requestData === 'string') {
                try { requestData = JSON.parse(requestData); } catch (e) { requestData = {}; }
            }

            if (item.type === 'customized' && requestData.items && requestData.items.length > 0) {
                const customItem = requestData.items[0];
                const flowersString = customItem?.flowers?.map(f => f.name).join(', ') || '';
                itemsHtml = `
                    <tr>
                        <td class="item-name">
                            <strong>Customized Bouquet</strong><br>
                            <small class="text-muted">
                                Flowers: ${flowersString}<br>
                                Wrapper: ${customItem.wrapper?.name || 'N/A'}<br>
                                Ribbon: ${customItem.ribbon?.name || 'N/A'}
                            </small>
                        </td>
                        <td class="item-qty">${customItem.bundleSize || 1} stems</td>
                        <td class="item-price">-</td>
                        <td class="item-total">-</td>
                    </tr>
                `;
            } else if (item.type === 'booking') {
                itemsHtml = `
                    <tr>
                        <td class="item-name">
                            <strong>Event Booking: ${requestData.occasion || 'Event'}</strong><br>
                            <small class="text-muted">
                                Add-on: ${requestData.addon || 'None'}<br>
                                Venue: ${requestData.venue || 'N/A'}
                            </small>
                        </td>
                        <td class="item-qty">1</td>
                        <td class="item-price">-</td>
                        <td class="item-total">-</td>
                    </tr>
                `;
            } else if (item.type === 'special_order') {
                itemsHtml = `
                    <tr>
                        <td class="item-name">
                            <strong>Special Order: ${requestData.occasion || 'Order'}</strong><br>
                            <small class="text-muted">
                                Add-ons: ${requestData.addons ? requestData.addons.join(', ') : 'None'}<br>
                                Recipient: ${requestData.recipient_name || 'N/A'}
                            </small>
                        </td>
                        <td class="item-qty">1</td>
                        <td class="item-price">-</td>
                        <td class="item-total">-</td>
                    </tr>
                `;
            } else {
                itemsHtml = `<tr><td colspan="4" class="text-center text-muted">Details not available</td></tr>`;
            }
        }

        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Receipt - ${referenceNumber}</title>
            <style>
                body {
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                    color: #333;
                    line-height: 1.5;
                    margin: 0;
                    padding: 40px;
                    background-color: #f9f9f9;
                }
                .receipt-container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: #fff;
                    padding: 30px;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    border-bottom: 2px dashed #eee;
                    padding-bottom: 20px;
                }
                .shop-name {
                    font-size: 28px;
                    font-weight: bold;
                    color: #ec4899;
                    margin: 0 0 5px 0;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .shop-details {
                    font-size: 14px;
                    color: #666;
                    margin: 2px 0;
                }
                .info-section {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 20px;
                }
                .info-block {
                    flex: 1;
                }
                .info-title {
                    font-size: 12px;
                    text-transform: uppercase;
                    color: #888;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                .info-text {
                    font-size: 14px;
                    margin: 0 0 5px 0;
                    font-weight: 500;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                }
                th {
                    background-color: #fce7f3;
                    color: #be185d;
                    text-align: left;
                    padding: 10px;
                    font-size: 12px;
                    text-transform: uppercase;
                }
                th.text-right, td.text-right {
                    text-align: right;
                }
                th.text-center, td.text-center {
                    text-align: center;
                }
                td {
                    padding: 12px 10px;
                    border-bottom: 1px solid #eee;
                    font-size: 14px;
                }
                .item-name {
                    font-weight: 600;
                }
                .totals-section {
                    width: 100%;
                    margin-top: 20px;
                }
                .total-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 10px;
                    font-size: 14px;
                }
                .total-row.bold {
                    font-weight: bold;
                    font-size: 16px;
                }
                .total-row.grand-total {
                    font-size: 18px;
                    font-weight: bold;
                    background-color: #fce7f3;
                    color: #be185d;
                    padding: 12px 10px;
                    border-radius: 4px;
                    margin-top: 5px;
                }
                .payment-details {
                    margin-top: 30px;
                    padding: 15px;
                    background-color: #f8f9fa;
                    border-left: 4px solid #ec4899;
                    border-radius: 4px;
                }
                .payment-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 5px;
                    font-size: 14px;
                }
                .balance-row {
                    margin-top: 10px;
                    padding-top: 10px;
                    border-top: 1px solid #ddd;
                    font-weight: bold;
                    color: #dc2626;
                }
                .footer {
                    text-align: center;
                    margin-top: 40px;
                    padding-top: 20px;
                    border-top: 2px dashed #eee;
                    font-size: 12px;
                    color: #888;
                }
            </style>
        </head>
        <body>
            <div class="receipt-container">
                <div class="header">
                    <h1 class="shop-name">${SHOP_NAME}</h1>
                    <p class="shop-details">${SHOP_ADDRESS}</p>
                    <p class="shop-details">${SHOP_CONTACT}</p>
                    <div style="margin-top: 15px;">
                        <span style="background: #111; color: white; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; letter-spacing: 1px;">
                            ${isRequest ? 'REQUEST SUMMARY' : 'ORDER RECEIPT'}
                        </span>
                    </div>
                </div>

                <div class="info-section">
                    <div class="info-block">
                        <div class="info-title">Bill To</div>
                        <p class="info-text">${customerName}</p>
                        <p class="info-text">${customerPhone}</p>
                        <p class="info-text" style="color: #666; font-size: 13px;">${customerEmail}</p>
                    </div>
                    <div class="info-block" style="text-align: right;">
                        <div class="info-title">Order Details</div>
                        <p class="info-text">Ref: <strong>${referenceNumber}</strong></p>
                        <p class="info-text">Date: ${orderDate}</p>
                        <p class="info-text">Type: ${deliveryMethod}</p>
                        <p class="info-text" style="color: #666; font-size: 13px;">Sch: ${deliveryDate}</p>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Item Description</th>
                            <th class="text-center">Qty</th>
                            <th class="text-right">Price</th>
                            <th class="text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <div class="totals-section">
                    <div class="total-row">
                        <span>Subtotal</span>
                        <span>${formatCurrency(subtotal)}</span>
                    </div>
                    ${shippingFee > 0 ? `
                    <div class="total-row">
                        <span>Delivery Fee</span>
                        <span>${formatCurrency(shippingFee)}</span>
                    </div>
                    ` : `
                    <div class="total-row">
                        <span>Delivery Fee</span>
                        <span style="color: #10B981; font-weight: 500;">FREE / PICKUP</span>
                    </div>
                    `}
                    ${(!isRequest && item.total === undefined && total === 0) || (isRequest && !item.final_price) ? `
                    <div class="total-row grand-total" style="background-color: #f3f4f6; color: #374151;">
                        <span>Final Price</span>
                        <span>For Discussion</span>
                    </div>
                    ` : `
                    <div class="total-row grand-total">
                        <span>Total Due</span>
                        <span>${formatCurrency(total)}</span>
                    </div>
                    `}
                </div>

                <div class="payment-details">
                    <h4 style="margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; color: #555;">Payment Summary</h4>
                    <div class="payment-row">
                        <span>Method</span>
                        <span style="font-weight: 600; text-transform: uppercase;">${item.payment_method?.replace(/_/g, ' ') || 'N/A'}</span>
                    </div>
                    <div class="payment-row">
                        <span>Status</span>
                        <span style="font-weight: 600; text-transform: capitalize;">${formatPaymentStatus(item.payment_status, item.payment_method)}</span>
                    </div>
                    <div class="payment-row" style="margin-top: 10px;">
                        <span>Amount Received</span>
                        <span style="font-weight: bold; color: #10B981;">${formatCurrency(amountReceived)}</span>
                    </div>
                    ${balance > 0 ? `
                    <div class="payment-row balance-row">
                        <span>Remaining Balance</span>
                        <span>${formatCurrency(balance)}</span>
                    </div>
                    ` : `
                    <div class="payment-row balance-row" style="color: #10B981;">
                        <span>Remaining Balance</span>
                        <span>${formatCurrency(0)} (Fully Paid)</span>
                    </div>
                    `}
                </div>

                <div class="footer">
                    <p style="margin: 0 0 5px 0;"><strong>Thank you for choosing ${SHOP_NAME}!</strong></p>
                    <p style="margin: 0;">If you have any questions, please contact us at ${SHOP_CONTACT}.</p>
                </div>
            </div>
        </body>
        </html>
        `;

        const { uri } = await Print.printToFileAsync({ html: htmlContent });

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
            await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                dialogTitle: `Share Receipt ${referenceNumber}`,
                UTI: 'com.adobe.pdf'
            });
        } else {
            Alert.alert("Unable to share", "Sharing is not supported on this device.");
        }
    } catch (error) {
        console.error("Error generating receipt:", error);
        Alert.alert("Error", "Could not generate receipt.");
    }
};
