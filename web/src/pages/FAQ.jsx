import React, { useState } from 'react';

const faqs = [
    {
        category: 'Orders',
        items: [
            {
                q: 'How do I place an order?',
                a: 'Browse our catalogue, add items to your cart, and proceed to checkout. You can also place a custom order through the Custom Order page.',
            },
            {
                q: 'Can I cancel my order after placing it?',
                a: 'Orders can be cancelled within 1 hour of placement. After that, please contact us directly via the Contact page or message.',
            },
            {
                q: 'How will I know my order is confirmed?',
                a: 'You will receive an email confirmation once your order is placed. You can also track your order status under My Orders.',
            },
        ],
    },
    {
        category: 'Delivery',
        items: [
            {
                q: 'What areas do you deliver to?',
                a: 'We currently deliver within select areas. Delivery availability and fees are shown at checkout based on your address.',
            },
            {
                q: 'How long does delivery take?',
                a: 'Standard delivery takes 1–3 business days. Same-day delivery may be available depending on your location and order time.',
            },
            {
                q: 'Can I schedule a specific delivery date?',
                a: 'Yes, you can choose a preferred delivery date during checkout, subject to availability.',
            },
        ],
    },
    {
        category: 'Custom Orders',
        items: [
            {
                q: 'How does the custom order process work?',
                a: 'Submit your request through the Custom Order page with your preferences and budget. Our team will review it and get back to you with a quote.',
            },
            {
                q: 'How long does it take to process a custom order?',
                a: 'Custom orders typically take 2–5 business days depending on complexity. We will confirm the timeline when we respond to your request.',
            },
        ],
    },
    {
        category: 'Payments',
        items: [
            {
                q: 'What payment methods do you accept?',
                a: 'We accept GCash and cash on delivery (COD) for eligible orders.',
            },
            {
                q: 'Is it safe to pay online?',
                a: 'Yes. All transactions are processed securely.',
            },
        ],
    },
    {
        category: 'Account',
        items: [
            {
                q: 'Do I need an account to place an order?',
                a: 'An account is required to place orders so we can track your purchases and send you updates.',
            },
            {
                q: 'How do I reset my password?',
                a: 'Click "Forgot Password?" on the login page and we will send a reset link to your email.',
            },
        ],
    },
];

function FAQItem({ q, a }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="faq-item border-bottom py-3">
            <button
                className="faq-question d-flex justify-content-between align-items-center w-100 text-start bg-transparent border-0 p-0 fw-semibold"
                onClick={() => setOpen((previous) => !previous)}
                aria-expanded={open}
            >
                <span>{q}</span>
                <i
                    className={`fa-solid fa-chevron-${open ? 'up' : 'down'} ms-3 text-muted`}
                    style={{ fontSize: '0.8rem', flexShrink: 0 }}
                />
            </button>
            {open ? (
                <p className="faq-answer mt-2 mb-0 text-muted" style={{ lineHeight: '1.7' }}>
                    {a}
                </p>
            ) : null}
        </div>
    );
}

export default function FAQ() {
    return (
        <div className="container py-5" style={{ maxWidth: '760px', marginTop: '70px' }}>
            <h1 className="fw-bold mb-1" style={{ color: '#be185d' }}>Frequently Asked Questions</h1>
            <p className="text-muted mb-5">Everything you need to know about ordering from Jocerry&apos;s Flower Shop.</p>

            {faqs.map((section) => (
                <div key={section.category} className="mb-5">
                    <h5
                        className="fw-bold mb-3"
                        style={{ color: '#9d174d', borderBottom: '2px solid #fce7f3', paddingBottom: '8px' }}
                    >
                        {section.category}
                    </h5>
                    {section.items.map((item) => (
                        <FAQItem key={item.q} q={item.q} a={item.a} />
                    ))}
                </div>
            ))}

            <div className="mt-5 p-4 rounded-3 text-center" style={{ backgroundColor: '#fdf2f8', border: '1px solid #fbcfe8' }}>
                <p className="mb-1 fw-semibold">Still have questions?</p>
                <p className="text-muted mb-3 small">We&apos;re happy to help. Reach out to us directly.</p>
                <a href="/contact" className="btn btn-sm rounded-pill px-4" style={{ backgroundColor: '#ec4899', color: '#fff' }}>
                    Contact Us
                </a>
            </div>
        </div>
    );
}
