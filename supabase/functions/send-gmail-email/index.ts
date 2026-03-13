import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Polyfill Buffer for Nodemailer, which is a Node.js library
import { Buffer } from "node:buffer";
globalThis.Buffer = Buffer;

import nodemailer from "npm:nodemailer@6.9.7";

// Load environment variables from Supabase secrets
const GMAIL_USER = Deno.env.get("GMAIL_USER");
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderItem {
  name: string;
  qty: number;
  price: number;
}

interface MultiDeliveryDestination {
  item_name?: string;
  unit_number?: number;
  recipient_name?: string;
  recipient_phone?: string;
  address_snapshot?: {
    street?: string;
    barangay?: string;
    city?: string;
    province?: string;
    zip?: string;
  };
}

// Create a Nodemailer transporter for Gmail
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

serve(async (req) => {
  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
        throw new Error("Missing Gmail credentials. Make sure GMAIL_USER and GMAIL_APP_PASSWORD secrets are set in your Supabase project.");
    }

    const {
      order_number,
      order_items,
      total,
      user_email,
      delivery_method,
      address,
      multi_delivery_destinations,
      pickup_time,
    } = await req.json();

    const itemsHtml = order_items.map((item: OrderItem) => `
      <tr>
        <td>${item.name} (Qty: ${item.qty || 1})</td>
        <td style="text-align: right;">₱${(item.price * (item.qty || 1)).toLocaleString()}</td>
      </tr>
    `).join('');

    const groupedMultiDestinations = Array.isArray(multi_delivery_destinations)
      ? multi_delivery_destinations.reduce((groups: Array<{
          recipientName: string;
          recipientPhone: string;
          addressText: string;
          items: string[];
        }>, destination: MultiDeliveryDestination) => {
          const snapshot = destination.address_snapshot ?? {};
          const addressText = [
            snapshot.street,
            snapshot.barangay,
            snapshot.city,
            snapshot.province,
            snapshot.zip,
          ].filter(Boolean).join(', ');

          const key = [
            destination.recipient_name ?? '',
            destination.recipient_phone ?? '',
            addressText,
          ].join('|');

          const existing = groups.find((group) => [
            group.recipientName,
            group.recipientPhone,
            group.addressText,
          ].join('|') === key);

          const itemLabel = `${destination.item_name ?? 'Bouquet'}${destination.unit_number ? ` #${destination.unit_number}` : ''}`;

          if (existing) {
            existing.items.push(itemLabel);
          } else {
            groups.push({
              recipientName: destination.recipient_name ?? 'Recipient',
              recipientPhone: destination.recipient_phone ?? '',
              addressText,
              items: [itemLabel],
            });
          }

          return groups;
        }, [])
      : [];

    const multiDestinationHtml = groupedMultiDestinations.length > 0
      ? `
        <p><strong>Delivery Stops:</strong></p>
        ${groupedMultiDestinations.map((group, index) => `
          <div style="margin-bottom: 14px; padding: 12px; border: 1px solid #eee; border-radius: 10px;">
            <p style="margin: 0 0 6px;"><strong>Stop ${index + 1}:</strong> ${group.recipientName}</p>
            ${group.recipientPhone ? `<p style="margin: 0 0 6px;"><strong>Phone:</strong> ${group.recipientPhone}</p>` : ''}
            <p style="margin: 0 0 6px;"><strong>Address:</strong> ${group.addressText}</p>
            <p style="margin: 0;"><strong>Items:</strong> ${group.items.join(', ')}</p>
          </div>
        `).join('')}
      `
      : '';

    const deliveryHtml = delivery_method === 'pickup'
      ? `
        <p><strong>Pickup Time:</strong> ${pickup_time}</p>
        <p><strong>Pickup Location:</strong> Jocery's Flower Shop, 123 Flower St., Quezon City</p>
      `
      : groupedMultiDestinations.length > 0
      ? multiDestinationHtml
      : `
        <p><strong>Deliver to:</strong></p>
        <p>
          ${address.name}<br>
          ${address.street}, ${address.barangay}, ${address.city}, ${address.province}<br>
          ${address.phone}
        </p>
      `;

    const mailOptions = {
      from: `"Jocery's Flower Shop" <${GMAIL_USER}>`,
      to: user_email,
      subject: `Your Jocery's Flower Shop Order #${order_number} is Confirmed`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Thank you for your order!</h2>
          <p>Hi there,</p>
          <p>Your order #${order_number} has been confirmed.</p>
          
          <h3>Order Summary</h3>
          <table style="width: 100%; border-collapse: collapse;">
            ${itemsHtml}
            <tr style="border-top: 1px solid #ddd; font-weight: bold;">
              <td>Total</td>
              <td style="text-align: right;">₱${total.toLocaleString()}</td>
            </tr>
          </table>

          <h3>Delivery Details</h3>
          ${deliveryHtml}

          <p>We're getting your order ready and will notify you once it's on its way. You can track your order status from your profile page.</p>
          <p>Thanks for shopping with Jocery's Flower Shop!</p>
        </div>
      `,
    };

    // Send the email
    await transporter.sendMail(mailOptions);

    return new Response(JSON.stringify({ message: "Order confirmation email sent successfully." }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Internal Server Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
