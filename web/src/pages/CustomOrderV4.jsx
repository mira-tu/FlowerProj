import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import {
  DEFAULT_CUSTOM_ORDER_V4_CATALOG,
  fetchCustomOrderV4Catalog,
  getActiveCustomOrderCatalogDesigns,
  formatCustomOrderV4Currency,
} from '../utils/customOrderV4';
import '../styles/CustomOrderShared.css';
import '../styles/Shop.css';
import '../styles/CustomOrderCatalog.css';
import '../styles/CustomOrderV4.css';

const CustomOrderV4 = () => {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState(DEFAULT_CUSTOM_ORDER_V4_CATALOG);
  const [loading, setLoading] = useState(true);
  const [selectedDesignId, setSelectedDesignId] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadCatalog = async () => {
      setLoading(true);
      const nextCatalog = await fetchCustomOrderV4Catalog(supabase);
      if (!isMounted) return;
      setCatalog(nextCatalog);
      setLoading(false);
    };

    loadCatalog();

    return () => {
      isMounted = false;
    };
  }, []);

  const designs = useMemo(() => getActiveCustomOrderCatalogDesigns(catalog), [catalog]);
  const selectedDesign = useMemo(
    () => designs.find((design) => design.id === selectedDesignId) || null,
    [designs, selectedDesignId]
  );

  const handleOrderNow = (design) => {
    if (!design?.id) return;
    navigate(`/custom-order/request?offering=${encodeURIComponent(design.id)}`);
  };

  return (
    <div className="booking-section custom-order-catalog-page custom-order-v4-page">
      <div className="container">
        <div className="custom-order-catalog-hero">
          <div className="custom-order-catalog-badge">Services / Custom Order</div>
          <h1 className="display-4 fw-bold font-playfair mb-3">Custom Orders</h1>
          <p className="lead text-muted mx-auto custom-order-catalog-subtitle">
            Browse arrangement concepts first, view their details, then continue into a visual budget-aware custom order form.
          </p>
        </div>

        <div className="custom-order-catalog-toolbar">
          <div>
            <h5 className="fw-bold mb-1">Available arrangement offerings</h5>
            <p className="text-muted mb-0">Choose a concept, inspect the details, and continue to order when you are ready.</p>
          </div>
          <Link to="/custom-order/request" className="custom-order-catalog-link">Open form directly</Link>
        </div>

        {loading && designs.length === 0 ? (
          <div className="text-center py-5">
            <div className="spinner-border text-danger" role="status" aria-hidden="true"></div>
            <p className="mt-3 mb-0 fw-semibold">Loading Custom Order...</p>
          </div>
        ) : (
          <div className="custom-order-catalog-grid">
            {designs.map((design) => {
              const defaultTier = design.packageTiers.find((item) => item.isDefault) || design.packageTiers[0];
              const previewImage = design.visualVariants.find((item) => item.isOriginal)?.imageUrl || design.referenceImages[0]?.url;

              return (
                <article key={design.id} className="custom-order-catalog-card custom-order-v4-card">
                  <div className="custom-order-catalog-card__image-wrap">
                    <img src={previewImage} alt={design.title} className="custom-order-catalog-card__image" />
                  </div>
                  <div className="custom-order-catalog-card__body">
                    <div className="custom-order-catalog-pill">{design.category}</div>
                    <h5 className="fw-bold mt-3 mb-2">{design.title}</h5>
                    <p className="text-muted small mb-3">{design.description}</p>
                    <div className="custom-order-v4-card__meta">
                      <span>{design.priceRangeLabel || `Starts around ${formatCustomOrderV4Currency(defaultTier?.price || 0)}`}</span>
                    </div>
                  </div>
                  <div className="custom-order-catalog-card__actions">
                    <button type="button" className="btn btn-outline-secondary rounded-pill px-4" onClick={() => setSelectedDesignId(design.id)}>
                      View
                    </button>
                    <button type="button" className="btn btn-pink text-white rounded-pill px-4" onClick={() => handleOrderNow(design)}>
                      Order Now
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="custom-order-catalog-footer-note">
          <strong>How it works:</strong> browse offerings, inspect the details, continue to order, then compare the original concept against visual budget-fit alternatives inside the form.
        </div>
      </div>

      {selectedDesign ? (
        <div className="custom-order-catalog-overlay" onClick={() => setSelectedDesignId('')}>
          <div className="custom-order-catalog-modal custom-order-v4-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="custom-order-catalog-modal__close" onClick={() => setSelectedDesignId('')} aria-label="Close details">
              x
            </button>
            <div className="custom-order-catalog-modal__content">
              <div className="custom-order-catalog-modal__image-wrap">
                <img
                  src={selectedDesign.visualVariants.find((item) => item.isOriginal)?.imageUrl || selectedDesign.referenceImages[0]?.url}
                  alt={selectedDesign.title}
                  className="custom-order-catalog-modal__image"
                />
              </div>
              <div className="custom-order-catalog-modal__body">
                <div className="custom-order-catalog-pill">{selectedDesign.category}</div>
                <h3 className="fw-bold mt-3 mb-2">{selectedDesign.title}</h3>
                <p className="text-muted mb-3">{selectedDesign.description}</p>
                <div className="custom-order-v4-modal__price">{selectedDesign.priceRangeLabel}</div>
                <div className="custom-order-catalog-detail-box">
                  <div><span>Arrangement type</span><strong>{selectedDesign.category}</strong></div>
                  <div><span>Package options</span><strong>{selectedDesign.packageTiers.length}</strong></div>
                </div>
                {selectedDesign.notes ? (
                  <div className="custom-order-catalog-notes">
                    <div className="fw-semibold mb-2">Notes / inclusions</div>
                    <p className="mb-0">{selectedDesign.notes}</p>
                  </div>
                ) : null}
                {selectedDesign.visualVariants.length > 1 ? (
                  <div className="custom-order-v4-modal__variants">
                    <div className="fw-semibold mb-2">Visual downgrade guide</div>
                    <div className="custom-order-v4-modal__variant-list">
                      {selectedDesign.visualVariants.map((variant) => (
                        <div key={variant.id} className="custom-order-v4-modal__variant-item">
                          <img src={variant.imageUrl} alt={variant.alt || variant.label} />
                          <div>
                            <strong>{variant.label}</strong>
                            <span>{variant.caption || 'Preview image for this arrangement version.'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="custom-order-catalog-modal__actions">
                  <button type="button" className="btn btn-outline-secondary rounded-pill px-4" onClick={() => setSelectedDesignId('')}>
                    Keep Browsing
                  </button>
                  <button type="button" className="btn btn-pink text-white rounded-pill px-4" onClick={() => handleOrderNow(selectedDesign)}>
                    Order This Arrangement
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CustomOrderV4;

