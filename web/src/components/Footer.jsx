import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/Footer.css';

const Footer = () => {
    return (
        <footer>
            <div className="container">
                <div className="row">
                    <div className="col-md-4 mb-4">
                        <h5 className="footer-title">Jocery's Flower Shop</h5>
                        <p className="text-secondary">Making every moment special with beautiful flowers.</p>
                    </div>
                    <div className="col-md-4 mb-4">
                        <h5 className="footer-title">Quick Links</h5>
                        <Link to="/" className="footer-link">Home</Link>
                        <Link to="/about" className="footer-link">About Us</Link>
                        <Link to="/contact" className="footer-link">Contact</Link>
                    </div>
                    <div className="col-md-4 mb-4">
                        <h5 className="footer-title">Follow Us</h5>
                        <div>
                            <a href="#" className="social-icon"><i className="fab fa-facebook"></i></a>
                        </div>
                    </div>
                </div>
                <div className="text-center border-top border-secondary pt-3 mt-3 d-flex justify-content-center align-items-center gap-3">
                    <Link to="/terms" className="text-secondary text-decoration-none small">Terms of Service</Link>
                    <span className="text-secondary small">|</span>
                    <Link to="/privacy" className="text-secondary text-decoration-none small">Privacy Policy</Link>
                </div>
                <div className="text-center pt-2">
                    <p className="text-secondary mb-0">&copy; 2024 Jocery's Flower Shop. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
