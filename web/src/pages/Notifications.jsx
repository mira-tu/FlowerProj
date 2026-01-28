import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/Shop.css';

const Notifications = () => {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [filter, setFilter] = useState('all'); // all, unread, read

    useEffect(() => {
        const loadFromLocalStorage = () => {
            const savedNotifications = JSON.parse(localStorage.getItem('notifications') || '[]');
            savedNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            setNotifications(savedNotifications);
        };

        // Load initial data from local storage
        loadFromLocalStorage();

        // The global listener in App.jsx will update localStorage and dispatch a 'storage' event.
        // This listener reacts to that event to update the view.
        window.addEventListener('storage', loadFromLocalStorage);

        // Cleanup the event listener when the component unmounts
        return () => {
            window.removeEventListener('storage', loadFromLocalStorage);
        };
    }, []);

    const filteredNotifications = notifications.filter(notification => {
        if (filter === 'unread') return !notification.read;
        if (filter === 'read') return notification.read;
        return true;
    });

    const unreadCount = notifications.filter(n => !n.read).length;

    const handleNotificationClick = async (notification) => {
        // Optimistically update the UI to feel responsive
        const updatedNotifications = notifications.map(n =>
            n.id === notification.id ? { ...n, read: true } : n
        );
        localStorage.setItem('notifications', JSON.stringify(updatedNotifications));
        setNotifications(updatedNotifications);

        // Update the database in the background
        try {
            await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', notification.id);
        } catch (error) {
            console.error("Error marking notification as read in DB:", error);
            // Optional: Here you could revert the optimistic UI update on failure
        }

        // Navigate if there's a link
        if (notification.link) {
            navigate(notification.link);
        }
    };

    const markAllAsRead = async () => {
        // Optimistic UI update
        const updatedNotifications = notifications.map(n => ({ ...n, read: true }));
        localStorage.setItem('notifications', JSON.stringify(updatedNotifications));
        setNotifications(updatedNotifications);

        // Update database
        const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
        if (unreadIds.length > 0) {
            try {
                await supabase
                    .from('notifications')
                    .update({ is_read: true })
                    .in('id', unreadIds);
            } catch (error) {
                console.error("Error marking all as read in DB:", error);
            }
        }
    };

    const clearAllNotifications = async () => {
        if (window.confirm('Are you sure you want to clear all notifications?')) {
            const allIds = notifications.map(n => n.id);
            
            // Optimistic UI update
            localStorage.setItem('notifications', JSON.stringify([]));
            setNotifications([]);

            // Update database
            if (allIds.length > 0) {
                try {
                    await supabase
                        .from('notifications')
                        .delete()
                        .in('id', allIds);
                } catch (error) {
                    console.error("Error clearing all notifications from DB:", error);
                }
            }
        }
    };

    const deleteNotification = async (notificationId) => {
        // Optimistic UI update
        const updatedNotifications = notifications.filter(n => n.id !== notificationId);
        localStorage.setItem('notifications', JSON.stringify(updatedNotifications));
        setNotifications(updatedNotifications);

        // Update database
        try {
            await supabase
                .from('notifications')
                .delete()
                .eq('id', notificationId);
        } catch (error) {
            console.error("Error deleting notification from DB:", error);
        }
    };

    const getNotificationIcon = (type) => {
        const icons = {
            order: 'fa-shopping-bag',
            request: 'fa-file-alt',
            cancellation: 'fa-times-circle',
            default: 'fa-info-circle'
        };
        return icons[type] || icons.default;
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        
        return date.toLocaleString('en-PH', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="profile-container">
            <div className="container py-5">
                <div className="d-flex justify-content-between align-items-center mb-4">
                    <h2 className="fw-bold mb-0">
                        <i className="fas fa-bell me-2" style={{ color: 'var(--shop-pink)' }}></i>
                        Notifications
                    </h2>
                    <Link to="/profile" className="btn btn-outline-secondary">
                        <i className="fas fa-arrow-left me-2"></i>Back to Profile
                    </Link>
                </div>

                {notifications.length > 0 && (
                    <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                        <div className="d-flex gap-2">
                            <button
                                className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
                                onClick={() => setFilter('all')}
                                style={filter === 'all' ? { background: 'var(--shop-pink)', border: 'none' } : {}}
                            >
                                All ({notifications.length})
                            </button>
                            <button
                                className={`btn btn-sm ${filter === 'unread' ? 'btn-primary' : 'btn-outline-secondary'}`}
                                onClick={() => setFilter('unread')}
                                style={filter === 'unread' ? { background: 'var(--shop-pink)', border: 'none' } : {}}
                            >
                                Unread ({unreadCount})
                            </button>
                            <button
                                className={`btn btn-sm ${filter === 'read' ? 'btn-primary' : 'btn-outline-secondary'}`}
                                onClick={() => setFilter('read')}
                                style={filter === 'read' ? { background: 'var(--shop-pink)', border: 'none' } : {}}
                            >
                                Read ({notifications.length - unreadCount})
                            </button>
                        </div>
                        <div className="d-flex gap-2">
                            {unreadCount > 0 && (
                                <button
                                    className="btn btn-sm btn-outline-primary"
                                    onClick={markAllAsRead}
                                >
                                    <i className="fas fa-check-double me-1"></i>Mark all as read
                                </button>
                            )}
                            <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={clearAllNotifications}
                            >
                                <i className="fas fa-trash me-1"></i>Clear all
                            </button>
                        </div>
                    </div>
                )}

                {filteredNotifications.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <i className="fas fa-bell-slash"></i>
                        </div>
                        <h3>No notifications</h3>
                        <p>
                            {filter === 'all' 
                                ? "You don't have any notifications yet."
                                : filter === 'unread'
                                ? "You don't have any unread notifications."
                                : "You don't have any read notifications."}
                        </p>
                        {filter !== 'all' && (
                            <button
                                className="btn btn-outline-secondary"
                                onClick={() => setFilter('all')}
                            >
                                View all notifications
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="notifications-list">
                        {filteredNotifications.map(notification => (
                            <div
                                key={notification.id}
                                className={`notification-card ${!notification.read ? 'unread' : ''}`}
                                onClick={() => handleNotificationClick(notification)}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="d-flex align-items-start gap-3">
                                    <div 
                                        className="notification-icon-large"
                                        style={{
                                            width: '50px',
                                            height: '50px',
                                            borderRadius: '50%',
                                            background: !notification.read ? 'var(--shop-pink)' : '#e9ecef',
                                            color: !notification.read ? 'white' : '#6c757d',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0
                                        }}
                                    >
                                        <i className={`fas ${notification.icon || getNotificationIcon(notification.type)}`}></i>
                                    </div>
                                    <div className="flex-grow-1">
                                        <div className="d-flex justify-content-between align-items-start mb-1">
                                            <h6 className="mb-0 fw-bold">{notification.title}</h6>
                                            {!notification.read && (
                                                <span 
                                                    className="badge bg-primary"
                                                    style={{ background: 'var(--shop-pink)' }}
                                                >
                                                    New
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-muted mb-2" style={{ fontSize: '0.9rem' }}>
                                            {notification.message}
                                        </p>
                                        <div className="d-flex justify-content-between align-items-center">
                                            <small className="text-muted">
                                                <i className="far fa-clock me-1"></i>
                                                {formatTime(notification.timestamp)}
                                            </small>
                                            <button
                                                className="btn btn-sm btn-link text-danger p-0"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteNotification(notification.id);
                                                }}
                                                style={{ fontSize: '0.8rem' }}
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Notifications;