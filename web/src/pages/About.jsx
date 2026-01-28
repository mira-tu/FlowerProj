import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../config/supabase';
import '../styles/About.css';

const About = () => {
    const [aboutData, setAboutData] = useState({
        story: "Loading...",
        about_description: "Loading...",
        promise: "Loading...",
        ownerQuote: "Loading...",
        ownerImage: "https://via.placeholder.com/150",
        ourShopImage: "https://via.placeholder.com/600x400",
        customBouquetsDescription: "Loading...",
        customBouquetsImage: "https://via.placeholder.com/400x250",
        eventDecorationsDescription: "Loading...",
        eventDecorationsImage: "https://via.placeholder.com/400x250",
        specialOrdersDescription: "Loading...",
        specialOrdersImage: "https://via.placeholder.com/400x250",
        promises_responsibly_sourced_description: "Loading...",
        promises_responsibly_sourced_image: "https://via.placeholder.com/150",
        promises_crafted_by_experts_description: "Loading...",
        promises_crafted_by_experts_image: "https://via.placeholder.com/150",
        promises_caring_for_moments_description: "Loading...",
        promises_caring_for_moments_image: "https://via.placeholder.com/150",
    });

    useEffect(() => {
        const fetchAboutData = async () => {
            try {
                const { data, error } = await supabase
                    .from('app_content')
                    .select('key, value')
                    .in('key', [
                        'about_story', 'about_description', 'about_promise', 'about_owner_quote', 'about_owner_image', 'about_our_shop_img',
                        'about_custom_bouquets_desc', 'about_custom_bouquets_img',
                        'about_event_decorations_desc', 'about_event_decorations_img',
                        'about_special_orders_desc', 'about_special_orders_img',
                        'promises_responsibly_sourced_description', 'promises_responsibly_sourced_image',
                        'promises_crafted_by_experts_description', 'promises_crafted_by_experts_image',
                        'promises_caring_for_moments_description', 'promises_caring_for_moments_image'
                    ]);

                if (error) throw error;

                const newAboutData = data.reduce((acc, item) => {
                    if (item.key === 'about_story') acc.story = item.value;
                    if (item.key === 'about_description') acc.about_description = item.value;
                    if (item.key === 'about_promise') acc.promise = item.value;
                    if (item.key === 'about_owner_quote') acc.ownerQuote = item.value;
                    if (item.key === 'about_owner_image') acc.ownerImage = item.value;
                    if (item.key === 'about_our_shop_img') acc.ourShopImage = item.value;
                    if (item.key === 'about_custom_bouquets_desc') acc.customBouquetsDescription = item.value;
                    if (item.key === 'about_custom_bouquets_img') acc.customBouquetsImage = item.value;
                    if (item.key === 'about_event_decorations_desc') acc.eventDecorationsDescription = item.value;
                    if (item.key === 'about_event_decorations_img') acc.eventDecorationsImage = item.value;
                    if (item.key === 'about_special_orders_desc') acc.specialOrdersDescription = item.value;
                    if (item.key === 'about_special_orders_img') acc.specialOrdersImage = item.value;
                    if (item.key === 'promises_responsibly_sourced_description') acc.promises_responsibly_sourced_description = item.value;
                    if (item.key === 'promises_responsibly_sourced_image') acc.promises_responsibly_sourced_image = item.value;
                    if (item.key === 'promises_crafted_by_experts_description') acc.promises_crafted_by_experts_description = item.value;
                    if (item.key === 'promises_crafted_by_experts_image') acc.promises_crafted_by_experts_image = item.value;
                    if (item.key === 'promises_caring_for_moments_description') acc.promises_caring_for_moments_description = item.value;
                    if (item.key === 'promises_caring_for_moments_image') acc.promises_caring_for_moments_image = item.value;
                    return acc;
                }, { 
                    story: "Jocery's Flower Shop was born from a love for flowers...",
                    about_description: "A short description for the about page...",
                    promise: "We built our shop on the foundation of those relationships...",
                    ownerQuote: "Flowers have always been my passion...",
                    ownerImage: "https://via.placeholder.com/150",
                    ourShopImage: "https://via.placeholder.com/600x400",
                    customBouquetsDescription: "Create your own unique arrangement with your choice of flowers, colors, and wrapping.",
                    customBouquetsImage: "https://via.placeholder.com/400x250",
                    eventDecorationsDescription: "Beautiful floral arrangements for weddings, parties, and corporate events.",
                    eventDecorationsImage: "https://via.placeholder.com/400x250",
                    specialOrdersDescription: "Add chocolates, teddy bears, and personalized gifts to make your surprise extra special.",
                    specialOrdersImage: "https://via.placeholder.com/400x250",
                    promises_responsibly_sourced_description: "We work with ethical suppliers to ensure our flowers are fresh, sustainable, and responsibly grown.",
                    promises_responsibly_sourced_image: "https://via.placeholder.com/150",
                    promises_crafted_by_experts_description: "Each bouquet is arranged by skilled florists who put heart and creativity into every detail.",
                    promises_crafted_by_experts_image: "https://via.placeholder.com/150",
                    promises_caring_for_moments_description: "Whether it’s a celebration, a comfort, or a simple “thank you,” we craft for your emotions.",
                    promises_caring_for_moments_image: "https://via.placeholder.com/150",
                });

                setAboutData(newAboutData);
            } catch (error) {
                console.error('Error fetching about data:', error);
            }
        };

        fetchAboutData();

        const channel = supabase
            .channel('public:app_content:about') // Unique channel name for this component
            .on('postgres_changes', { event: '*', schema: 'public', table: 'app_content' }, (payload) => {
                const { key, value } = payload.new;
                setAboutData(prev => {
                    const updated = { ...prev };
                    if (key === 'about_story') updated.story = value;
                    if (key === 'about_description') updated.about_description = value;
                    if (key === 'about_promise') updated.promise = value;
                    if (key === 'about_owner_quote') updated.ownerQuote = value;
                    if (key === 'about_owner_image') updated.ownerImage = value;
                    if (key === 'about_our_shop_img') updated.ourShopImage = value;
                    if (key === 'about_custom_bouquets_desc') updated.customBouquetsDescription = value;
                    if (key === 'about_custom_bouquets_img') updated.customBouquetsImage = value;
                    if (key === 'about_event_decorations_desc') updated.eventDecorationsDescription = value;
                    if (key === 'about_event_decorations_img') updated.eventDecorationsImage = value;
                    if (key === 'about_special_orders_desc') updated.specialOrdersDescription = value;
                    if (key === 'about_special_orders_img') updated.specialOrdersImage = value;
                    if (key === 'promises_responsibly_sourced_description') updated.promises_responsibly_sourced_description = value;
                    if (key === 'promises_responsibly_sourced_image') updated.promises_responsibly_sourced_image = value;
                    if (key === 'promises_crafted_by_experts_description') updated.promises_crafted_by_experts_description = value;
                    if (key === 'promises_crafted_by_experts_image') updated.promises_crafted_by_experts_image = value;
                    if (key === 'promises_caring_for_moments_description') updated.promises_caring_for_moments_description = value;
                    if (key === 'promises_caring_for_moments_image') updated.promises_caring_for_moments_image = value;
                    return updated;
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return (
        <div>
            {/* Hero */}
            <section className="about-hero">
                <div className="container">
                    <h1>About Us</h1>
                    <p className="lead text-muted">{aboutData.about_description}</p>
                </div>
            </section>

            {/* Story */}
            <section className="story-section">
                <div className="container">
                    <div className="row align-items-center g-5">
                        <div className="col-lg-6">
                            <div className="story-image-wrapper">
                                <img src={aboutData.ourShopImage || "https://via.placeholder.com/600x400"} alt="Our Shop" className="story-img shadow-lg" />
                            </div>
                        </div>
                        <div className="col-lg-6">
                            <div className="story-content">
                                <h2 className="mb-4 fw-bold">Our Shop</h2>
                                <p className="text-muted mb-4">
                                    {aboutData.story}
                                </p>
                                <p className="text-muted mb-4">
                                    {aboutData.about_description}
                                </p>
                                <p className="text-muted mb-0">
                                    {aboutData.promise}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Promise */}
            <section className="promise-section">
                <div className="container py-5">
                    <div className="text-center mb-5">
                        <h2 className="text-center mb-5 fw-bold">Our Services</h2>
                    </div>

                    <div className="row g-4">
                        <div className="col-md-4">
                            <div className="card h-100 border-0 rounded-4 overflow-hidden shadow hover-lift">
                                <div className="img-wrapper" style={{ height: '250px' }}>
                                    <Link to="/customized" className="d-block w-100 h-100">
                                        <img
                                            src={aboutData.customBouquetsImage || "https://via.placeholder.com/400x250"}
                                            className="w-100 h-100 object-fit-cover"
                                            alt="Custom Bouquets"
                                        />
                                    </Link>
                                </div>
                                <div className="card-body p-4 text-center">
                                    <h3 className="h4 fw-bold mb-3">Custom Bouquets</h3>
                                    <p className="text-muted mb-4">{aboutData.customBouquetsDescription}</p>
                                    <Link to="/customized" className="btn btn-pink rounded-pill px-4 fw-semibold">Learn More</Link>
                                </div>
                            </div>
                        </div>
                        <div className="col-md-4">
                            <div className="card h-100 border-0 rounded-4 overflow-hidden shadow hover-lift">
                                <div className="img-wrapper" style={{ height: '250px' }}>
                                    <Link to="/book-event" className="d-block w-100 h-100">
                                        <img
                                            src={aboutData.eventDecorationsImage || "https://via.placeholder.com/400x250"}
                                            className="w-100 h-100 object-fit-cover"
                                            alt="Event Decorations"
                                        />
                                    </Link>
                                </div>
                                <div className="card-body p-4 text-center">
                                    <h3 className="h4 fw-bold mb-3">Event Decorations</h3>
                                    <p className="text-muted mb-4">{aboutData.eventDecorationsDescription}</p>
                                    <Link to="/book-event" className="btn btn-pink rounded-pill px-4 fw-semibold">Learn More</Link>
                                </div>
                            </div>
                        </div>

                        <div className="col-md-4">
                            <div className="card h-100 border-0 rounded-4 overflow-hidden shadow hover-lift">
                                <div className="img-wrapper" style={{ height: '250px' }}>
                                    <Link to="/special-order" className="d-block w-100 h-100">
                                        <img
                                            src={aboutData.specialOrdersImage || "https://via.placeholder.com/400x250"}
                                            className="w-100 h-100 object-fit-cover"
                                            alt="Special Orders"
                                        />
                                    </Link>
                                </div>
                                <div className="card-body p-4 text-center">
                                    <h3 className="h4 fw-bold mb-3">Special Orders</h3>
                                    <p className="text-muted mb-4">{aboutData.specialOrdersDescription}</p>
                                    <Link to="/special-order" className="btn btn-pink rounded-pill px-4 fw-semibold">Learn More</Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="container">
                    <h2 className="text-center mb-5 fw-bold">Our Promise</h2>
                    <div className="row g-4">
                        <div className="col-md-4">
                            <div className="promise-card">
                                {aboutData.promises_responsibly_sourced_image && (
                                    <img src={aboutData.promises_responsibly_sourced_image} alt="Responsibly Sourced" className="promise-img" />
                                )}
                                <h3>Responsibly Sourced</h3>
                                <p className="text-muted">{aboutData.promises_responsibly_sourced_description}</p>
                            </div>
                        </div>
                        <div className="col-md-4">
                            <div className="promise-card">
                                {aboutData.promises_crafted_by_experts_image && (
                                    <img src={aboutData.promises_crafted_by_experts_image} alt="Crafted by Experts" className="promise-img" />
                                )}
                                <h3>Crafted by Experts</h3>
                                <p className="text-muted">{aboutData.promises_crafted_by_experts_description}</p>
                            </div>
                        </div>
                        <div className="col-md-4">
                            <div className="promise-card">
                                {aboutData.promises_caring_for_moments_image && (
                                    <img src={aboutData.promises_caring_for_moments_image} alt="Caring for Moments" className="promise-img" />
                                )}
                                <h3>Caring for Moments</h3>
                                <p className="text-muted">{aboutData.promises_caring_for_moments_description}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Team */}
            <section className="team-section">
                <div className="container">
                    <h2 className="mb-5 fw-bold">Meet The Owner</h2>
                    <img
                        src={aboutData.ownerImage || 'https://via.placeholder.com/150'}
                        alt="Owner"
                        className="owner-img shadow"
                        onError={(e) => e.target.src = 'https://via.placeholder.com/150'}
                    />
                    <figure className="text-center">
                        <blockquote className="blockquote">
                            <p className="quote">
                                "{aboutData.ownerQuote}"
                            </p>
                        </blockquote>
                        <figcaption className="blockquote-footer mt-3">
                            Owner of <cite title="Source Title">Jocery's Flower Shop</cite>
                        </figcaption>
                    </figure>
                </div>
            </section>
        </div>
    );
};

export default About;
