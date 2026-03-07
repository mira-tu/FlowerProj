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

        // Load notifications from localStorage scoped to user
        const loadNotifications = () => {
            if (!user) {
                setNotifications([]);
                setUnreadCount(0);
                return;
            }
            const savedNotifications = JSON.parse(localStorage.getItem(`notifications_${user.id}`) || '[]');
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
        if (!user) return;
        // Mark as read
        const updatedNotifications = notifications.map(n =>
            n.id === notification.id ? { ...n, read: true } : n
        );
        localStorage.setItem(`notifications_${user.id}`, JSON.stringify(updatedNotifications));
        setNotifications(updatedNotifications);
        setUnreadCount(updatedNotifications.filter(n => !n.read).length);

        // Navigate if there's a link
        if (notification.link) {
            navigate(notification.link);
            setShowNotifications(false);
        }
    };

    const markAllAsRead = () => {
        if (!user) return;
        const updatedNotifications = notifications.map(n => ({ ...n, read: true }));
        localStorage.setItem(`notifications_${user.id}`, JSON.stringify(updatedNotifications));
        setNotifications(updatedNotifications);
        setUnreadCount(0);
    };

    const clearAllNotifications = () => {
        if (!user) return;
        localStorage.setItem(`notifications_${user.id}`, JSON.stringify([]));
        setNotifications([]);
        setUnreadCount(0);
    };

    const [menuOpen, setMenuOpen] = useState(false);

    const toggleMenu = () => setMenuOpen(!menuOpen);
    const closeMenu = () => setMenuOpen(false);

    return (
        <>
            <nav className="navbar navbar-expand-lg fixed-top">
                <div className="container-fluid px-5">
                    <Link className="navbar-brand d-flex align-items-center" to="/">
                        <span>Jocerry's Flower Shop</span>
                    </Link>

                    {/* Custom hamburger button */}
                    <button
                        className={`mobile-menu-toggle d-lg-none ${menuOpen ? 'active' : ''}`}
                        type="button"
                        onClick={toggleMenu}
                        aria-label="Toggle navigation"
                    >
                        <span className="hamburger-line"></span>
                        <span className="hamburger-line"></span>
                        <span className="hamburger-line"></span>
                    </button>

                    {/* Desktop nav (unchanged - Bootstrap collapse) */}
                    <div className="collapse navbar-collapse d-none d-lg-flex" id="navbarNav">
                        <ul className="navbar-nav mx-auto">
                            <li className="nav-item"><Link className="nav-link active" to="/">Home</Link></li>
                            <li className="nav-item"><Link className="nav-link" to="/about">About</Link></li>
                            <li className="nav-item"><Link className="nav-link" to="/contact">Contact</Link></li>
                            <li className="nav-item dropdown">
                                <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                                    Services
                                </a>
                                <ul className="dropdown-menu services-menu border-0 shadow-sm">
                                    <li><Link className="dropdown-item" to="/book-event">Custom Order</Link></li>
                                    <li><Link className="dropdown-item" to="/customized">Customized Bouquets</Link></li>
                                </ul>
                            </li>
                        </ul>
                        <div className="nav-icons d-flex align-items-center">
                            <Link to="/wishlist" className="btn-icon">
                                <i className="fa-regular fa-heart"></i>
                            </Link>

                            <Link to="/profile" state={{ activeMenu: 'messages' }} className="btn-icon">
                                <i className="fa-regular fa-message"></i>
                                {unreadMessageCount > 0 && (
                                    <span className="badge-count">{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</span>
                                )}
                            </Link>

                            <div className="notification-wrapper position-relative">
                                {/* ... existing notification code ... */}
                            </div>
                            <Link to="/cart" className="btn-icon">
                                <i className="fa-solid fa-cart-shopping"></i>
                                {user && cartCount > 0 && <span className="badge-count">{cartCount}</span>}
                            </Link>

                            <Link to="/notifications" className="btn-icon">
                                <i className="fa-regular fa-bell"></i>
                                {user && unreadCount > 0 && (
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

            {/* Mobile Drawer Overlay */}
            {menuOpen && <div className="mobile-drawer-backdrop" onClick={closeMenu}></div>}

            {/* Mobile Slide-in Drawer */}
            <div className={`mobile-drawer d-lg-none ${menuOpen ? 'open' : ''}`}>
                <div className="mobile-drawer-header">
                    <span className="mobile-drawer-title">Menu</span>
                    <button className="mobile-drawer-close" onClick={closeMenu} aria-label="Close menu">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div className="mobile-drawer-body">
                    <ul className="mobile-nav-links">
                        <li><Link to="/" onClick={closeMenu}><i className="fa-solid fa-house"></i> Home</Link></li>
                        <li><Link to="/about" onClick={closeMenu}><i className="fa-solid fa-circle-info"></i> About</Link></li>
                        <li><Link to="/contact" onClick={closeMenu}><i className="fa-solid fa-envelope"></i> Contact</Link></li>
                        <li><Link to="/book-event" onClick={closeMenu}><i className="fa-solid fa-calendar-check"></i> Custom Order</Link></li>
                        <li><Link to="/customized" onClick={closeMenu}><i className="fa-solid fa-wand-magic-sparkles"></i> Customized Bouquets</Link></li>
                    </ul>

                    <div className="mobile-drawer-divider"></div>

                    <div className="mobile-icon-row">
                        <Link to="/wishlist" className="mobile-icon-btn" onClick={closeMenu}>
                            <i className="fa-regular fa-heart"></i>
                            <span>Wishlist</span>
                        </Link>
                        <Link to="/profile" state={{ activeMenu: 'messages' }} className="mobile-icon-btn" onClick={closeMenu}>
                            <i className="fa-regular fa-message"></i>
                            <span>Messages</span>
                            {unreadMessageCount > 0 && <span className="mobile-badge">{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</span>}
                        </Link>
                        <Link to="/cart" className="mobile-icon-btn" onClick={closeMenu}>
                            <i className="fa-solid fa-cart-shopping"></i>
                            <span>Cart</span>
                            {user && cartCount > 0 && <span className="mobile-badge">{cartCount}</span>}
                        </Link>
                        <Link to="/notifications" className="mobile-icon-btn" onClick={closeMenu}>
                            <i className="fa-regular fa-bell"></i>
                            <span>Alerts</span>
                            {user && unreadCount > 0 && <span className="mobile-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
                        </Link>
                    </div>

                    <div className="mobile-drawer-divider"></div>

                    {user ? (
                        <div className="mobile-user-section">
                            <Link to="/profile" className="mobile-profile-link" onClick={closeMenu}>
                                <i className="fa-regular fa-user"></i>
                                <span>{user.name || 'My Profile'}</span>
                            </Link>
                            <button className="mobile-logout-btn" onClick={() => { logout(); closeMenu(); }}>
                                <i className="fa-solid fa-right-from-bracket"></i>
                                <span>Logout</span>
                            </button>
                        </div>
                    ) : (
                        <div className="mobile-user-section">
                            <Link to="/login" className="mobile-login-btn" onClick={closeMenu}>
                                Login / Sign Up
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default Navbar;
