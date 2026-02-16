import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import '../styles/Contact.css';

const Contact = () => {
    const [contactData, setContactData] = useState({
        address: 'Zamboanga City, Philippines',
        phone: '+63 756 347 901',
        email: 'JoceryFlowerShop@gmail.com',
        mapUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d990.2144164418011!2d122.07262366954967!3d6.907617899568239!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x325041fd27aa9973%3A0xeb26bf1f88440525!2s63%20San%20Jose%20Road%2C%20Zamboanga%20City%2C%207000%20Zamboanga%20del%20Sur!5e0!3m2!1sen!2sph!4v1769653703598!5m2!1sen!2sph'
    });

    useEffect(() => {
        const fetchContactData = async () => {
            try {
                const { data, error } = await supabase
                    .from('app_content')
                    .select('key, value')
                    .in('key', ['contact_address', 'contact_phone', 'contact_email', 'contact_map_url']);

                if (error) throw error;

                const newContactData = data.reduce((acc, item) => {
                    if (item.key === 'contact_address') acc.address = item.value;
                    if (item.key === 'contact_phone') acc.phone = item.value;
                    if (item.key === 'contact_email') acc.email = item.value;
                    if (item.key === 'contact_map_url') acc.mapUrl = item.value;
                    return acc;
                }, {});

                setContactData(prev => ({...prev, ...newContactData}));
            } catch (error) {
                console.error('Error fetching contact data:', error);
                // Keep existing static fallback values if Supabase content fails.
            }
        };

        fetchContactData();

        const channel = supabase
            .channel('public:app_content')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'app_content' }, (payload) => {
                const { key, value } = payload.new;
                setContactData(prev => {
                    const updated = { ...prev };
                    if (key === 'contact_address') updated.address = value;
                    if (key === 'contact_phone') updated.phone = value;
                    if (key === 'contact_email') updated.email = value;
                    if (key === 'contact_map_url') updated.mapUrl = value;
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
            {/* Header */}
            <header className="contact-header">
                <div className="container">
                    <h1>Contact Us</h1>
                    <p className="lead text-muted">We'd love to hear from you. Get in touch!</p>
                </div>
            </header>

            {/* Contact Info */}
            <section className="container mb-5">
                <div className="row g-4">
                    <div className="col-md-4">
                        <div className="info-card">
                            <div className="icon-circle">
                                <i className="fas fa-map-marker-alt"></i>
                            </div>
                            <h3>Visit Us</h3>
                            <p>{contactData.address}</p>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="info-card">
                            <div className="icon-circle">
                                <i className="fas fa-phone-alt"></i>
                            </div>
                            <h3>Call Us</h3>
                            <p>{contactData.phone}</p>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="info-card">
                            <div className="icon-circle">
                                <i className="fas fa-envelope"></i>
                            </div>
                            <h3>Email Us</h3>
                            <p>{contactData.email}</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Map */}
            <section className="container mb-5">
                <h2 className="text-center mb-4 fw-bold">Our Location</h2>
                {contactData.mapUrl ? (
                    <div className="map-container">
                        <iframe
                            src={contactData.mapUrl}
                            allowFullScreen=""
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                            title="Google Map"
                        >
                        </iframe>
                    </div>
                ) : (
                    <div className="map-container-placeholder">
                        <p>Map not available. Please configure it in the admin dashboard with a Google Maps embed URL.</p>
                    </div>
                )}
            </section>
        </div>
    );
};

export default Contact;
