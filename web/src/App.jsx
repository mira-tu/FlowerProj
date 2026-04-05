import { useState, useEffect, useMemo, Component, useRef } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'

// ErrorBoundary: catches unhandled React errors so the SPA never goes blank.
// Instead of a white screen, users see a friendly retry button.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
          <h4 className="mb-3">Something went wrong</h4>
          <p className="text-muted mb-3">An unexpected error occurred. Please try again.</p>
          <button
            className="btn btn-danger"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = '/';
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Contact from './pages/Contact'
import About from './pages/About'
import Login from './pages/Login'
import Signup from './pages/Signup'
import EmailVerification from './pages/EmailVerification'
import ResetPassword from './pages/ResetPassword'
import Wishlist from './pages/Wishlist'
import Cart from './pages/Cart'
import BookingCheckout from './pages/BookingCheckout'
import Customized from './pages/Customized'
import CustomOrder from './pages/CustomOrder'
import CustomOrderCatalog from './pages/CustomOrderCatalog'
import ProductDetail from './pages/ProductDetail'
import Checkout from './pages/Checkout'
import OrderSuccess from './pages/OrderSuccess'
import Profile from './pages/Profile'
import MyOrders from './pages/MyOrders'
import Notifications from './pages/Notifications'
import OrderBookingTracking from './pages/OrderBookingTracking';
import OrderCustomizedTracking from './pages/OrderCustomizedTracking';
import OrderTracking from './pages/OrderTracking';
import CustomizedCheckout from './pages/CustomizedCheckout';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import InfoModal from './components/InfoModal';
import { fetchCustomOrderCatalog } from './utils/customOrderCatalog';
import { normalizeProductPricing } from './utils/productPricing';

import { supabase } from './config/supabase';
import { ensureVerifiedUserSession } from './utils/emailVerification';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

// Removed cartAPI import - using localStorage instead for demo

function AppContent() {
  const location = useLocation();
  const isAuthRoute = ['/login', '/signup', '/reset-password', '/email-verification'].includes(location.pathname);
  const isCustomOrderCatalogRoute = location.pathname === '/custom-order';
  const showNavbar = !isAuthRoute;
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [preloadedCustomOrderCatalog, setPreloadedCustomOrderCatalog] = useState(null);

  // Use a ref to track the current auth state for synchronous access in cart functions
  const userRef = useRef(null);

  const getCartKey = (userId) => `cart_${userId || 'guest'}`;

  const syncAuthenticatedUserState = (currentUser) => {
    setUser(currentUser);
    userRef.current = currentUser;

    try {
      const cartKey = getCartKey(currentUser?.id);
      const saved = localStorage.getItem(cartKey);

      if (saved) {
        setCart(JSON.parse(saved));
      } else {
        setCart([]);
      }
    } catch (e) { }
  };

  const [cart, setCart] = useState(() => {
    try {
      // Initially load from guest or standard cart if no user info is available synchronously yet
      const saved = localStorage.getItem('cart_guest') || localStorage.getItem('cart');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasSpinnerDelayPassed, setHasSpinnerDelayPassed] = useState(false);
  const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '' });
  const isLoggedIn = !!user;

  const applyProductCatalog = (productsData = []) => {
    const productsWithCategories = (productsData || []).map(product => normalizeProductPricing({
      ...product,
      category_name: product.categories?.name || product.category_name || 'Uncategorized'
    }));
    const sortedProducts = productsWithCategories.sort((a, b) => b.id - a.id);

    setProducts(sortedProducts);

    try {
      localStorage.setItem('products', JSON.stringify(sortedProducts));
    } catch (storageError) {
      console.error('Error caching products for detail pages:', storageError);
    }

    setCart(prevCart => {
      const activeCart = prevCart.filter(cartItem =>
        sortedProducts.some(p =>
          String(p.id) === String(cartItem.productId || cartItem.id) ||
          p.name === cartItem.name
        )
      );

      return activeCart;
    });
  };

  useEffect(() => {
    // Ensure the loading spinner is visible for a short, minimum duration
    // so automated tests and users can reliably see it on first load.
    const timer = setTimeout(() => {
      setHasSpinnerDelayPassed(true);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catalogData, { data: categoriesData, error: categoriesError }, { data: productsData, error: productsError }] = await Promise.all([
          isCustomOrderCatalogRoute ? fetchCustomOrderCatalog() : Promise.resolve(null),
          supabase.from('categories').select('id, name').eq('is_active', true).order('name', { ascending: true }),
          supabase
            .from('products')
            .select('*, categories ( name )')
            .eq('is_active', true)
            .limit(200)
        ]);

        if (catalogData) {
          setPreloadedCustomOrderCatalog(catalogData);
        }

        if (categoriesError) {
          console.error('Error fetching categories:', categoriesError);
        } else {
          setCategories(categoriesData || []);
        }

        if (productsError) {
          console.error('Error fetching products:', productsError);
        } else {
          applyProductCatalog(productsData);
        }
      } catch (err) {
        // Catch any unexpected thrown errors (network timeouts, etc.)
        // so the app always finishes initializing instead of showing
        // the loading spinner forever.
        console.error('Error during app initialization:', err);
      } finally {
        setIsInitializing(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    const refreshProducts = async () => {
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*, categories ( name )')
        .eq('is_active', true)
        .limit(200);

      if (productsError) {
        console.error('Error refreshing products:', productsError);
        return;
      }

      applyProductCatalog(productsData);
    };

    const channel = supabase
      .channel('public:catalog-products')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          refreshProducts();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const handleSessionUser = async (sessionUser) => {
      const authCallbackRoute = ['/email-verification', '/reset-password'].includes(window.location.pathname);

      if (authCallbackRoute) {
        if (isMounted) {
          syncAuthenticatedUserState(null);
        }
        return;
      }

      if (!sessionUser) {
        if (isMounted) {
          syncAuthenticatedUserState(null);
        }
        return;
      }

      const verificationState = await ensureVerifiedUserSession(sessionUser);

      if (verificationState.error) {
        console.warn('Non-blocking: verification status check failed:', verificationState.error);
      }

      if (verificationState.shouldSignOut) {
        await supabase.auth.signOut();

        if (isMounted) {
          syncAuthenticatedUserState(null);
        }

        if (!['/login', '/signup', '/email-verification', '/reset-password'].includes(window.location.pathname)) {
          const emailQuery = sessionUser.email ? `&email=${encodeURIComponent(sessionUser.email)}` : '';
          window.location.href = `/login?verification=required${emailQuery}`;
        }

        return;
      }

      if (isMounted) {
        syncAuthenticatedUserState(sessionUser);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSessionUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSessionUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = () => {
    // Old localStorage items for user will be cleared by logout or implicitly by new flow
    // User state will be updated by the onAuthStateChange listener
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error.message);
    }
    // Clear all order/request data to prevent data leakage between accounts
    // Clear generic keys just in case, but keep user-specific ones isolated
    localStorage.removeItem('orders');
    localStorage.removeItem('requests');
    localStorage.removeItem('messages');
    localStorage.removeItem('bookingCart'); // Clean up any lingering generic carts
    localStorage.removeItem('customizedCart');

    // Switch to guest cart immediately before reload to prevent flicker
    setCart([]);
    userRef.current = null;

    window.location.href = '/login'; // Force full page reload to clear any cached state
  };

  // Save cart to user-specific localStorage whenever it changes
  useEffect(() => {
    const cartKey = getCartKey(userRef.current?.id);
    localStorage.setItem(cartKey, JSON.stringify(cart));
  }, [cart, user]); // Added user dependency to ensure key updates if user changes without cart changing

  const addToCart = (name, price, image, productId, stockQuantity) => {
    // Always use localStorage for cart operations
    setCart(prevCart => {
      const existingItem = prevCart.find(item => (productId && item.productId === productId) || item.name === name);
      if (existingItem) {
        return prevCart.map(item => {
          if ((productId && item.productId === productId) || item.name === name) {
            const newQty = (item.qty || 0) + 1;
            // Cap quantity at stock limit
            const finalQty = stockQuantity ? Math.min(newQty, stockQuantity) : newQty;
            if (stockQuantity && newQty > stockQuantity) {
              setInfoModal({
                show: true,
                title: 'Stock Limit Reached',
                message: `Only ${stockQuantity} items in stock for ${name}`
              });
            }
            return { ...item, qty: finalQty, stockQuantity: stockQuantity || item.stockQuantity };
          }
          return item;
        });
      } else {
        return [...prevCart, { name, price, image, qty: 1, productId, id: productId || `local-${Date.now()}`, stockQuantity }];
      }
    });
  };

  const updateCartItem = (itemId, quantity) => {
    // Always use localStorage for cart operations
    setCart(prevCart => prevCart.map(item => {
      if (item.id === itemId || item.productId === itemId) {
        const finalQty = item.stockQuantity ? Math.min(quantity, item.stockQuantity) : quantity;
        return { ...item, qty: finalQty };
      }
      return item;
    }));
  };

  const removeFromCart = (itemId) => {
    // Always use localStorage for cart operations
    setCart(prevCart => prevCart.filter(item => item.id !== itemId && item.productId !== itemId));
  };

  const [customServiceCount, setCustomServiceCount] = useState(0);

  useEffect(() => {
    const updateCounts = () => {
      try {
        const currentUserId = userRef.current?.id;
        if (!currentUserId) {
          setCustomServiceCount(0);
          return;
        }

        const c1 = JSON.parse(localStorage.getItem(`customizedCart_${currentUserId}`) || '[]').length;
        const c2 = JSON.parse(localStorage.getItem(`bookingCart_${currentUserId}`) || '[]').length;
        setCustomServiceCount(c1 + c2);
      } catch (e) {
        // ignore
      }
    };
    updateCounts();
    const interval = setInterval(updateCounts, 1000);
    window.addEventListener('storage', updateCounts);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', updateCounts);
    };
  }, [user]); // Re-run when user changes

  const cartCount = user ? (cart.reduce((acc, item) => acc + (item.qty || 0), 0) + customServiceCount) : 0;

  if (!hasSpinnerDelayPassed || isInitializing) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="spinner-border text-danger" role="status" aria-hidden="true"></div>
        <p className="mt-3 mb-0 fw-semibold">Loading...</p>
      </div>
    );
  }

  return (
    <>
      <InfoModal
        show={infoModal.show}
        onClose={() => setInfoModal({ show: false, title: '', message: '' })}
        title={infoModal.title}
        message={infoModal.message}
      />

      {showNavbar && (
        <Navbar cartCount={cartCount} user={user} logout={logout} />
      )}

      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Home addToCart={addToCart} products={products} categories={categories} user={user} />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/wishlist" element={<Wishlist cart={cart} addToCart={addToCart} products={products} />} />
        <Route path="/cart" element={<Cart cart={cart} updateCartItem={updateCartItem} removeFromCart={removeFromCart} user={user} />} />
        <Route path="/customized-checkout" element={<CustomizedCheckout user={user} />} />
        <Route path="/booking-checkout" element={<BookingCheckout user={user} />} />
        <Route path="/login" element={<Login onLogin={login} />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/email-verification" element={<EmailVerification />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/custom-order" element={<CustomOrderCatalog initialCatalog={preloadedCustomOrderCatalog} />} />
        <Route path="/custom-order/form" element={<CustomOrder user={user} />} />
        <Route path="/custom-order/request" element={<Navigate to="/custom-order" replace />} />
        <Route path="/custom-order-v2" element={<Navigate to="/custom-order" replace />} />
        <Route path="/customized" element={<Customized addToCart={addToCart} />} />
        <Route path="/product/:productId" element={<ProductDetail addToCart={addToCart} user={user} />} />
        <Route path="/checkout" element={<Checkout setCart={setCart} user={user} />} />
        <Route path="/order-success/:orderNumber" element={<OrderSuccess />} />
        <Route path="/request-tracking/:requestNumber" element={<OrderBookingTracking />} />
        <Route path="/customized-request-tracking/:requestNumber" element={<OrderCustomizedTracking user={user} />} />
        <Route path="/order-tracking/:orderNumber" element={<OrderTracking user={user} />} />
        <Route path="/profile" element={<Profile user={user} logout={logout} />} />
        <Route path="/my-orders" element={<MyOrders />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/events" element={<div className="container py-5"><h2>Events Page</h2></div>} />
      </Routes>

      {showNavbar && <Footer />}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <ScrollToTop />
        <AppContent />
      </Router>
    </ErrorBoundary>
  )
}

export default App
