import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../config/supabase';
import '../styles/About.css';

import shopImg from '../assets/pictures/aboutpage/Our-Shop.jpg';
import ownerImg from '../assets/pictures/aboutpage/The-Owner.jpg';
import responsiblySourcedImg from '../assets/pictures/aboutpage/Our-Promises-Responsibly-Sourced.webp';
import craftedByExpertsImg from '../assets/pictures/aboutpage/Our-Promises-Crafted-by-Experts.png';
import caringForMomentsImg from '../assets/pictures/aboutpage/Our-Promises-Caring-for-Moments.png';

// Services
import customBouquetsImg from '../assets/pictures/aboutpage/Customized-image.jpg';
import customOrderImg from '../assets/pictures/aboutpage/Custom-Order.jpg';

const About = () => {
    const [aboutData, setAboutData] = useState({
        story: "Jocerry's Flower Shop was born from a love for flowers and a desire to make every occasion feel special.",
        about_description: "We are a local flower shop in Zamboanga City, offering fresh floral arrangements through a simple and convenient online store.",
        promise: "We promise thoughtfully crafted arrangements, reliable service, and flowers that help you celebrate life’s most meaningful moments.",
        ownerQuote: "Where flowers bloom, hope takes root.",
        ownerImage: "https://via.placeholder.com/150",
        ourShopImage: "https://via.placeholder.com/600x400",
        customBouquetsDescription: "Create your own unique arrangement with your choice of flowers, colors, and wrapping.",
        customBouquetsImage: "https://via.placeholder.com/400x250",
        eventDecorationsDescription: "Beautiful floral arrangements for weddings, parties, and corporate events.",
        eventDecorationsImage: "https://via.placeholder.com/400x250",
        specialOrdersDescription: "Add chocolates, teddy bears, and personalized gifts to make your surprise extra special.",
        specialOrdersImage: "https://via.placeholder.com/400x250",
        promises_responsibly_sourced_description: "We work with ethical suppliers to ensure our flowers are fresh, sustainable, and responsibly grown.",
        promises_crafted_by_experts_description: "Each bouquet is arranged by skilled florists who put heart and creativity into every detail.",
        promises_caring_for_moments_description: "Whether it’s a celebration, a comfort, or a simple thank you, we craft for your emotions.",
    });

    useEffect(() => {
        const fetchAboutData = async () => {
            try {
                const { data, error } = await supabase
                    .from('app_content')
                    .select('key, value')
                    .in('key', [
                        'about_story', 'about_description', 'about_promise', 'about_owner_quote',
                        'about_custom_bouquets_desc', 'about_custom_bouquets_img',
                        'about_event_decorations_desc', 'about_event_decorations_img',
                        'about_special_orders_desc', 'about_special_orders_img',
                        'promises_responsibly_sourced_description',
                        'promises_crafted_by_experts_description',
                        'promises_caring_for_moments_description'
                    ]);

                if (error) throw error;

                const newAboutData = data.reduce((acc, item) => {
                    if (item.key === 'about_story') acc.story = item.value;
                    if (item.key === 'about_description') acc.about_description = item.value;
                    if (item.key === 'about_promise') acc.promise = item.value;
                    if (item.key === 'about_owner_quote') acc.ownerQuote = item.value;
                    if (item.key === 'about_custom_bouquets_desc') acc.customBouquetsDescription = item.value;
                    if (item.key === 'about_custom_bouquets_img') acc.customBouquetsImage = item.value;
                    if (item.key === 'about_event_decorations_desc') acc.eventDecorationsDescription = item.value;
                    if (item.key === 'about_event_decorations_img') acc.eventDecorationsImage = item.value;
                    if (item.key === 'about_special_orders_desc') acc.specialOrdersDescription = item.value;
                    if (item.key === 'about_special_orders_img') acc.specialOrdersImage = item.value;
                    if (item.key === 'promises_responsibly_sourced_description') acc.promises_responsibly_sourced_description = item.value;
                    if (item.key === 'promises_crafted_by_experts_description') acc.promises_crafted_by_experts_description = item.value;
                    if (item.key === 'promises_caring_for_moments_description') acc.promises_caring_for_moments_description = item.value;
                    return acc;
                }, aboutData);

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
                    if (key === 'about_custom_bouquets_desc') updated.customBouquetsDescription = value;
                    if (key === 'about_custom_bouquets_img') updated.customBouquetsImage = value;
                    if (key === 'about_event_decorations_desc') updated.eventDecorationsDescription = value;
                    if (key === 'about_event_decorations_img') updated.eventDecorationsImage = value;
                    if (key === 'about_special_orders_desc') updated.specialOrdersDescription = value;
                    if (key === 'about_special_orders_img') updated.specialOrdersImage = value;
                    if (key === 'promises_responsibly_sourced_description') updated.promises_responsibly_sourced_description = value;
                    if (key === 'promises_crafted_by_experts_description') updated.promises_crafted_by_experts_description = value;
                    if (key === 'promises_caring_for_moments_description') updated.promises_caring_for_moments_description = value;
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
                    <p className="lead text-muted">We are a local flower shop in Zamboanga City, offering fresh floral arrangements through a simple and convenient online store.</p>
                </div>
            </section>

            {/* Story */}
            <section className="story-section">
                <div className="container">
                    <div className="row align-items-center g-5">
                        <div className="col-lg-6">
                            <div className="story-image-wrapper">
                                <img
                                    src={shopImg}
                                    alt="Our Shop"
                                    className="story-img shadow-lg"
                                    loading="lazy"
                                    decoding="async"
                                />
                            </div>
                        </div>
                        <div className="col-lg-6">
                            <div className="story-content">
                                <h2 className="mb-4 fw-bold">Our Shop</h2>
                                <p className="text-muted mb-4">
                                    Jocerry's Flower Shop was born from a love for flowers and a desire to make every occasion feel special.
                                </p>
                                <p className="text-muted mb-4">
                                    We are a local flower shop in Zamboanga City, offering fresh floral arrangements through a simple and convenient online store.
                                </p>
                                <p className="text-muted mb-0">
                                    We promise thoughtfully crafted arrangements, reliable service, and flowers that help you celebrate life’s most meaningful moments.
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

                    <div className="row g-4 justify-content-center">
                        <div className="col-md-6">
                            <div className="card h-100 border-0 rounded-4 overflow-hidden shadow hover-lift d-flex flex-column">
                                <div className="img-wrapper" style={{ height: '300px' }}>
                                    <Link to="/customized" className="d-block w-100 h-100">
                                        <img
                                            src={customBouquetsImg}
                                            className="w-100 h-100 object-fit-cover"
                                            alt="Customized Bouquets"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    </Link>
                                </div>
                                <div className="card-body p-4 text-center d-flex flex-column">
                                    <h3 className="h4 fw-bold mb-3">Customized Bouquets</h3>
                                    <p className="text-muted mb-4">Create your own unique arrangement with your choice of flowers, colors, and wrapping.</p>
                                    <div className="mt-auto">
                                        <Link to="/customized" className="btn btn-pink rounded-pill px-4 fw-semibold w-50">Learn More</Link>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="col-md-6">
                            <div className="card h-100 border-0 rounded-4 overflow-hidden shadow hover-lift d-flex flex-column">
                                <div className="img-wrapper" style={{ height: '300px' }}>
                                    <Link to="/book-event" className="d-block w-100 h-100">
                                        <img
                                            src={customOrderImg}
                                            className="w-100 h-100 object-fit-cover"
                                            alt="Custom Order"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    </Link>
                                </div>
                                <div className="card-body p-4 text-center d-flex flex-column">
                                    <h3 className="h4 fw-bold mb-3">Custom Order</h3>
                                    <p className="text-muted mb-4">
                                        Beautiful floral arrangements for weddings, parties, and corporate events. Add chocolates, teddy bears, and personalized gifts to make your surprise extra special.
                                    </p>
                                    <div className="mt-auto">
                                        <Link to="/book-event" className="btn btn-pink rounded-pill px-4 fw-semibold w-50">Learn More</Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <h2 className="text-center mb-5 fw-bold">Our Promise</h2>
                <div className="row g-4">
                    <div className="col-md-4">
                        <div className="promise-card">
                            <img src={responsiblySourcedImg} alt="Responsibly Sourced" className="promise-img" loading="lazy" decoding="async" />
                            <h3>Responsibly Sourced</h3>
                            <p className="text-muted">We work with ethical suppliers to ensure our flowers are fresh, sustainable, and responsibly grown.</p>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="promise-card">
                            <img src={craftedByExpertsImg} alt="Crafted by Experts" className="promise-img" loading="lazy" decoding="async" />
                            <h3>Crafted by Experts</h3>
                            <p className="text-muted">Each bouquet is arranged by skilled florists who put heart and creativity into every detail.</p>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="promise-card">
                            <img src={caringForMomentsImg} alt="Caring for Moments" className="promise-img" loading="lazy" decoding="async" />
                            <h3>Caring for Moments</h3>
                            <p className="text-muted">Whether it’s a celebration, a comfort, or a simple thank you, we craft for your emotions.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Team */}
            <section className="team-section">
                <div className="container">
                    <h2 className="mb-5 fw-bold">Meet The Owner</h2>
                    <img
                        src={ownerImg}
                        alt="Owner"
                        className="owner-img shadow"
                        loading="lazy"
                        decoding="async"
                    />
                    <figure className="text-center">
                        <blockquote className="blockquote">
                            <p className="quote">
                                "Where flowers bloom, hope takes root."
                            </p>
                        </blockquote>
                        <figcaption className="blockquote-footer mt-3">
                            Owner of <cite title="Source Title">Jocerry's Flower Shop</cite>
                        </figcaption>
                    </figure>
                </div>
            </section>
        </div>
    );
};

export default About;
