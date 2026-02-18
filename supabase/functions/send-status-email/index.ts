
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Buffer } from "node:buffer";
globalThis.Buffer = Buffer;
import nodemailer from "npm:nodemailer@6.9.7";

const GMAIL_USER = Deno.env.get("GMAIL_USER");
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
    },
});

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: CORS_HEADERS });
    }

    try {
        if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
            throw new Error("Missing Gmail credentials.");
        }

        const { order_number, user_email, status, customer_name } = await req.json();

        let subject = "";
        let htmlContent = "";

        if (status === 'processing') {
            subject = `Order #${order_number} Received - Jocery's Flower Shop`;
            htmlContent = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #ec4899;">We've Received Your Order!</h2>
          <p>Hi ${customer_name || 'Valued Customer'},</p>
          <p>Great news! Your order <strong>#${order_number}</strong> has been received and confirmed by our team.</p>
          <p>Our florists are now carefully preparing your arrangement. We'll let you know as soon as it's ready for delivery or pickup.</p>
          <br>
          <p>You can track your order status anytime in your <a href="https://flowerproj.vercel.app/profile" style="color: #ec4899;">profile</a>.</p>
          <br>
          <p>Thank you for choosing Jocery's Flower Shop!</p>
        </div>
      `;
        } else if (status === 'completed') {
            subject = `Order #${order_number} Delivered! - Jocery's Flower Shop`;
            htmlContent = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #ec4899;">Order Delivered!</h2>
          <p>Hi ${customer_name || 'Valued Customer'},</p>
          <p>Your order <strong>#${order_number}</strong> has been successfully delivered! We hope it brings joy to its recipient.</p>
          <p>If you have any feedback, we'd love to hear from you!</p>
          <br>
          <p>Thank you for shopping with Jocery's Flower Shop!</p>
        </div>
      `;
        } else if (status === 'claimed') {
            subject = `Order #${order_number} Picked Up! - Jocery's Flower Shop`;
            htmlContent = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #ec4899;">Order Picked Up!</h2>
            <p>Hi ${customer_name || 'Valued Customer'},</p>
            <p>Your order <strong>#${order_number}</strong> has been successfully picked up.</p>
            <p>We hope you enjoy your flowers!</p>
            <br>
            <p>Thank you for shopping with Jocery's Flower Shop!</p>
          </div>
        `;
        } else {
            return new Response(JSON.stringify({ message: "No email sent for this status." }), {
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                status: 200,
            });
        }

        const mailOptions = {
            from: `"Jocery's Flower Shop" <${GMAIL_USER}>`,
            to: user_email,
            subject: subject,
            html: htmlContent,
        };

        await transporter.sendMail(mailOptions);

        return new Response(JSON.stringify({ message: "Email sent successfully." }), {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            status: 200,
        });

    } catch (error) {
        console.error("Error sending email:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
