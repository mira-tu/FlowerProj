import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaChevronLeft, FaArrowRotateLeft, FaScroll, FaRibbon, FaSeedling } from 'react-icons/fa6';
import html2canvas from 'html2canvas';
import RequestSuccessModal from '../components/RequestSuccessModal';
import InfoModal from '../components/InfoModal'; // Import InfoModal
import { supabase } from '../config/supabase';
import { stockAPI } from '../config/api'; // Import stockAPI
import '../styles/Customized.css';

const placeholderStemImg = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const placeholderImg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodGg9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodGg9IjEwMCIgZmlsbD0iI2UwZTBlMCIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1mYW1pbHk9ImFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjMzMzIiBhbmNob3ItcGVudD0ibWlkZGxlIiB0ZXh0LWFuY2hvcnM9Im1pZGRsZSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+'; // SVG "No Image" placeholder

const MAX_STEM_COUNT = 500; // Maximum number of stems allowed for performance reasons.
const bundleOptions = [3, 6, 12];
const steps = [
  { id: 1, icon: <FaScroll />, label: 'Wrapper' },
  { id: 2, icon: <FaRibbon />, label: 'Ribbon' },
  { id: 3, icon: <FaSeedling />, label: 'Flowers' }
];

const normalizeStockCategory = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'flower' || normalized === 'flowers') return 'Flowers';
  if (normalized === 'wrapper' || normalized === 'wrappers') return 'Wrappers';
  if (normalized === 'ribbon' || normalized === 'ribbons') return 'Ribbons';
  return String(value || '').trim();
};

const getOptionStockLabel = (item) => {
  if (item.is_available === false) return 'Unavailable';
  if ((item.quantity || 0) <= 0) return 'Out of Stock';
  if ((item.quantity || 0) <= 5) return `Only ${item.quantity} left!`;
  return `${item.quantity} pieces available`;
};

const isOptionSelectable = (item) => item.is_available !== false && (item.quantity || 0) > 0;

const BASE_PRESET_POSITIONS = {
  3: [
    { x: 40, y: 20, rotate: -15, zIndex: 1 },
    { x: 80, y: 10, rotate: 0, zIndex: 2 },
    { x: 120, y: 20, rotate: 15, zIndex: 1 },
  ],
  6: [
    { x: 30, y: 30, rotate: -20, zIndex: 1 },
    { x: 70, y: 20, rotate: -5, zIndex: 2 },
    { x: 110, y: 30, rotate: 10, zIndex: 1 },
    { x: 50, y: 50, rotate: -10, zIndex: 3 },
    { x: 90, y: 50, rotate: 10, zIndex: 3 },
    { x: 70, y: 70, rotate: 0, zIndex: 4 },
  ],
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getStemPosition = (index, count) => {
  const preset = BASE_PRESET_POSITIONS[count];
  if (preset?.[index]) {
    return { ...preset[index] };
  }

  const angle = index * 0.82;
  const radius = 18 + Math.sqrt(index + 1) * 18;

  return {
    x: clamp(70 + Math.cos(angle) * radius, 0, 220),
    y: clamp(45 + Math.sin(angle) * radius * 0.62, 0, 150),
    rotate: Math.sin(index * 1.35) * 18,
    zIndex: index + 1,
  };
};

const Customized = ({ addToCart }) => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(1);
  const [selection, setSelection] = useState({
    flowers: [],
    bundleSize: 0,
    wrapper: null,
    ribbon: null
  });
  const [customBundleSizeInput, setCustomBundleSizeInput] = useState('');
  const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '', linkTo: null, linkText: '', linkState: null }); // State for InfoModal
  const previewRef = useRef(null);
  const flowerZoneRef = useRef(null);
  const dragStateRef = useRef(null);
  const stemIdRef = useRef(0);

  // New state for dynamic customization data
  const [flowers, setFlowers] = useState([]);
  const [wrappers, setWrappers] = useState([]);
  const [ribbons, setRibbons] = useState([]);
  const [loadingCustomizationData, setLoadingCustomizationData] = useState(true);
  const [stemLayouts, setStemLayouts] = useState([]);
  const [draggingStemId, setDraggingStemId] = useState(null);

  useEffect(() => {
    const fetchCustomizationData = async () => {
      try {
        const response = await stockAPI.getAll();
        const allStockItems = response.data || [];

        const processedFlowers = allStockItems
          .filter(item => normalizeStockCategory(item.category) === 'Flowers')
          .map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            img: item.img,
            layerImg: item.layerImg,
            stemImg: item.stemImg,
            quantity: item.quantity || 0,
            is_available: item.is_available !== false,
          }));

        const processedWrappers = allStockItems
          .filter(item => normalizeStockCategory(item.category) === 'Wrappers')
          .map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            img: item.img,
            layerImg: item.layerImg,
            quantity: item.quantity || 0,
            is_available: item.is_available !== false,
          }));

        const processedRibbons = allStockItems
          .filter(item => normalizeStockCategory(item.category) === 'Ribbons')
          .map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            img: item.img,
            layerImg: item.layerImg,
            quantity: item.quantity || 0,
            is_available: item.is_available !== false,
          }));

        setFlowers(processedFlowers);
        setWrappers(processedWrappers);
        setRibbons(processedRibbons);

      } catch (error) {
        console.error('Error fetching customization data:', error.message || error);
        setInfoModal({ show: true, title: 'Error', message: 'Failed to load customization options. Please try again.' });
      } finally {
        setLoadingCustomizationData(false);
      }
    };

    fetchCustomizationData();
  }, []); // Run once on component mount

  const getMaxAllowedBundleSize = (selectedFlowers) => {
    if (!selectedFlowers || selectedFlowers.length === 0) return MAX_STEM_COUNT;
    const tempCounts = selectedFlowers.map(() => 0);
    let size = 0;
    while (size < MAX_STEM_COUNT) {
      const turn = size % selectedFlowers.length;
      if (tempCounts[turn] + 1 > selectedFlowers[turn].quantity) {
        break; // Ran out of stock for this flower
      }
      tempCounts[turn]++;
      size++;
    }
    return size;
  };

  const handleBundleSelect = (size) => {
    const maxAllowed = getMaxAllowedBundleSize(selection.flowers);
    if (size > maxAllowed) {
      setInfoModal({ show: true, title: 'Stock Limit Reached', message: `Based on your selected flowers, the maximum mathematically possible bundle size is ${maxAllowed} stems.` });
      setSelection((prev) => ({ ...prev, bundleSize: maxAllowed }));
      return;
    }
    setSelection((prev) => ({ ...prev, bundleSize: size }));
    setCustomBundleSizeInput(''); // Clear custom input when a predefined bundle is selected
  };

  const handleCustomBundleChange = (e) => {
    const value = e.target.value;
    if (!/^\d*$/.test(value)) return; // Only allow digits

    let numValue = value === '' ? 0 : parseInt(value, 10);
    let capped = false;

    const maxAllowed = Math.min(MAX_STEM_COUNT, getMaxAllowedBundleSize(selection.flowers));

    if (numValue > maxAllowed) {
      numValue = maxAllowed;
      capped = true;
    }

    setCustomBundleSizeInput(capped ? String(numValue) : value);

    if (numValue >= 2) {
      setSelection((prev) => ({ ...prev, bundleSize: numValue }));
    } else {
      setSelection((prev) => ({ ...prev, bundleSize: 0 }));
    }

    if (capped) {
      setInfoModal({
        show: true,
        title: 'Stem Limit Reached',
        message: `Your input has been adjusted to ${numValue} stems due to stock limits or maximum limits (${MAX_STEM_COUNT}).`,
      });
    }
  };

  const handleOptionSelect = (type, id) => {
    if (type === 'flowers') {
      const item = flowers.find((entry) => entry.id === id);
      if (!item) return;
      if (!isOptionSelectable(item)) {
        setInfoModal({ show: true, title: 'Unavailable', message: `${item.name} is currently unavailable for customized orders.` });
        return;
      }

      setSelection(prev => {
        const alreadySelected = prev.flowers.find(f => f.id === id);
        let newFlowers;
        if (alreadySelected) {
          newFlowers = prev.flowers.filter(f => f.id !== id);
        } else {
          if (prev.flowers.length >= 2) {
            setInfoModal({
              show: true,
              title: 'Flower Limit Reached',
              message: 'You can select up to 2 types of flowers.'
            });
            return prev;
          }
          newFlowers = [...prev.flowers, item];
        }

        const next = { ...prev, flowers: newFlowers };
        if (newFlowers.length > 0 && prev.bundleSize === 0) {
          next.bundleSize = 3;
        }
        if (newFlowers.length === 0) {
          next.bundleSize = 0;
        }

        if (newFlowers.length > 0 && next.bundleSize > 0) {
          const maxAllowed = getMaxAllowedBundleSize(newFlowers);
          if (next.bundleSize > maxAllowed) {
            setInfoModal({ show: true, title: 'Stock Adjusted', message: `Your bundle size was automatically reduced to ${maxAllowed} because your new flower selection has limited stock.` });
            next.bundleSize = maxAllowed;
            setCustomBundleSizeInput(maxAllowed < 2 ? '' : String(maxAllowed));
          }
        }

        return next;
      });
      return;
    }

    let item = null;
    if (type === 'wrappers') {
      item = wrappers.find((entry) => entry.id === id);
    } else if (type === 'ribbons') {
      item = ribbons.find((entry) => entry.id === id);
    }
    if (!item) return;
    if (!isOptionSelectable(item)) {
      setInfoModal({ show: true, title: 'Unavailable', message: `${item.name} is currently unavailable for customized orders.` });
      return;
    }
    setSelection((prev) => ({ ...prev, [type === 'wrappers' ? 'wrapper' : 'ribbon']: item }));
  };
  const handleReset = () => {
    setSelection({ flowers: [], bundleSize: 0, wrapper: null, ribbon: null });
    setActiveStep(1);
  };

  useEffect(() => {
    console.log('Current selection state:', selection);
  }, [selection]);

  const totalPrice = useMemo(() => {
    let total = 0;
    if (selection.flowers.length > 0 && selection.bundleSize) {
      const avgFlowerPrice = selection.flowers.reduce((sum, f) => sum + f.price, 0) / selection.flowers.length;
      total += avgFlowerPrice * selection.bundleSize;
    }
    if (selection.wrapper) total += selection.wrapper.price;
    if (selection.ribbon) total += selection.ribbon.price;
    return total;
  }, [selection]);

  const stemScale = useMemo(() => {
    if (selection.bundleSize <= 1) return 1;
    return Math.max(0.52, 1 - Math.min(selection.bundleSize - 1, 24) * 0.02);
  }, [selection.bundleSize]);

  const handleAddToCart = async () => {
    if (selection.flowers.length < 1 || selection.flowers.length > 2 || !selection.bundleSize) {
      setInfoModal({
        show: true,
        title: 'Selection Needed',
        message: 'Please select 1 to 2 flower types and a bundle size.',
      });
      return;
    }

    if (selection.wrapper && selection.wrapper.quantity < 1) {
      setInfoModal({ show: true, title: 'Out of Stock', message: `The ${selection.wrapper.name} wrapper is out of stock.` });
      return;
    }

    if (selection.ribbon && selection.ribbon.quantity < 1) {
      setInfoModal({ show: true, title: 'Out of Stock', message: `The ${selection.ribbon.name} ribbon is out of stock.` });
      return;
    }

    const maxAllowed = getMaxAllowedBundleSize(selection.flowers);
    if (selection.bundleSize > maxAllowed) {
      setInfoModal({ show: true, title: 'Check Stock', message: `Not enough flowers for a bundle of ${selection.bundleSize}. Max allowed stems based on current stock is ${maxAllowed}.` });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        setInfoModal({
          show: true,
          title: 'Login Required',
          message: 'You need to be logged in to add customized bouquets to your cart.',
          linkTo: '/login',
          linkText: 'Log In'
        });
        return;
      }

      let photoBase64 = null;
      if (previewRef.current) {
        try {
          const canvas = await html2canvas(previewRef.current, {
            backgroundColor: null, scale: 1, logging: false, useCORS: true,
          });
          photoBase64 = canvas.toDataURL('image/png');
        } catch (canvasError) {
          console.error('Error capturing screenshot:', canvasError);
        }
      }

      const customizedBouquet = {
        id: `custom-${Date.now()}`,
        name: 'Customized Bouquet',
        image: photoBase64,
        flowers: selection.flowers.map(f => ({ id: f.id, name: f.name, price: f.price })),
        bundleSize: selection.bundleSize,
        wrapper: selection.wrapper ? { id: selection.wrapper.id, name: selection.wrapper.name, price: selection.wrapper.price } : null,
        ribbon: selection.ribbon ? { id: selection.ribbon.id, name: selection.ribbon.name, price: selection.ribbon.price } : null,
        price: totalPrice,
        qty: 1
      };

      const cartKey = `customizedCart_${session?.user?.id || 'guest'}`;
      const existingCart = JSON.parse(localStorage.getItem(cartKey) || '[]');
      const updatedCart = [...existingCart, customizedBouquet];
      localStorage.setItem(cartKey, JSON.stringify(updatedCart));

      navigate('/cart', { state: { justAdded: 'customized' } });

    } catch (error) {
      console.error('Error adding to cart:', error);
      setInfoModal({ show: true, title: 'Error', message: 'Error adding to cart. Please try again.' });
    }
  };

  useEffect(() => {
    if (selection.flowers.length === 0 || !selection.bundleSize) {
      setStemLayouts([]);
      setDraggingStemId(null);
      dragStateRef.current = null;
      return;
    }

    setStemLayouts((previousLayouts) => {
      const nextLayouts = previousLayouts
        .slice(0, selection.bundleSize)
        .map((layout, index) => ({
          ...layout,
          zIndex: index + 1,
        }));

      for (let index = nextLayouts.length; index < selection.bundleSize; index += 1) {
        nextLayouts.push({
          id: `stem-${stemIdRef.current += 1}`,
          ...getStemPosition(index, selection.bundleSize),
        });
      }

      return nextLayouts;
    });
  }, [selection.bundleSize, selection.flowers.length]);

  const isEmpty = selection.flowers.length === 0 && !selection.wrapper && !selection.ribbon;

  const formatPrice = (value) => `PHP ${value.toLocaleString('en-PH')}`;

  const releaseDraggedStem = (event) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      dragStateRef.current = null;
      setDraggingStemId(null);
    }
  };

  const handleStemPointerDown = (stemId, index) => (event) => {
    if (!flowerZoneRef.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const zoneRect = flowerZoneRef.current.getBoundingClientRect();
    const targetRect = event.currentTarget.getBoundingClientRect();
    const layout = stemLayouts[index];

    if (!layout) return;

    dragStateRef.current = {
      index,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: layout.x,
      originY: layout.y,
      maxX: Math.max(zoneRect.width - targetRect.width, 0),
      maxY: Math.max(zoneRect.height - targetRect.height, 0),
    };

    setDraggingStemId(stemId);
    setStemLayouts((previousLayouts) => previousLayouts.map((stemLayout, layoutIndex) => (
      layoutIndex === index
        ? { ...stemLayout, zIndex: previousLayouts.length + 1 }
        : stemLayout
    )));

    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const handleStemPointerMove = (index) => (event) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.index !== index) return;

    const nextX = clamp(dragState.originX + (event.clientX - dragState.startX), 0, dragState.maxX);
    const nextY = clamp(dragState.originY + (event.clientY - dragState.startY), 0, dragState.maxY);

    setStemLayouts((previousLayouts) => previousLayouts.map((layout, layoutIndex) => (
      layoutIndex === index
        ? { ...layout, x: nextX, y: nextY }
        : layout
    )));

    event.preventDefault();
  };

  const renderOptions = (groupKey, selectedIds) => {
    let options = [];
    if (groupKey === 'flowers') {
      options = flowers;
    } else if (groupKey === 'wrappers') {
      options = wrappers;
    } else if (groupKey === 'ribbons') {
      options = ribbons;
    }

    if (loadingCustomizationData) {
      return <div className="loading-indicator">Loading options...</div>;
    }
    if (options.length === 0) {
      return <div className="no-options">No {groupKey} available.</div>;
    }

    const isMultiSelect = Array.isArray(selectedIds);

    return (
      <div className="grid-options" id={`${groupKey}Options`}>
        {options.map((item) => {
          const isSelected = isMultiSelect ? selectedIds.includes(item.id) : selectedIds === item.id;
          const isSelectable = isOptionSelectable(item);
          const stockLabel = getOptionStockLabel(item);

          return (
            <button
              key={item.id}
              type="button"
              className={`option-card ${isSelected ? "selected" : ""} ${!isSelectable ? "disabled" : ""}`}
              onClick={() => handleOptionSelect(groupKey, item.id)}
              disabled={!isSelectable}
              aria-disabled={!isSelectable}
            >
              <img src={item.img || placeholderImg} alt={item.name} className="option-img" />
              <div className="option-name">{item.name}</div>
              <div className="option-price">+{formatPrice(item.price)}{groupKey === "flowers" ? "/pc" : ""}</div>
              <div className={`option-stock ${!isSelectable ? "danger" : (item.quantity <= 5 ? "warning" : "")}`}>{stockLabel}</div>
            </button>
          );
        })}
      </div>
    );
  };
  return (
    <div className="customize-page">
      <header className="app-header">
        <div className="header-left">
          <Link to="/" className="back-link">
            <FaChevronLeft /> Back
          </Link>
          <span className="divider" />
          <h3>Customizer Studio</h3>
        </div>
        <div className="header-right">
          <button type="button" className="back-link border-0 bg-transparent" onClick={handleReset}>
            <FaArrowRotateLeft /> Reset
          </button>
          <div className="price-display">
            <span className="label">Total</span>
            <span className="amount">{formatPrice(totalPrice)}</span>
          </div>
          <button type="button" className="btn-action header-cart-btn" onClick={handleAddToCart}>Add to Cart</button>
        </div>
      </header>


      {/* Mobile floating Add to Cart button */}
      <div className="mobile-add-to-cart-bar">
        <div className="mobile-cart-price">
          <span className="mobile-cart-label">Total</span>
          <span className="mobile-cart-amount">{formatPrice(totalPrice)}</span>
        </div>
        <button type="button" className="mobile-cart-btn" onClick={handleAddToCart}>
          <i className="fas fa-shopping-cart" style={{ marginRight: '0.5rem' }}></i>
          Add to Cart
        </button>
      </div>

      <InfoModal
        show={infoModal.show}
        onClose={() => setInfoModal({ show: false, title: '', message: '' })}
        title={infoModal.title}
        message={infoModal.message}
        linkTo={infoModal.linkTo}
        linkText={infoModal.linkText}
        linkState={infoModal.linkState}
      />

      <main className="editor-layout">
        <section className="preview-canvas">
          <div className="canvas-container">
            <div className="bouquet-stage" ref={previewRef}>
              {selection.wrapper && (
                <img src={selection.wrapper.layerImg || selection.wrapper.img || placeholderImg} alt="Wrapper" className="layer" style={{ zIndex: 1, top: '50%' }} />
              )}

              {/* Flower Zone - Constrained Area */}
              <div
                ref={flowerZoneRef}
                className="flower-zone"
                style={{
                  position: 'absolute',
                  top: '0%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 2,
                  touchAction: 'none'
                }}
              >
                {stemLayouts.map((slot, index) => {
                  const flowerIndex = index % selection.flowers.length;
                  const flower = selection.flowers[flowerIndex];
                  const stemImage = flower?.stemImg || flower?.layerImg || placeholderStemImg;

                  return (
                    <div
                      key={slot.id}
                      className={`drag-handle ${draggingStemId === slot.id ? 'is-dragging' : ''}`}
                      style={{
                        position: 'absolute',
                        left: slot.x,
                        top: slot.y,
                        zIndex: slot.zIndex,
                        transform: `scale(${stemScale})`,
                        transformOrigin: 'center center'
                      }}
                      onPointerDown={handleStemPointerDown(slot.id, index)}
                      onPointerMove={handleStemPointerMove(index)}
                      onPointerUp={releaseDraggedStem}
                      onPointerCancel={releaseDraggedStem}
                      onLostPointerCapture={releaseDraggedStem}
                    >
                      <div style={{ transform: `rotate(${slot.rotate}deg)`, width: '100%', height: '100%' }}>
                        <img src={stemImage} alt="Selected stem" className="stem-slot" draggable="false" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {selection.ribbon && (
                <img
                  src={selection.ribbon.layerImg || selection.ribbon.img || placeholderImg}
                  alt="Ribbon"
                  className="layer"
                  style={{ zIndex: 3, top: '65%' }}
                />
              )}

              {isEmpty && (
                <div className="empty-state">
                  <FaSeedling size={48} />
                  <p>Select a flower to start</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="tools-interface">
          <nav className="vertical-toolbar">
            {steps.map((step) => (
              <button
                key={step.id}
                type="button"
                className={`tool-btn ${activeStep === step.id ? 'active' : ''}`}
                onClick={() => setActiveStep(step.id)}
              >
                <div className="icon-wrapper">{step.icon}</div>
                <span>{step.label}</span>
              </button>
            ))}
          </nav>

          <div className="options-panel">
            <div className={`panel-content ${activeStep === 1 ? 'active' : ''}`} id="step1">
              <div className="panel-header">
                <h4>Select Wrapper</h4>
                <p>Wrap it with style</p>
              </div>
              <div className="control-group">
                <label>Wrapper Style</label>
                {renderOptions('wrappers', selection.wrapper?.id || null)}
              </div>
            </div>

            <div className={`panel-content ${activeStep === 2 ? 'active' : ''}`} id="step2">
              <div className="panel-header">
                <h4>Pick Ribbon</h4>
                <p>Add the finishing touch</p>
              </div>
              <div className="control-group">
                <label>Ribbon Color</label>
                {renderOptions('ribbons', selection.ribbon?.id || null)}
              </div>
            </div>

            <div className={`panel-content ${activeStep === 3 ? 'active' : ''}`} id="step3">
              <div className="panel-header">
                <h4>Choose Flowers</h4>
                <p>Select your base blooms</p>
              </div>

              <div className="control-group">
                <label>Bundle Size</label>
                <div className="bundle-selector-group">
                  {bundleOptions.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={`bundle-pill ${selection.bundleSize === size && customBundleSizeInput === '' ? 'active' : ''}`}
                      onClick={() => handleBundleSelect(size)}
                    >
                      {size} Stems
                    </button>
                  ))}
                </div>
              </div>

              {/* New Custom Stems Input */}
              <div className="control-group">
                <label>Custom Stems</label>
                <div className="custom-bundle-input-card">
                  <input
                    type="number"
                    min="2"
                    step="1"
                    value={customBundleSizeInput}
                    onChange={handleCustomBundleChange}
                    placeholder="e.g. 2"
                    className="custom-stem-input"
                  />

                </div>
              </div>

              <div className="control-group">
                <label>Flower Type</label>
                {renderOptions('flowers', selection.flowers.map(f => f.id))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Customized;