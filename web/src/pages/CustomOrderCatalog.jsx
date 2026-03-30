import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import {
  buildGroupedArrangementOptions,
  EMPTY_CUSTOM_ORDER_CATALOG,
  fetchCustomOrderCatalog,
  formatCustomOrderArrangementPriceRange,
} from '../utils/customOrderCatalog';
import '../styles/CustomOrderCatalog.css';

const GROUP_COPY = {
  Funeral: {
    eyebrow: 'Sympathy arrangements',
    description: 'Respectful floral pieces designed for memorial spaces, condolence tributes, and family offerings.',
    detail: 'Best when you want a structured tribute format that still leaves room for flower and color notes.',
  },
  'Bridal / Wedding': {
    eyebrow: 'Wedding florals',
    description: 'Elegant bridal and entourage arrangements that can be tuned to your palette, motif, and ceremony feel.',
    detail: 'Great for bookings that need a polished starting point before you fine-tune flowers, quantity, and references.',
  },
  General: {
    eyebrow: 'Celebration pieces',
    description: 'Versatile arrangements for gifting, receptions, table styling, and meaningful everyday moments.',
    detail: 'A good fit if you want a guided custom order without starting from a blank concept.',
  },
  Custom: {
    eyebrow: 'Fully custom concepts',
    description: 'For sketches, peg photos, unusual formats, or ideas that do not match the preset arrangement types.',
    detail: 'Choose this when you want the florist team to shape the arrangement around your own concept.',
  },
};

const FALLBACK_GROUP_COPY = {
  eyebrow: 'Custom arrangement',
  description: 'Choose a direction, preview the look, and continue to the request form with that arrangement already selected.',
  detail: 'You can still adjust quantity, flowers, colors, and special instructions after you continue.',
};

const getArrangementGuideLabel = (arrangement) => (
  arrangement?.flowersPerArrangement > 0
    ? `${arrangement.flowersPerArrangement} flowers guide`
    : 'Made around your brief'
);

const buildFormPath = (arrangementValue = '') => (
  arrangementValue
    ? `/custom-order/form?arrangement=${encodeURIComponent(arrangementValue)}`
    : '/custom-order/form'
);

const getArrangementPriceLabel = (arrangement) => (
  formatCustomOrderArrangementPriceRange(arrangement) || 'Price on request'
);

const CustomOrderCatalog = ({ initialCatalog = null }) => {
  const navigate = useNavigate();
  const previewRef = useRef(null);
  const [catalog, setCatalog] = useState(initialCatalog || EMPTY_CUSTOM_ORDER_CATALOG);
  const [isLoading, setIsLoading] = useState(!initialCatalog);
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedArrangementValue, setSelectedArrangementValue] = useState('');

  useEffect(() => {
    if (initialCatalog) {
      setCatalog(initialCatalog);
      setIsLoading(false);
    }

    let isMounted = true;

    const loadCatalog = async () => {
      const loadedCatalog = await fetchCustomOrderCatalog();
      if (!isMounted) return;
      setCatalog(loadedCatalog);
      setIsLoading(false);
    };

    if (!initialCatalog) {
      loadCatalog();
    }

    const channel = supabase
      .channel('custom-order-catalog-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_content',
          filter: 'key=eq.custom_order_catalog',
        },
        () => {
          loadCatalog();
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [initialCatalog]);

  const activeArrangements = useMemo(
    () => catalog.arrangements.filter((item) => item.isActive !== false),
    [catalog],
  );

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(activeArrangements.map((item) => item.groupLabel || 'General')))],
    [activeArrangements],
  );

  const filteredArrangements = useMemo(() => (
    activeCategory === 'All'
      ? activeArrangements
      : activeArrangements.filter((item) => item.groupLabel === activeCategory)
  ), [activeArrangements, activeCategory]);

  const groupedArrangements = useMemo(
    () => buildGroupedArrangementOptions(filteredArrangements),
    [filteredArrangements],
  );

  useEffect(() => {
    if (!activeArrangements.length) {
      setSelectedArrangementValue('');
      return;
    }

    if (!selectedArrangementValue || !activeArrangements.some((item) => item.value === selectedArrangementValue)) {
      setSelectedArrangementValue(activeArrangements[0].value);
    }
  }, [activeArrangements, selectedArrangementValue]);

  useEffect(() => {
    if (activeCategory === 'All') return;
    if (filteredArrangements.some((item) => item.value === selectedArrangementValue)) return;
    if (filteredArrangements[0]) {
      setSelectedArrangementValue(filteredArrangements[0].value);
    }
  }, [activeCategory, filteredArrangements, selectedArrangementValue]);

  const selectedArrangement = useMemo(
    () => activeArrangements.find((item) => item.value === selectedArrangementValue)
      || filteredArrangements[0]
      || activeArrangements[0]
      || null,
    [activeArrangements, filteredArrangements, selectedArrangementValue],
  );

  const selectedGroupCopy = GROUP_COPY[selectedArrangement?.groupLabel] || FALLBACK_GROUP_COPY;

  const handlePreviewSelect = (arrangementValue) => {
    setSelectedArrangementValue(arrangementValue);

    if (typeof window !== 'undefined' && window.innerWidth <= 1199) {
      window.setTimeout(() => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 10);
    }
  };

  const handleOrderNow = (arrangement) => {
    navigate(buildFormPath(arrangement?.value), {
      state: {
        fromCatalog: true,
        preselectedArrangement: arrangement?.value || '',
        arrangementLabel: arrangement?.label || '',
      },
    });
  };

  if (isLoading) {
    return (
      <div className="custom-order-catalog-page">
        <div className="container custom-order-catalog-loading">
          <div className="spinner-border text-danger" role="status" aria-hidden="true"></div>
          <p className="mb-0 fw-semibold">Loading arrangement catalogue...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="custom-order-catalog-page">
      <div className="container">
        <section className="custom-order-showcase">
          <aside className="custom-order-showcase__preview" ref={previewRef}>
            {selectedArrangement ? (
              <div className="custom-order-spotlight">
                <div className="custom-order-spotlight__visual">
                  <img src={selectedArrangement.img} alt={selectedArrangement.label} className="custom-order-spotlight__image" />
                </div>
                <div className="custom-order-spotlight__body">
                  <div className="custom-order-spotlight__top">
                    <div className="custom-order-spotlight__overlay">
                      <span>{selectedArrangement.groupLabel}</span>
                      <span>{getArrangementGuideLabel(selectedArrangement)}</span>
                    </div>
                  </div>

                  <div className="custom-order-spotlight__content">
                    <div className="custom-order-spotlight__eyebrow">{selectedGroupCopy.eyebrow}</div>
                    <h2
                      className={`custom-order-spotlight__title ${selectedArrangement.label.length > 26 ? 'custom-order-spotlight__title--compact' : ''}`}
                    >
                      {selectedArrangement.label}
                    </h2>
                    <div className="custom-order-spotlight__price">{getArrangementPriceLabel(selectedArrangement)}</div>
                    <p className="custom-order-spotlight__lead">{selectedArrangement.description}</p>

                    <p className="custom-order-spotlight__note">{selectedGroupCopy.detail}</p>

                    <div className="custom-order-spotlight__actions">
                      <button
                        type="button"
                        className="custom-order-catalog-button custom-order-catalog-button--primary"
                        onClick={() => handleOrderNow(selectedArrangement)}
                      >
                        Order Now
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="custom-order-catalog-empty">
                <h2>No arrangement types available right now</h2>
                <p>Try opening the form directly and describing the arrangement you want.</p>
                <Link className="custom-order-catalog-button custom-order-catalog-button--primary" to={buildFormPath()}>
                  Open Request Form
                </Link>
              </div>
            )}
          </aside>

          <div className="custom-order-showcase__collection">
            <div className="custom-order-filterbar">
              <div>
                <div className="custom-order-filterbar__eyebrow">Arrangement Families</div>
                <h2>Preview by type</h2>
                <p>{selectedGroupCopy.description}</p>
              </div>
              <div className="custom-order-filterbar__chips">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={`custom-order-filterbar__chip ${activeCategory === category ? 'is-active' : ''}`}
                    onClick={() => setActiveCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {groupedArrangements.map((group) => (
              <section key={group.label} className="custom-order-group">
                <div className="custom-order-group__header">
                  <div>
                    <div className="custom-order-group__eyebrow">{GROUP_COPY[group.label]?.eyebrow || FALLBACK_GROUP_COPY.eyebrow}</div>
                    <h3>{group.label}</h3>
                  </div>
                  <span className="custom-order-group__count">{group.options.length} options</span>
                </div>

                <div className="custom-order-card-grid">
                  {group.options.map((option) => {
                    const isSelected = selectedArrangement?.value === option.value;

                    return (
                      <article
                        key={option.value}
                        className={`custom-order-card ${isSelected ? 'is-selected' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => handlePreviewSelect(option.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handlePreviewSelect(option.value);
                          }
                        }}
                      >
                        <div className="custom-order-card__image-wrap">
                          <img src={option.img} alt={option.label} className="custom-order-card__image" />
                          <div className="custom-order-card__badge">{group.label}</div>
                        </div>

                        <div className="custom-order-card__body">
                          <div className="custom-order-card__meta">
                            <span>{getArrangementGuideLabel(option)}</span>
                            <span>{isSelected ? 'Previewing now' : 'Tap to preview'}</span>
                          </div>
                          <h4>{option.label}</h4>
                          <div className="custom-order-card__price">{getArrangementPriceLabel(option)}</div>
                          <p>{option.description}</p>
                        </div>

                        <div className="custom-order-card__actions">
                          <button
                            type="button"
                            className="custom-order-card__secondary-action"
                            onClick={(event) => {
                              event.stopPropagation();
                              handlePreviewSelect(option.value);
                            }}
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            className="custom-order-card__primary-action"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOrderNow(option);
                            }}
                          >
                            Order Now
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}

            <div className="custom-order-catalog-footer-note">
              The catalogue gives you a visual starting point. You can still change quantity, preferred flowers, color palette, inspiration photos, and special instructions after you continue to the request form.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CustomOrderCatalog;
