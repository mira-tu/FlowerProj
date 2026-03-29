import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../config/supabase';
import '../styles/About.css';

import shopImg from '../assets/pictures/aboutpage/Our-Shop.jpg';
import ownerImg from '../assets/pictures/aboutpage/The-Owner.jpg';
import responsiblySourcedImg from '../assets/pictures/aboutpage/Our-Promises-Responsibly-Sourced.webp';
import craftedByExpertsImg from '../assets/pictures/aboutpage/Our-Promises-Crafted-by-Experts.png';
import caringForMomentsImg from '../assets/pictures/aboutpage/Our-Promises-Caring-for-Moments.png';

import customBouquetsImg from '../assets/pictures/aboutpage/Customized-image.jpg';
import customOrderImg from '../assets/pictures/aboutpage/Custom-Order.jpg';

const ABOUT_CONTENT_KEYS = [
    'about_story', 'about_description', 'about_promise', 'about_owner_quote',
    'about_owner_image', 'about_our_shop_img',
    'about_custom_bouquets_desc', 'about_custom_bouquets_img',
    'about_event_decorations_desc', 'about_event_decorations_img',
    'about_special_orders_desc', 'about_special_orders_img',
    'promises_responsibly_sourced_description', 'promises_responsibly_sourced_image',
    'promises_crafted_by_experts_description', 'promises_crafted_by_experts_image',
    'promises_caring_for_moments_description', 'promises_caring_for_moments_image',
];

const createDefaultAboutData = () => ({
    story: "Jocerry's Flower Shop was born from a love for flowers and a desire to make every occasion feel special.",
    about_description: "We are a local flower shop in Zamboanga City, offering fresh floral arrangements through a simple and convenient online store.",
    promise: "We promise thoughtfully crafted arrangements, reliable service, and flowers that help you celebrate life's most meaningful moments.",
    ownerQuote: "Where flowers bloom, hope takes root.",
    ownerImage: null,
    ourShopImage: null,
    customBouquetsDescription: "Create your own unique arrangement with your choice of flowers, colors, and wrapping.",
    customBouquetsImage: null,
    eventDecorationsDescription: "Beautiful floral arrangements for weddings, parties, and corporate events.",
    eventDecorationsImage: null,
    specialOrdersDescription: "Add chocolates, teddy bears, and personalized gifts to make your surprise extra special.",
    specialOrdersImage: null,
    promises_responsibly_sourced_description: "We work with ethical suppliers to ensure our flowers are fresh, sustainable, and responsibly grown.",
    promises_responsibly_sourced_image: null,
    promises_crafted_by_experts_description: "Each bouquet is arranged by skilled florists who put heart and creativity into every detail.",
    promises_crafted_by_experts_image: null,
    promises_caring_for_moments_description: "Whether it's a celebration, a comfort, or a simple thank you, we craft for your emotions.",
    promises_caring_for_moments_image: null,
});

const mapAppContentRowsToAboutData = (rows = []) => {
    const normalizedRows = [...rows].sort((left, right) => {
        const leftUpdatedAt = Date.parse(left?.updated_at || '') || 0;
        const rightUpdatedAt = Date.parse(right?.updated_at || '') || 0;

        if (rightUpdatedAt !== leftUpdatedAt) {
            return rightUpdatedAt - leftUpdatedAt;
        }

        return Number(right?.id || 0) - Number(left?.id || 0);
    });

    const latestRowsByKey = new Map();
    normalizedRows.forEach((row) => {
        if (!latestRowsByKey.has(row.key)) {
            latestRowsByKey.set(row.key, row.value);
        }
    });

    const aboutData = createDefaultAboutData();
    const assign = (key, field) => {
        if (latestRowsByKey.has(key)) {
            aboutData[field] = latestRowsByKey.get(key);
        }
    };

    assign('about_story', 'story');
    assign('about_description', 'about_description');
    assign('about_promise', 'promise');
    assign('about_owner_quote', 'ownerQuote');
    assign('about_owner_image', 'ownerImage');
    assign('about_our_shop_img', 'ourShopImage');
    assign('about_custom_bouquets_desc', 'customBouquetsDescription');
    assign('about_custom_bouquets_img', 'customBouquetsImage');
    assign('about_event_decorations_desc', 'eventDecorationsDescription');
    assign('about_event_decorations_img', 'eventDecorationsImage');
    assign('about_special_orders_desc', 'specialOrdersDescription');
    assign('about_special_orders_img', 'specialOrdersImage');
    assign('promises_responsibly_sourced_description', 'promises_responsibly_sourced_description');
    assign('promises_responsibly_sourced_image', 'promises_responsibly_sourced_image');
    assign('promises_crafted_by_experts_description', 'promises_crafted_by_experts_description');
    assign('promises_crafted_by_experts_image', 'promises_crafted_by_experts_image');
    assign('promises_caring_for_moments_description', 'promises_caring_for_moments_description');
    assign('promises_caring_for_moments_image', 'promises_caring_for_moments_image');

    return aboutData;
};

const About = () => {
    const [aboutData, setAboutData] = useState(createDefaultAboutData);

    useEffect(() => {
        const fetchAboutData = async () => {
            try {
                const { data, error } = await supabase
                    .from('app_content')
                    .select('id, key, value, updated_at')
                    .in('key', ABOUT_CONTENT_KEYS);

                if (error) throw error;

                setAboutData(mapAppContentRowsToAboutData(data || []));
            } catch (error) {
                console.error('Error fetching about data:', error);
            }
        };

        fetchAboutData();

        const channel = supabase
            .channel('public:app_content:about')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'app_content' }, (payload) => {
                const changedKey = payload.new?.key || payload.old?.key;
                if (ABOUT_CONTENT_KEYS.includes(changedKey)) {
                    fetchAboutData();
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return (
        <div>
            <section className="about-hero">
                <div className="container">
                    <h1>About Us</h1>
                    <p className="lead text-muted">{aboutData.about_description}</p>
                </div>
            </section>

            <section className="story-section">
                <div className="container">
                    <div className="row align-items-center g-5">
                        <div className="col-lg-6">
                            <div className="story-image-wrapper">
                                <img
                                    src={aboutData.ourShopImage || shopImg}
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
                                <p className="text-muted mb-4">{aboutData.story}</p>
                                <p className="text-muted mb-0">{aboutData.promise}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

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
                                            src={aboutData.customBouquetsImage || customBouquetsImg}
                                            className="w-100 h-100 object-fit-cover"
                        alt="Customizer Studio"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    </Link>
                                </div>
                                <div className="card-body p-4 text-center d-flex flex-column">
                  <h3 className="h4 fw-bold mb-3">Customizer Studio</h3>
                                    <p className="text-muted mb-4">{aboutData.customBouquetsDescription}</p>
                                    <div className="mt-auto">
                                        <Link to="/customized" className="btn btn-pink rounded-pill px-4 fw-semibold w-50">Learn More</Link>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="col-md-6">
                            <div className="card h-100 border-0 rounded-4 overflow-hidden shadow hover-lift d-flex flex-column">
                                <div className="img-wrapper" style={{ height: '300px' }}>
                                    <Link to="/custom-order" className="d-block w-100 h-100">
                                        <img
                                            src={aboutData.eventDecorationsImage || customOrderImg}
                                            className="w-100 h-100 object-fit-cover"
                                            alt="Custom Order"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    </Link>
                                </div>
                                <div className="card-body p-4 text-center d-flex flex-column">
                                    <h3 className="h4 fw-bold mb-3">Custom Order</h3>
                                    <p className="text-muted mb-4">{aboutData.eventDecorationsDescription}</p>
                                    <div className="mt-auto">
                                        <Link to="/custom-order" className="btn btn-pink rounded-pill px-4 fw-semibold w-50">Learn More</Link>
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
                            <img src={aboutData.promises_responsibly_sourced_image || responsiblySourcedImg} alt="Responsibly Sourced" className="promise-img" loading="lazy" decoding="async" />
                            <h3>Responsibly Sourced</h3>
                            <p className="text-muted">{aboutData.promises_responsibly_sourced_description}</p>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="promise-card">
                            <img src={aboutData.promises_crafted_by_experts_image || craftedByExpertsImg} alt="Crafted by Experts" className="promise-img" loading="lazy" decoding="async" />
                            <h3>Crafted by Experts</h3>
                            <p className="text-muted">{aboutData.promises_crafted_by_experts_description}</p>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="promise-card">
                            <img src={aboutData.promises_caring_for_moments_image || caringForMomentsImg} alt="Caring for Moments" className="promise-img" loading="lazy" decoding="async" />
                            <h3>Caring for Moments</h3>
                            <p className="text-muted">{aboutData.promises_caring_for_moments_description}</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="team-section">
                <div className="container">
                    <h2 className="mb-5 fw-bold">Meet The Owner</h2>
                    <img
                        src={aboutData.ownerImage || ownerImg}
                        alt="Owner"
                        className="owner-img shadow"
                        loading="lazy"
                        decoding="async"
                    />
                    <figure className="text-center">
                        <blockquote className="blockquote">
                            <p className="quote">"{aboutData.ownerQuote}"</p>
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
