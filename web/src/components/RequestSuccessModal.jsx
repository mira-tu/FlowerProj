import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

const RequestSuccessModal = ({ show, onClose, message, photo }) => {
    const navigate = useNavigate();
    
    if (!show) return null;

    const handleViewOrders = () => {
        onClose();
        navigate('/profile');
    };

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
                maxWidth: photo ? '500px' : '400px',
                width: '90%',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}>
                <div style={{ fontSize: '3rem', color: '#4caf50', marginBottom: '1rem' }}>
                    <i className="fas fa-check-circle"></i>
                </div>
                <h3 style={{ marginBottom: '1rem', color: '#d63384' }}>Request Submitted!</h3>
                {photo && (
                    <div style={{ marginBottom: '1rem' }}>
                        <p style={{ marginBottom: '0.5rem', color: '#4b5563', fontSize: '0.9rem', fontWeight: '600' }}>
                            Your Customized Bouquet Preview:
                        </p>
                        <img 
                            src={photo} 
                            alt="Customized bouquet preview" 
                            style={{
                                maxWidth: '100%',
                                maxHeight: '300px',
                                borderRadius: '8px',
                                border: '2px solid #e0e0e0',
                                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                            }}
                        />
                    </div>
                )}
                <p style={{ marginBottom: '1rem', color: '#4b5563' }}>
                    {message || "Your request has been sent to the admin. Please wait for confirmation."}
                </p>
                <p style={{ marginBottom: '1.5rem', color: '#4b5563', fontSize: '0.9rem' }}>
                    You can track your request in <strong>My Orders</strong>.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    <button
                        onClick={onClose}
                        style={{
                            backgroundColor: 'transparent',
                            color: '#4b5563',
                            border: '1px solid #d1d5db',
                            padding: '0.5rem 1.5rem',
                            borderRadius: '9999px',
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        Close
                    </button>
                    <button
                        onClick={handleViewOrders}
                        style={{
                            backgroundColor: '#d63384',
                            color: 'white',
                            border: 'none',
                            padding: '0.5rem 1.5rem',
                            borderRadius: '9999px',
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        View My Orders
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RequestSuccessModal;
