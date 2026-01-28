import React from 'react';
import { Link } from 'react-router-dom';

const InfoModal = ({ show, onClose, title, message, linkTo, linkText, linkState }) => {
    if (!show) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '2rem',
                borderRadius: '1rem',
                textAlign: 'center',
                maxWidth: '400px',
                width: '90%',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}>
                {title && <h3 style={{ marginBottom: '1rem', color: '#d63384' }}>{title}</h3>}
                <p style={{ marginBottom: '1.5rem', color: '#4b5563' }}>
                    {message}
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                    <button
                        onClick={onClose}
                        style={{
                            backgroundColor: '#6c757d',
                            color: 'white',
                            border: 'none',
                            padding: '0.5rem 1.5rem',
                            borderRadius: '9999px',
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        Close
                    </button>
                    {linkTo && (
                        <Link 
                            to={linkTo} 
                            state={linkState}
                            onClick={onClose} // Also close modal on link click
                            style={{
                                backgroundColor: '#d63384',
                                color: 'white',
                                border: 'none',
                                padding: '0.5rem 1.5rem',
                                borderRadius: '9999px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center'
                            }}
                        >
                            {linkText || 'Go'}
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InfoModal;
