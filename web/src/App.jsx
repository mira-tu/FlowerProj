import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Contact from './pages/Contact'
import About from './pages/About'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ResetPassword from './pages/ResetPassword'
import Wishlist from './pages/Wishlist'
import Cart from './pages/Cart'
import BookingCart from './pages/BookingCart'
import BookingCheckout from './pages/BookingCheckout'
import Customized from './pages/Customized'
import BookEvent from './pages/BookEvent'
import SpecialOrder from './pages/SpecialOrder'
import ProductDetail from './pages/ProductDetail'
import Checkout from './pages/Checkout'
import OrderSuccess from './pages/OrderSuccess'
import OrderTracking from './pages/OrderTracking'
import Profile from './pages/Profile'
import MyOrders from './pages/MyOrders'
import Notifications from './pages/Notifications'
import OrderBookingTracking from './pages/OrderBookingTracking';
import OrderCustomizedTracking from './pages/OrderCustomizedTracking';
import CustomizedCart from './pages/CustomizedCart';
import CustomizedCheckout from './pages/CustomizedCheckout';

import { supabase } from './config/supabase';

// Removed cartAPI import - using localStorage instead for demo

function AppContent() {
  const location = useLocation();
  const isAuthRoute = ['/login', '/signup', '/reset-password'].includes(location.pathname);
  const showNavbar = !isAuthRoute;
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const isLoggedIn = !!user;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [{ data: categoriesData, error: categoriesError }, { data: productsData, error: productsError }] = await Promise.all([
          supabase.from('categories').select('id, name').eq('is_active', true).order('name', { ascending: true }),
          supabase
            .from('products')
            .select('*, categories ( name )')
            .eq('is_active', true)
        ]);

        if (categoriesError) {
          console.error('Error fetching categories:', categoriesError);
        } else {
          setCategories(categoriesData || []);
        }

        if (productsError) {
          console.error('Error fetching products:', productsError);
        } else {
          const productsWithCategories = (productsData || []).map(product => ({
            ...product,
            category_name: product.categories?.name || 'Uncategorized'
          }));
          const sortedProducts = productsWithCategories.sort((a, b) => b.id - a.id);
          setProducts(sortedProducts);
        }
      } finally {
        setIsInitializing(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Global listener for real-time notifications
  useEffect(() => {
    if (user) {
      const channel = supabase.channel(`public:notifications:user_id=eq.${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        }, (payload) => {
          
          const newNotification = {
            id: payload.new.id,
            title: payload.new.title,
            message: payload.new.message,
            link: payload.new.link,
            read: payload.new.is_read,
            timestamp: payload.new.created_at,
            type: payload.new.type || 'default',
            icon: payload.new.icon || null,
          };

          const existingNotifications = JSON.parse(localStorage.getItem('notifications') || '[]');
          const updatedNotifications = [newNotification, ...existingNotifications];
          const uniqueNotifications = Array.from(new Map(updatedNotifications.map(item => [item.id, item])).values());
          localStorage.setItem('notifications', JSON.stringify(uniqueNotifications));
          
          // Dispatch storage event to trigger updates on the Notifications page
          window.dispatchEvent(new Event('storage'));
        })
        .subscribe();

      // Cleanup subscription on user change or logout
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const login = () => {
    // Old localStorage items for user will be cleared by logout or implicitly by new flow
    // User state will be updated by the onAuthStateChange listener
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error.message);
    }
    localStorage.removeItem('cart');
    // Clear all order/request data to prevent data leakage between accounts
    localStorage.removeItem('orders');
    localStorage.removeItem('requests');
    localStorage.removeItem('messages');
    localStorage.removeItem('notifications');
    setCart([]); // Clear cart state
    window.location.href = '/login'; // Force full page reload to clear any cached state
  };

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (error) {
        console.error('Error parsing cart from localStorage:', error);
        setCart([]);
      }
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (name, price, image, productId) => {
    // Always use localStorage for cart operations
    setCart(prevCart => {
      const existingItem = prevCart.find(item => (productId && item.productId === productId) || item.name === name);
      if (existingItem) {
        return prevCart.map(item =>
          ((productId && item.productId === productId) || item.name === name)
            ? { ...item, qty: (item.qty || 0) + 1 }
            : item
        );
      } else {
        return [...prevCart, { name, price, image, qty: 1, productId, id: productId || `local-${Date.now()}` }];
      }
    });
  };

  const updateCartItem = (itemId, quantity) => {
    // Always use localStorage for cart operations
    setCart(prevCart => prevCart.map(item =>
      (item.id === itemId || item.productId === itemId) ? { ...item, qty: quantity } : item
    ));
  };

  const removeFromCart = (itemId) => {
    // Always use localStorage for cart operations
    setCart(prevCart => prevCart.filter(item => item.id !== itemId && item.productId !== itemId));
  };

  const cartCount = cart.reduce((acc, item) => acc + (item.qty || 0), 0);

  if (isInitializing) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="spinner-border text-danger" role="status" aria-hidden="true"></div>
        <p className="mt-3 mb-0 fw-semibold">Loading...</p>
      </div>
    );
  }

  return (
    <>
      {showNavbar && (
        <Navbar cartCount={cartCount} user={user} logout={logout} />
      )}

      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Home addToCart={addToCart} products={products} categories={categories} />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/wishlist" element={<Wishlist cart={cart} addToCart={addToCart} />} />
        <Route path="/cart" element={<Cart cart={cart} updateCartItem={updateCartItem} removeFromCart={removeFromCart} />} />
        <Route path="/customized-cart" element={<CustomizedCart user={user} />} />
        <Route path="/customized-checkout" element={<CustomizedCheckout user={user} />} />
        <Route path="/booking-cart" element={<BookingCart user={user} />} />
        <Route path="/booking-checkout" element={<BookingCheckout user={user} />} />
        <Route path="/login" element={<Login onLogin={login} />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/book-event" element={<BookEvent user={user} />} />
        <Route path="/customized" element={<Customized addToCart={addToCart} />} />
        <Route path="/special-order" element={<SpecialOrder user={user} />} />
        <Route path="/product/:productId" element={<ProductDetail addToCart={addToCart} />} />
        <Route path="/checkout" element={<Checkout setCart={setCart} user={user} />} />
        <Route path="/order-success/:orderNumber" element={<OrderSuccess />} />
        <Route path="/order-tracking/:orderNumber" element={<OrderTracking />} />
        <Route path="/request-tracking/:requestNumber" element={<OrderBookingTracking />} />
        <Route path="/customized-request-tracking/:requestNumber" element={<OrderCustomizedTracking />} />
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
    <Router>
      <AppContent />
    </Router>
  )
}

export default App
