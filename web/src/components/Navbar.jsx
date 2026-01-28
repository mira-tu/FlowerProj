import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import '../styles/Navbar.css';

const Navbar = ({ cartCount, user, logout }) => {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isMobile, setIsMobile] = useState(false);
    const [unreadMessageCount, setUnreadMessageCount] = useState(0);

    useEffect(() => {
        if (!user) {
            setUnreadMessageCount(0);
            return;
        }

        const fetchUnreadCount = async () => {
            const { count, error } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('receiver_id', user.id)
                .eq('is_read', false);

            if (!error) {
                setUnreadMessageCount(count);
            }
        };

        fetchUnreadCount();

        const messagesChannel = supabase.channel('public:messages')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, payload => {
                fetchUnreadCount();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(messagesChannel);
        };
    }, [user]);


    useEffect(() => {
        // Check if mobile on mount and resize
        const checkMobile = () => {
            setIsMobile(window.innerWidth <= 768);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);

        // Load notifications from localStorage
        const loadNotifications = () => {
            const savedNotifications = JSON.parse(localStorage.getItem('notifications') || '[]');
            setNotifications(savedNotifications);
            setUnreadCount(savedNotifications.filter(n => !n.read).length);
        };

        loadNotifications();

        // Listen for storage changes (when new notifications are added from other tabs)
        const handleStorageChange = () => {
            loadNotifications();
        };

        window.addEventListener('storage', handleStorageChange);

        // Also check periodically for changes (for same-tab updates)
        const interval = setInterval(loadNotifications, 1000);

        // Close dropdown when clicking outside
        const handleClickOutside = (event) => {
            if (showNotifications && !event.target.closest('.notification-wrapper')) {
                setShowNotifications(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            window.removeEventListener('resize', checkMobile);
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(interval);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showNotifications]);

    const handleNotificationClick = (notification) => {
        // Mark as read
        const updatedNotifications = notifications.map(n =>
            n.id === notification.id ? { ...n, read: true } : n
        );
        localStorage.setItem('notifications', JSON.stringify(updatedNotifications));
        setNotifications(updatedNotifications);
        setUnreadCount(updatedNotifications.filter(n => !n.read).length);

        // Navigate if there's a link
        if (notification.link) {
            navigate(notification.link);
            setShowNotifications(false);
        }
    };

    const markAllAsRead = () => {
        const updatedNotifications = notifications.map(n => ({ ...n, read: true }));
        localStorage.setItem('notifications', JSON.stringify(updatedNotifications));
        setNotifications(updatedNotifications);
        setUnreadCount(0);
    };

    const clearAllNotifications = () => {
        localStorage.setItem('notifications', JSON.stringify([]));
        setNotifications([]);
        setUnreadCount(0);
    };

    return (
        <>
            <nav className="navbar navbar-expand-lg fixed-top">
                <div className="container-fluid px-5">
                    <Link className="navbar-brand d-flex align-items-center" to="/">
                        <span>Jocery's Flower Shop</span>
                    </Link>
                    <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                        <span className="navbar-toggler-icon"></span>
                    </button>
                    <div className="collapse navbar-collapse" id="navbarNav">
                        <ul className="navbar-nav mx-auto">
                            <li className="nav-item"><Link className="nav-link active" to="/">Home</Link></li>
                            <li className="nav-item"><Link className="nav-link" to="/about">About</Link></li>
                            <li className="nav-item"><Link className="nav-link" to="/contact">Contact</Link></li>
                            <li className="nav-item dropdown">
                                <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                                    Services
                                </a>
                                <ul className="dropdown-menu services-menu border-0 shadow-sm">
                                    <li><Link className="dropdown-item" to="/book-event">Booking for an Event</Link></li>
                                    <li><Link className="dropdown-item" to="/customized">Customized Bouquets</Link></li>
                                    <li><Link className="dropdown-item" to="/special-order">Special Orders</Link></li>
                                </ul>
                            </li>
                        </ul>
                        <div className="nav-icons d-flex align-items-center">
                            <Link to="/wishlist" className="btn-icon">
                                <i className="fa-regular fa-heart"></i>
                            </Link>

                            <Link to="/profile" state={{ activeMenu: 'messages' }} className="btn-icon">
                                <i className="fa-regular fa-message"></i> {/* Changed from fa-bell */}
                                {unreadMessageCount > 0 && (
                                    <span className="badge-count">{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</span>
                                )}
                            </Link>
                            
                            <div className="notification-wrapper position-relative">
                                {/* ... existing notification code ... */}
                            </div>
                            <Link to="/cart" className="btn-icon">
                                <i className="fa-solid fa-cart-shopping"></i>
                                <span className="badge-count">{cartCount}</span>
                            </Link>

                            {/* Generic Notification Bell - moved here */}
                            <Link to="/notifications" className="btn-icon">
                                <i className="fa-regular fa-bell"></i>
                                {unreadCount > 0 && (
                                    <span className="badge-count">{unreadCount > 9 ? '9+' : unreadCount}</span>
                                )}
                            </Link>

                            {user ? (
                                <div className="nav-item dropdown ms-2">
                                    <a className="nav-link dropdown-toggle d-flex align-items-center" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                                        <div className="btn-icon">
                                            <i className="fa-regular fa-user"></i>
                                        </div>
                                        <span className="ms-2 d-none d-lg-inline">{user.name?.split(' ')[0]}</span>
                                    </a>
                                    <ul className="dropdown-menu dropdown-menu-end border-0 shadow-sm">
                                        <li><Link className="dropdown-item" to="/profile">My Profile</Link></li>
                                        <li><hr className="dropdown-divider" /></li>
                                        <li><button className="dropdown-item text-danger" onClick={logout}>Logout</button></li>
                                    </ul>
                                </div>
                            ) : (
                                <Link to="/login" className="btn btn-outline-danger ms-3 rounded-pill px-4 btn-sm">Login</Link>
                            )}
                        </div>
                    </div>
                </div>
            </nav>
        </>
    );
};

export default Navbar;
