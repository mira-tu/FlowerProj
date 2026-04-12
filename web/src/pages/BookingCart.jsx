import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Shop.css';
import InfoModal from '../components/InfoModal';
import { buildTentativePricingSummary, getTentativeBreakdownFromItem } from '../utils/customOrderTentativePricing';
import { fetchCustomOrderCatalog } from '../utils/customOrderCatalog';

const BookingCart = ({ user }) => {
    const navigate = useNavigate();
    const [inquiryItems, setInquiryItems] = useState([]);
    const [catalogArrangements, setCatalogArrangements] = useState([]);
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '' });
    const bookingCheckoutKey = `bookingCheckoutItems_${user?.id || 'guest'}`;
    const bookingSelectionKey = `bookSelection_${user?.id || 'guest'}`;

    const normalizeInquiryItem = (item = {}) => ({
        ...item,
        serviceType: String(item?.serviceType || 'Custom Order').replace(/\s*v\d+$/i, '').trim() || 'Custom Order',
    });

    useEffect(() => {
        const cartKey = `bookingCart_${user?.id || 'guest'}`;
        const savedInquiry = localStorage.getItem(cartKey) || localStorage.getItem('bookingCart');
        if (savedInquiry) {
            const savedSelection = (() => {
                try {
                    const parsed = JSON.parse(localStorage.getItem(bookingSelectionKey) || '{}');
                    return parsed && typeof parsed === 'object' ? parsed : {};
                } catch (error) {
                    return {};
                }
            })();

            const parsedItems = JSON.parse(savedInquiry).map((item, index) => {
                const normalizedItem = normalizeInquiryItem(item);
                const listId = normalizedItem?.listId || `book-${index}`;
                const selected = Object.prototype.hasOwnProperty.call(savedSelection, listId)
                    ? Boolean(savedSelection[listId])
                    : true;

                return {
                    ...normalizedItem,
                    listId,
                    selected,
                };
            });
            setInquiryItems(parsedItems);
        } else {
            navigate('/');
        }
    }, [bookingSelectionKey, navigate, user]);

    useEffect(() => {
        let isMounted = true;

        const loadCatalog = async () => {
            const catalog = await fetchCustomOrderCatalog();
            if (isMounted) {
                setCatalogArrangements(Array.isArray(catalog?.arrangements) ? catalog.arrangements : []);
            }
        };

        loadCatalog();
        return () => {
            isMounted = false;
        };
    }, []);

    const getOriginPage = () => '/custom-order';

    const handleRemoveItem = (id) => {
        const updatedItems = inquiryItems.filter(item => item.id !== id);
        const cartKey = `bookingCart_${user?.id || 'guest'}`;

        if (updatedItems.length === 0) {
            localStorage.removeItem(cartKey);
            localStorage.removeItem(bookingSelectionKey);
            navigate(getOriginPage());
        } else {
            setInquiryItems(updatedItems);
            localStorage.setItem(cartKey, JSON.stringify(updatedItems));
            const selectionMap = {};
            updatedItems.forEach((item) => {
                selectionMap[item.listId] = Boolean(item.selected);
            });
            localStorage.setItem(bookingSelectionKey, JSON.stringify(selectionMap));
        }
    };

    const handleEdit = () => {
        navigate(getOriginPage());
    };

    const handleToggleSelection = (listId) => {
        setInquiryItems((prevItems) => {
            const nextItems = prevItems.map((item) => (
                item.listId === listId
                    ? { ...item, selected: !item.selected }
                    : item
            ));
            const selectionMap = {};
            nextItems.forEach((item) => {
                selectionMap[item.listId] = Boolean(item.selected);
            });
            localStorage.setItem(bookingSelectionKey, JSON.stringify(selectionMap));
            return nextItems;
        });
    };

    const handleProceedToCheckout = () => {
        const selectedInquiryItems = inquiryItems.filter((item) => item.selected);
        if (!selectedInquiryItems.length) {
            setInfoModal({
                show: true,
                title: 'Select a Custom Order',
                message: 'Please select at least one custom-order draft before proceeding to checkout.',
            });
            return;
        }

        localStorage.setItem(bookingCheckoutKey, JSON.stringify(selectedInquiryItems));
        navigate('/booking-checkout');
    };

    const selectedInquiryItems = inquiryItems.filter((item) => item.selected);
    const itemTentativeBreakdowns = selectedInquiryItems.map((item) => getTentativeBreakdownFromItem(item, catalogArrangements));
    const tentativePricingSummary = buildTentativePricingSummary({
        tentativeBreakdowns: itemTentativeBreakdowns,
    });

    if (!inquiryItems || inquiryItems.length === 0) {
        return (
            <div className="container py-5 mt-5 text-center">
                <h5>Your Custom Order cart is empty.</h5>
                <button className="btn btn-pink mt-3" onClick={() => navigate(getOriginPage())}>Return to Booking</button>
            </div>
        );
    }

    return (
        <div className="container py-5 mt-5 bg-light" style={{ minHeight: '80vh', overflowX: 'hidden' }}>
            <h2 className="fw-bold mb-4"><i className="fas fa-file-invoice me-2"></i> Confirm Your Inquiry</h2>

            <div className="row g-4">
                <div className="col-lg-8">
                    {/* Inquiry Cart Header */}
                    <div className="card border-0 shadow-sm mb-3 d-none d-md-block">
                        <div className="card-body py-2" style={{ overflowX: 'auto' }}>
                            <div className="row align-items-center text-muted small fw-bold text-uppercase g-0">
                                <div className="col-5">Product</div>
                                <div className="col-2 text-center">Tentative</div>
                                <div className="col-2 text-center">Quantity</div>
                                <div className="col-2 text-center">Total Price</div>
                                <div className="col-1 text-center" style={{ whiteSpace: 'nowrap' }}>Action</div>
                            </div>
                        </div>
                    </div>

                    {inquiryItems.map((item, index) => {
                        const tentativeBreakdown = getTentativeBreakdownFromItem(item, catalogArrangements);

                        return (
                        <div key={item.id} className="card border-0 shadow-sm mb-3">
                            <div className="card-body">
                                <div className="row align-items-center g-0">
                                    <div className="col-md-5 d-flex align-items-center mb-3 mb-md-0">
                                        <div className="form-check me-3">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                checked={Boolean(item.selected)}
                                                onChange={() => handleToggleSelection(item.listId)}
                                                aria-label={`Select ${item.occasion || item.arrangementSummary || 'custom order'}`}
                                            />
                                        </div>
                                        <img
                                            src={item.inspirationImageBase64 || 'https://via.placeholder.com/80?text=No+Ref'}
                                            alt={item.serviceType}
                                            className="rounded"
                                            style={{ width: '80px', height: '80px', objectFit: 'cover' }}
                                        />
                                        <div className="ms-3">
                                            <h6 className="mb-0 fw-bold">{item.occasion} - {(item.arrangementSummary || item.arrangementType || (Array.isArray(item.arrangementTypes) ? item.arrangementTypes.join(', ') : 'Custom Arrangement'))}</h6>
                                            <small className="text-muted">
                                                {item.serviceType}
                                            </small>
                                        </div>
                                    </div>
                                    <div className="col-md-2 text-center mb-2 mb-md-0">
                                        <span className="d-md-none text-muted small me-2">Price:</span>
                                        <span className="fw-bold">
                                            {tentativeBreakdown?.hasCompleteEstimate
                                                ? (tentativeBreakdown.lineItems.length === 1
                                                    ? tentativeBreakdown.lineItems[0]?.formattedUnitRange || 'To be quoted'
                                                    : 'Varies')
                                                : 'To be quoted'}
                                        </span>
                                    </div>
                                    <div className="col-md-2 text-center mb-2 mb-md-0">
                                        <span className="d-md-none text-muted small me-2">Quantity:</span>
                                        {item.arrangementQuantity || 1}
                                    </div>
                                    <div className="col-md-2 text-center fw-bold mb-2 mb-md-0" style={{ color: '#d63384' }}>
                                        <span className="d-md-none text-muted small me-2">Total:</span>
                                        {tentativeBreakdown?.hasCompleteEstimate
                                            ? tentativeBreakdown.formattedSubtotalRange
                                            : 'To be quoted'}
                                    </div>
                                    <div className="col-md-1 text-center">
                                        <button
                                            className="btn btn-outline-danger btn-sm rounded-circle d-inline-flex align-items-center justify-content-center"
                                            style={{ width: '36px', height: '36px' }}
                                            onClick={() => handleRemoveItem(item.id)}
                                            title="Remove item"
                                        >
                                            <i className="fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )})}
                </div>

                <div className="col-lg-4">
                    <div className="card border-0 shadow-sm position-sticky" style={{ top: '100px' }}>
                        <div className="card-body">
                            <h5 className="fw-bold mb-3">Inquiry Summary</h5>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Selected Items</span>
                                <span>{selectedInquiryItems.length}</span>
                            </div>
                            <hr />
                            <div className="d-flex justify-content-between mb-4">
                                <span className="fw-bold fs-5">Tentative Total</span>
                                <span className="fw-bold fs-5" style={{ color: '#d63384' }}>
                                    {tentativePricingSummary.hasCompleteEstimate ? tentativePricingSummary.formattedSubtotalRange : 'To be quoted'}
                                </span>
                            </div>
                            <div className="small text-muted mb-3">
                                Final price may change after review and confirmation.
                            </div>
                            <button
                                className="btn btn-primary w-100 py-2 fw-bold rounded-pill shadow-sm"
                                style={{ background: 'var(--shop-pink)', border: 'none' }}
                                onClick={handleProceedToCheckout}
                            >
                                Proceed to Checkout
                            </button>
                            <button onClick={handleEdit} className="btn btn-outline-secondary w-100 py-2 mt-2 rounded-pill">
                                Add Another Inquiry
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <InfoModal
                show={infoModal.show}
                title={infoModal.title}
                message={infoModal.message}
                onClose={() => setInfoModal({ show: false, title: '', message: '' })}
            />
        </div>
    );
};

export default BookingCart;

