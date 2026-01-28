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

    const { order_number, order_items, total, user_email, delivery_method, address, pickup_time } = await req.json();

    const itemsHtml = order_items.map((item: OrderItem) => `
      <tr>
        <td>${item.name} (Qty: ${item.qty || 1})</td>
        <td style="text-align: right;">₱${(item.price * (item.qty || 1)).toLocaleString()}</td>
      </tr>
    `).join('');

    const deliveryHtml = delivery_method === 'pickup'
      ? `
        <p><strong>Pickup Time:</strong> ${pickup_time}</p>
        <p><strong>Pickup Location:</strong> Jocery's Flower Shop, 123 Flower St., Quezon City</p>
      `
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
