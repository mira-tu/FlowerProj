import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import InfoModal from '../components/InfoModal';
import { supabase } from '../config/supabase';
import { formatPhoneNumber } from '../utils/format';
import {
  buildCustomOrderV4CartItem,
  fetchCustomOrderV4Catalog,
  formatCustomOrderV4Currency,
  generateCustomOrderV4Suggestions,
  getActiveCustomOrderCatalogDesigns,
} from '../utils/customOrderV4';
import '../styles/CustomOrderShared.css';
import '../styles/Shop.css';
import '../styles/CustomOrderV4Form.css';
import '../styles/CustomOrderV4.css';

const occasionOptions = [
  'Birthday',
  'Wedding',
  'Anniversary',
  'Graduation',
  'Corporate Event',
  "Valentine's Day",
  "Mother's Day",
  'Sympathy/Funeral',
  'Other',
];

const getInitialFormData = (user) => {
  const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')?.[0] || '';

  return {
    customerName: fullName,
    email: user?.email || '',
    contactNumber: formatPhoneNumber(user?.user_metadata?.phone || ''),
    recipientName: fullName,
    occasion: '',
    otherOccasion: '',
    eventDate: '',
    eventTime: '',
    venue: '',
    budget: '',
    specialInstructions: '',
    inspirationImageBase64: null,
    designId: '',
    packageTierId: '',
    wrapperId: '',
    selectedAddOnIds: [],
    selectedAlternativeId: 'original',
  };
};

const pageConfig = {
  serviceName: 'Custom Order',
  serviceBadge: 'Services / Custom Order',
  fetchCatalog: fetchCustomOrderV4Catalog,
  openLinkPath: '/custom-order',
  openLinkLabel: 'Back to catalogue',
  loadingLabel: 'Loading Custom Order...',
  requestVariant: 'custom_order_v4',
  customOrderVersion: 4,
  flow: 'custom_order_v4',
  loginMessage: 'Please login first to submit a custom order request.',
  sectionIntro: 'Select the arrangement concept you want, then compare visual budget-fit versions before sending your request.',
  directOrderNote: 'Your selected arrangement will carry into this form when you arrive from the catalogue.',
};

const CustomOrderV4Form = ({ user }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef(null);
  const [catalog, setCatalog] = useState(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [validated, setValidated] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [dateError, setDateError] = useState('');
  const [timeError, setTimeError] = useState('');
  const [fileSizeError, setFileSizeError] = useState('');
  const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '', linkTo: null, linkText: '' });
  const [activeReferenceId, setActiveReferenceId] = useState('');
  const [formData, setFormData] = useState(() => getInitialFormData(user));
  const requestedOfferingId = searchParams.get('offering') || '';

  useEffect(() => {
    const loadCatalog = async () => {
      setLoadingCatalog(true);
      const nextCatalog = await pageConfig.fetchCatalog(supabase);
      nextCatalog.designs = getActiveCustomOrderCatalogDesigns(nextCatalog);
      setCatalog(nextCatalog);
      setLoadingCatalog(false);
    };

    loadCatalog();
  }, []);

  const selectedDesign = useMemo(() => {
    if (!catalog?.designs?.length) return null;
    const preferredDesignId = formData.designId || requestedOfferingId;
    return catalog.designs.find((design) => design.id === preferredDesignId) || catalog.designs[0];
  }, [catalog, formData.designId, requestedOfferingId]);

  const selectedPackageTier = useMemo(() => {
    if (!selectedDesign) return null;
    return selectedDesign.packageTiers.find((item) => item.id === formData.packageTierId)
      || selectedDesign.packageTiers.find((item) => item.isDefault)
      || selectedDesign.packageTiers[0]
      || null;
  }, [formData.packageTierId, selectedDesign]);

  const selectedWrapper = useMemo(() => {
    if (!selectedDesign) return null;
    return selectedDesign.wrappers.find((item) => item.id === formData.wrapperId)
      || selectedDesign.wrappers.find((item) => item.isDefault)
      || selectedDesign.wrappers[0]
      || null;
  }, [formData.wrapperId, selectedDesign]);

  const selectedAddOnIds = useMemo(() => {
    if (!selectedDesign) return [];
    return formData.selectedAddOnIds.filter((id) => selectedDesign.addOns.some((item) => item.id === id));
  }, [formData.selectedAddOnIds, selectedDesign]);

  const activeReference = useMemo(() => {
    if (!selectedDesign) return null;
    return selectedDesign.referenceImages.find((image) => image.id === activeReferenceId) || selectedDesign.referenceImages[0] || null;
  }, [activeReferenceId, selectedDesign]);

  const budgetValue = useMemo(() => {
    const parsedBudget = Number.parseFloat(formData.budget);
    return Number.isFinite(parsedBudget) ? parsedBudget : 0;
  }, [formData.budget]);

  const estimateResult = useMemo(() => {
    if (!selectedDesign || !selectedPackageTier || !selectedWrapper) return null;

    return generateCustomOrderV4Suggestions({
      design: selectedDesign,
      selectedPackageTierId: selectedPackageTier.id,
      selectedWrapperId: selectedWrapper.id,
      selectedAddOnIds,
      customerBudget: budgetValue,
    });
  }, [budgetValue, selectedAddOnIds, selectedDesign, selectedPackageTier, selectedWrapper]);

  const effectiveSelectedAlternativeId = useMemo(() => {
    if (!estimateResult?.alternatives?.length) return 'original';

    if (formData.selectedAlternativeId === 'original') {
      return 'original';
    }

    const exists = estimateResult.alternatives.some((alternative) => alternative.id === formData.selectedAlternativeId);
    if (exists) {
      return formData.selectedAlternativeId;
    }

    const recommended = estimateResult.alternatives.find((alternative) => alternative.withinBudget) || estimateResult.alternatives[0];
    return recommended?.id || 'original';
  }, [estimateResult, formData.selectedAlternativeId]);

  const selectedAlternative = useMemo(() => (
    estimateResult?.alternatives?.find((alternative) => alternative.id === effectiveSelectedAlternativeId) || null
  ), [effectiveSelectedAlternativeId, estimateResult]);

  const selectedEstimate = selectedAlternative?.selectedEstimate || estimateResult?.originalDesign || null;
  const originalPreview = estimateResult?.originalDesign?.preview || activeReference || selectedDesign?.referenceImages?.[0] || null;
  const selectedPreview = selectedEstimate?.preview || selectedAlternative?.preview || originalPreview || null;
  const normalizedFormData = useMemo(() => ({
    ...formData,
    designId: selectedDesign?.id || '',
    packageTierId: selectedPackageTier?.id || '',
    wrapperId: selectedWrapper?.id || '',
    selectedAddOnIds,
    selectedAlternativeId: effectiveSelectedAlternativeId,
  }), [effectiveSelectedAlternativeId, formData, selectedAddOnIds, selectedDesign, selectedPackageTier, selectedWrapper]);

  const minEventDate = useMemo(() => new Date().toISOString().split('T')[0], []);

  const handleChange = (event) => {
    const { name, value } = event.target;

    if (name === 'contactNumber') {
      setFormData((current) => ({ ...current, contactNumber: formatPhoneNumber(value) }));
      return;
    }

    if (name === 'budget') {
      setFormData((current) => ({
        ...current,
        budget: value.replace(/[^\d.]/g, ''),
        selectedAlternativeId: 'original',
      }));
      return;
    }

    setFormData((current) => ({ ...current, [name]: value }));
  };

  const toggleAddOn = (addOnId) => {
    setFormData((current) => ({
      ...current,
      selectedAddOnIds: current.selectedAddOnIds.includes(addOnId)
        ? current.selectedAddOnIds.filter((id) => id !== addOnId)
        : [...current.selectedAddOnIds, addOnId],
      selectedAlternativeId: 'original',
    }));
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    setFileSizeError('');

    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      setFileSizeError('Please upload a JPG or PNG file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileSizeError('File size exceeds 5MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const maxRatio = Math.min(900 / image.width, 900 / image.height, 1);
        canvas.width = Math.round(image.width * maxRatio);
        canvas.height = Math.round(image.height * maxRatio);
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        setFormData((current) => ({
          ...current,
          inspirationImageBase64: canvas.toDataURL('image/jpeg', 0.72),
        }));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const triggerValidation = (event) => {
    event.preventDefault();
    const form = event.currentTarget;

    if (form.checkValidity() === false || !selectedDesign || !estimateResult) {
      event.stopPropagation();
      setValidated(true);
      setInfoModal({
        show: true,
        title: 'Missing Required Fields',
        message: 'Please complete the required details before reviewing your request.',
      });
      return;
    }

    if (!user) {
      setInfoModal({
        show: true,
        title: 'Login Required',
        message: pageConfig.loginMessage,
        linkTo: '/login',
        linkText: 'Log In',
      });
      return;
    }

    if (!budgetValue) {
      setInfoModal({
        show: true,
        title: 'Budget Needed',
        message: 'Please add a budget so we can compare the original design against budget-fit alternatives.',
      });
      return;
    }

    if (dateError || timeError) {
      setInfoModal({
        show: true,
        title: 'Please Check Your Schedule',
        message: 'Please fix the date or time fields before continuing.',
      });
      return;
    }

    setValidated(true);
    setShowConfirmModal(true);
  };

  const handleSubmit = () => {
    if (!selectedDesign || !estimateResult) return;

    const cartItem = buildCustomOrderV4CartItem({
      formData: normalizedFormData,
      design: selectedDesign,
      originalDesign: estimateResult.originalDesign,
      alternatives: estimateResult.alternatives,
      selectedAlternativeId: effectiveSelectedAlternativeId,
      requestVariant: pageConfig.requestVariant,
      customOrderVersion: pageConfig.customOrderVersion,
      flow: pageConfig.flow,
      serviceType: pageConfig.serviceName,
      reviewNote: catalog?.pageCopy?.reviewNote,
    });

    const cartKey = `bookingCart_${user?.id || 'guest'}`;
    let existingItems = [];

    try {
      existingItems = JSON.parse(localStorage.getItem(cartKey) || '[]');
    } catch (error) {
      console.error('Failed to parse booking cart:', error);
    }

    localStorage.setItem(cartKey, JSON.stringify([...existingItems.slice(-4), cartItem]));
    setShowConfirmModal(false);
    navigate('/cart', { state: { justAdded: 'booking' } });
  };

  if (loadingCatalog || !catalog || !selectedDesign || !estimateResult || !selectedEstimate) {
    return (
      <div className="booking-section custom-order-form-page">
        <div className="container py-5 text-center">
          <div className="spinner-border text-danger" role="status" aria-hidden="true"></div>
          <p className="mt-3 mb-0 fw-semibold">{pageConfig.loadingLabel}</p>
        </div>
      </div>
    );
  }

  const budgetIsBelowOriginal = budgetValue > 0 && budgetValue < estimateResult.originalDesign.estimatedPrice;
  const occasionLabel = formData.occasion === 'Other' ? formData.otherOccasion : formData.occasion;

  return (
    <div className="booking-section custom-order-form-page">
      <InfoModal
        show={infoModal.show}
        onClose={() => setInfoModal({ show: false, title: '', message: '', linkTo: null, linkText: '' })}
        title={infoModal.title}
        message={infoModal.message}
        linkTo={infoModal.linkTo}
        linkText={infoModal.linkText}
      />

      <div className="container">
        <div className="text-center mb-5 mt-4">
          <div className="custom-order-form-badge">{pageConfig.serviceBadge}</div>
          <h1 className="display-4 fw-bold font-playfair text-dark">{catalog.pageCopy.title}</h1>
          <p className="lead text-muted mx-auto" style={{ maxWidth: '760px' }}>{catalog.pageCopy.subtitle}</p>
        </div>

        <div className="row justify-content-center">
          <div className="col-lg-11">
            <div className="card border-0 shadow-lg custom-order-form-shell">
              <div className="card-body p-4 p-md-5 bg-white">
                <form noValidate className={validated ? 'was-validated' : ''} onSubmit={triggerValidation}>
                  <h4 className="fw-bold mb-4 d-flex align-items-center" style={{ color: 'var(--shop-pink)' }}>
                    <i className="fas fa-user-circle me-3 fs-3"></i> Personal Information
                  </h4>

                  <div className="row g-4 mb-5">
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Your Full Name <span className="text-danger">*</span></label>
                      <input type="text" name="customerName" className="form-control bg-light border-0 py-3" value={formData.customerName} onChange={handleChange} required />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Email Address <span className="text-danger">*</span></label>
                      <input type="email" name="email" className="form-control bg-light border-0 py-3" value={formData.email} onChange={handleChange} required />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Contact Number <span className="text-danger">*</span></label>
                      <input type="tel" name="contactNumber" className="form-control bg-light border-0 py-3" value={formData.contactNumber} onChange={handleChange} required />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Recipient Full Name <span className="text-danger">*</span></label>
                      <input type="text" name="recipientName" className="form-control bg-light border-0 py-3" value={formData.recipientName} onChange={handleChange} required />
                    </div>
                  </div>

                  <hr className="my-5 text-muted opacity-25" />

                  <h4 className="fw-bold mb-4 d-flex align-items-center" style={{ color: 'var(--shop-pink)' }}>
                    <i className="far fa-calendar-alt me-3 fs-3"></i> Delivery & Event Details
                  </h4>

                  <div className="row g-4 mb-5">
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Occasion <span className="text-danger">*</span></label>
                      <select name="occasion" className="form-select bg-light border-0 py-3" value={formData.occasion} onChange={handleChange} required>
                        <option value="" disabled>Select Occasion</option>
                        {occasionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                      {formData.occasion === 'Other' && (
                        <input type="text" name="otherOccasion" className="form-control bg-light border-0 py-3 mt-2" placeholder="Please specify the occasion" value={formData.otherOccasion} onChange={handleChange} required />
                      )}
                    </div>
                    <div className="col-12">
                      <label className="form-label fw-semibold">Event Venue / Location Reference <span className="text-danger">*</span></label>
                      <input type="text" name="venue" className="form-control bg-light border-0 py-3" placeholder="Enter the event venue, landmark, or location reference..." value={formData.venue} onChange={handleChange} required />
                      <div className="form-text small">Delivery addresses are still selected during checkout.</div>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Date Needed <span className="text-danger">*</span></label>
                      <input
                        type="date"
                        name="eventDate"
                        className={`form-control bg-light border-0 py-3 ${dateError ? 'is-invalid border-danger border-1' : ''}`}
                        min={minEventDate}
                        value={formData.eventDate}
                        onChange={(event) => {
                          const date = new Date(event.target.value);
                          const day = date.getUTCDay();
                          setDateError(day === 0 || day === 6 ? 'Deliveries are only available on weekdays (Monday to Friday).' : '');
                          handleChange(event);
                        }}
                        required
                      />
                      {dateError ? <div className="invalid-feedback d-block">{dateError}</div> : <div className="form-text small">Available Monday to Friday only.</div>}
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Preferred Time</label>
                      <input
                        type="time"
                        name="eventTime"
                        className={`form-control bg-light border-0 py-3 ${timeError ? 'is-invalid border-danger border-1' : ''}`}
                        value={formData.eventTime}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value) {
                            const [hours, minutes] = value.split(':').map(Number);
                            setTimeError(hours < 9 || hours > 16 || (hours === 16 && minutes > 0) ? 'Our operating hours are from 9:00 AM to 4:00 PM.' : '');
                          } else {
                            setTimeError('');
                          }
                          handleChange(event);
                        }}
                      />
                      {timeError ? <div className="invalid-feedback d-block">{timeError}</div> : <div className="form-text small">Business hours: 9:00 AM to 4:00 PM.</div>}
                    </div>
                  </div>

                  <hr className="my-5 text-muted opacity-25" />

                  <h4 className="fw-bold mb-4 d-flex align-items-center" style={{ color: 'var(--shop-pink)' }}>
                    <i className="fas fa-seedling me-3 fs-3"></i> Floral Specifications
                  </h4>

                  <div className="custom-order-form-section mb-4">
                    <div className="custom-order-form-section__header">
                      <div>
                        <h5 className="fw-bold mb-1">Choose your original target design</h5>
                        <p className="text-muted mb-0">{pageConfig.sectionIntro}</p>
                      </div>
                      <Link to={pageConfig.openLinkPath} className="custom-order-form-link">{pageConfig.openLinkLabel}</Link>
                    </div>

                    <div className="custom-order-form-design-grid">
                      {catalog.designs.map((design) => {
                        const defaultTier = design.packageTiers.find((item) => item.isDefault) || design.packageTiers[0];
                        return (
                          <button
                            key={design.id}
                            type="button"
                            className={`custom-order-form-design-card ${selectedDesign.id === design.id ? 'is-active' : ''}`}
                            onClick={() => {
                              setActiveReferenceId('');
                              setFormData((current) => ({ ...current, designId: design.id, selectedAlternativeId: 'original' }));
                            }}
                          >
                            <img src={design.referenceImages[0]?.url} alt={design.referenceImages[0]?.alt || design.title} className="custom-order-form-design-card__image" />
                            <div className="custom-order-form-design-card__body">
                              <div className="custom-order-form-pill">{design.category}</div>
                              <h6 className="fw-bold mb-1">{design.title}</h6>
                              <p className="text-muted small mb-2">{design.description}</p>
                              <div className="custom-order-form-design-card__price">
                            {design.priceRangeLabel || `Starts around ${formatCustomOrderV4Currency(defaultTier?.price || 0)}`}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="row g-4 mb-4">
                    <div className="col-lg-6">
                      <div className="custom-order-form-preview">
                        {activeReference ? (
                          <img src={activeReference.url} alt={activeReference.alt} className="custom-order-form-preview__image" />
                        ) : null}
                        <div className="custom-order-form-preview__body">
                          <div className="custom-order-form-pill">{selectedDesign.category}</div>
                          <h5 className="fw-bold mb-1 mt-2">{selectedDesign.title}</h5>
                          <p className="text-muted mb-2">{selectedDesign.description}</p>
                          <p className="small text-muted mb-3">{selectedDesign.roughDescription}</p>
                          {selectedDesign.notes ? <div className="custom-order-v4-inline-note mb-3">{selectedDesign.notes}</div> : null}
                          <div className="custom-order-form-thumbnail-row">
                            {selectedDesign.referenceImages.map((image) => (
                              <button key={image.id} type="button" className={`custom-order-form-thumbnail ${activeReference?.id === image.id ? 'is-active' : ''}`} onClick={() => setActiveReferenceId(image.id)}>
                                <img src={image.url} alt={image.alt} />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="col-lg-6">
                      <div className="custom-order-form-config-panel">
                        <label className="form-label fw-semibold">Package Tier</label>
                        <div className="custom-order-form-option-grid mb-4">
                          {selectedDesign.packageTiers.map((tier) => (
                            <button
                              key={tier.id}
                              type="button"
                              className={`custom-order-form-option-card ${selectedPackageTier?.id === tier.id ? 'is-active' : ''}`}
                              onClick={() => setFormData((current) => ({ ...current, packageTierId: tier.id, selectedAlternativeId: 'original' }))}
                            >
                              <div className="fw-bold">{tier.name}</div>
                              <div className="small text-muted">{tier.description}</div>
                              <div className="custom-order-form-option-card__footer">
                                <span>{tier.sizeLabel}</span>
                              <strong>{formatCustomOrderV4Currency(tier.price)}</strong>
                              </div>
                            </button>
                          ))}
                        </div>

                        <label className="form-label fw-semibold">Presentation / Wrapper</label>
                        <div className="custom-order-form-option-grid compact mb-4">
                          {selectedDesign.wrappers.map((wrapper) => (
                            <button
                              key={wrapper.id}
                              type="button"
                              className={`custom-order-form-option-card ${selectedWrapper?.id === wrapper.id ? 'is-active' : ''}`}
                              onClick={() => setFormData((current) => ({ ...current, wrapperId: wrapper.id, selectedAlternativeId: 'original' }))}
                            >
                              <div className="fw-bold">{wrapper.name}</div>
                              <div className="small text-muted">{wrapper.description}</div>
                              <div className="custom-order-form-option-card__footer">
                                <span>Wrap option</span>
                              <strong>{formatCustomOrderV4Currency(wrapper.price)}</strong>
                              </div>
                            </button>
                          ))}
                        </div>

                        <label className="form-label fw-semibold">Optional Add-ons</label>
                        <div className="custom-order-form-addon-list mb-4">
                          {selectedDesign.addOns.map((addOn) => {
                            const checked = selectedAddOnIds.includes(addOn.id);
                            return (
                              <label key={addOn.id} className={`custom-order-form-addon ${checked ? 'is-active' : ''}`}>
                                <input type="checkbox" checked={checked} onChange={() => toggleAddOn(addOn.id)} />
                                <div>
                                  <div className="fw-semibold">{addOn.name}</div>
                                  <div className="small text-muted">{addOn.description}</div>
                                </div>
                              <strong>{formatCustomOrderV4Currency(addOn.price)}</strong>
                              </label>
                            );
                          })}
                        </div>

                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label fw-semibold">Your Budget <span className="text-danger">*</span></label>
                            <input type="text" name="budget" inputMode="decimal" className="form-control bg-light border-0 py-3" placeholder="e.g., 4000" value={formData.budget} onChange={handleChange} required />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label fw-semibold">Rough Arrangement Description <span className="text-danger">*</span></label>
                            <input type="text" name="specialInstructions" className="form-control bg-light border-0 py-3" placeholder="Describe your must-have details" value={formData.specialInstructions} onChange={handleChange} required />
                          </div>
                        </div>

                        <div className="form-text mt-2">{catalog.pageCopy.budgetHelper}</div>
                      </div>
                    </div>
                  </div>

                  <div className="row g-4 mb-4">
                    <div className="col-lg-6">
                      <div className="custom-order-form-summary-card original">
                        <div className="custom-order-form-summary-card__eyebrow">Original target design</div>
                        {originalPreview?.url ? (
                          <div className="custom-order-v4-visual-card mb-3">
                            <img src={originalPreview.url} alt={originalPreview.alt || selectedDesign.title} className="custom-order-v4-visual-card__image" />
                            <div className="custom-order-v4-visual-card__caption">
                              <strong>{originalPreview.label || 'Original preview'}</strong>
                              <span>{originalPreview.caption || selectedDesign.notes || selectedDesign.roughDescription}</span>
                            </div>
                          </div>
                        ) : null}
                        <h5 className="fw-bold mb-1">{selectedDesign.title}</h5>
                        <p className="text-muted mb-3">{selectedDesign.description}</p>
                        <div className="custom-order-form-summary-card__meta">
                          <div><span>Estimated original price</span><strong>{formatCustomOrderV4Currency(estimateResult.originalDesign.estimatedPrice)}</strong></div>
                          <div><span>Your budget</span><strong>{budgetValue ? formatCustomOrderV4Currency(budgetValue) : 'Add your budget'}</strong></div>
                          <div><span>Selected package</span><strong>{estimateResult.originalDesign.packageTier?.name}</strong></div>
                          <div><span>Wrapper</span><strong>{estimateResult.originalDesign.wrapper?.name}</strong></div>
                        </div>
                        <div className="custom-order-form-line-items">
                          {estimateResult.originalDesign.lineItems.map((lineItem) => (
                            <div key={lineItem.id} className="custom-order-form-line-item">
                              <span>{lineItem.quantity > 1 ? `${lineItem.label} x${lineItem.quantity}` : lineItem.label}</span>
                              <strong>{formatCustomOrderV4Currency(lineItem.total)}</strong>
                            </div>
                          ))}
                        </div>
                        {budgetIsBelowOriginal ? (
                          <div className="custom-order-form-alert">
                            <i className="fas fa-circle-info"></i>
                            <span>You are about {formatCustomOrderV4Currency(estimateResult.budgetGap)} below the original target design.</span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="col-lg-6">
                      <div className="custom-order-form-summary-card selected">
                        <div className="custom-order-form-summary-card__eyebrow">Preferred version</div>
                        {selectedPreview?.url ? (
                          <div className="custom-order-v4-visual-card mb-3">
                            <img src={selectedPreview.url} alt={selectedPreview.alt || selectedAlternative?.label || selectedDesign.title} className="custom-order-v4-visual-card__image" />
                            <div className="custom-order-v4-visual-card__caption">
                              <strong>{selectedPreview.label || (selectedAlternative?.label || 'Preferred version')}</strong>
                              <span>{selectedPreview.caption || selectedAlternative?.summary || catalog.pageCopy.reviewNote}</span>
                            </div>
                          </div>
                        ) : null}
                        <h5 className="fw-bold mb-1">{selectedAlternative?.label || 'Original target design'}</h5>
                        <p className="text-muted mb-3">{selectedAlternative?.summary || 'Your budget already covers the original concept.'}</p>
                        <div className="custom-order-form-summary-card__meta">
                          <div><span>Current selected estimate</span><strong>{formatCustomOrderV4Currency(selectedEstimate.estimatedPrice)}</strong></div>
                          <div><span>Package</span><strong>{selectedEstimate.packageTier?.name}</strong></div>
                          <div><span>Wrapper</span><strong>{selectedEstimate.wrapper?.name}</strong></div>
                          <div><span>Occasion</span><strong>{occasionLabel || 'Select occasion'}</strong></div>
                        </div>
                        {selectedAlternative?.changes?.length ? (
                          <div className="custom-order-form-note-list">
                            {selectedAlternative.changes.map((change) => (
                              <div key={change.key} className="custom-order-form-note-list__item">
                                <i className="fas fa-check-circle"></i>
                                <span>{change.explanation}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="custom-order-form-note">{catalog.pageCopy.reviewNote}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="custom-order-form-section mb-4">
                    <div className="custom-order-form-section__header">
                      <div>
                        <h5 className="fw-bold mb-1">{catalog.pageCopy.comparisonTitle}</h5>
                        <p className="text-muted mb-0">{catalog.pageCopy.comparisonSubtitle}</p>
                      </div>
                    </div>

                    {!budgetIsBelowOriginal ? (
                      <div className="custom-order-form-ready-card">
                        <div className="custom-order-v4-ready-copy">
                          <h6 className="fw-bold mb-1">Your budget already covers the original concept.</h6>
                          <p className="text-muted mb-0">You can keep the original design or still send it for review.</p>
                          {originalPreview?.url ? (
                            <div className="custom-order-v4-ready-preview">
                              <img src={originalPreview.url} alt={originalPreview.alt || selectedDesign.title} className="custom-order-v4-ready-preview__image" />
                              <div>
                                <div className="fw-semibold">{originalPreview.label || 'Original preview'}</div>
                                <div className="small text-muted">{originalPreview.caption || selectedDesign.notes || selectedDesign.roughDescription}</div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <button type="button" className={`btn btn-sm rounded-pill px-4 ${effectiveSelectedAlternativeId === 'original' ? 'btn-pink text-white' : 'btn-outline-secondary'}`} onClick={() => setFormData((current) => ({ ...current, selectedAlternativeId: 'original' }))}>
                          Keep original design
                        </button>
                      </div>
                    ) : (
                      <div className="custom-order-form-alternative-grid">
                        {estimateResult.alternatives.map((alternative) => (
                          <button key={alternative.id} type="button" className={`custom-order-form-alt-card ${effectiveSelectedAlternativeId === alternative.id ? 'is-active' : ''}`} onClick={() => setFormData((current) => ({ ...current, selectedAlternativeId: alternative.id }))}>
                            {alternative.preview?.url ? (
                              <div className="custom-order-v4-alt-preview">
                                <img src={alternative.preview.url} alt={alternative.preview.alt || alternative.label} className="custom-order-v4-alt-preview__image" />
                                <div className="custom-order-v4-alt-preview__caption">
                                  <strong>{alternative.preview.label || alternative.label}</strong>
                                  <span>{alternative.preview.caption || alternative.summary}</span>
                                </div>
                              </div>
                            ) : null}
                            <div className="custom-order-form-alt-card__header">
                              <div>
                                <div className="custom-order-form-pill">{alternative.label}</div>
                                <h6 className="fw-bold mt-2 mb-1">{alternative.summary}</h6>
                              </div>
                              <div className={`custom-order-form-pill ${alternative.withinBudget ? 'success' : 'warning'}`}>{alternative.withinBudget ? 'Within budget' : 'Closest available'}</div>
                            </div>
                            <div className="custom-order-form-alt-card__price-row"><span>Estimated price</span><strong>{formatCustomOrderV4Currency(alternative.estimatedPrice)}</strong></div>
                            <div className="custom-order-form-alt-card__price-row"><span>Savings from original</span><strong>{formatCustomOrderV4Currency(alternative.savings)}</strong></div>
                            <div className="custom-order-form-alt-card__changes">
                              <div className="fw-semibold mb-2">What changed from the original</div>
                              <ul>
                                {alternative.changes.map((change) => <li key={change.key}>{change.explanation}</li>)}
                              </ul>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {budgetIsBelowOriginal && budgetValue < estimateResult.minimumAchievablePrice ? (
                      <div className="custom-order-form-alert warning mt-3">
                        <i className="fas fa-triangle-exclamation"></i>
                        <span>Your budget is below the lightest suggestion for this concept. The closest workable version starts around {formatCustomOrderV4Currency(estimateResult.minimumAchievablePrice)}.</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="row g-4">
                    <div className="col-lg-6">
                      <label className="form-label fw-semibold d-block">Inspiration Photo (Optional)</label>
                      <span className="text-muted small d-block mb-3">Upload a reference photo if you want us to compare it with the selected concept.</span>
                      {formData.inspirationImageBase64 ? (
                        <div className="position-relative d-inline-block">
                          <img src={formData.inspirationImageBase64} alt="Inspiration Preview" className="rounded-3 border shadow-sm" style={{ maxHeight: '220px', maxWidth: '100%', objectFit: 'cover' }} />
                          <button type="button" className="btn btn-sm btn-danger position-absolute top-0 end-0 m-2 rounded-circle" onClick={() => setFormData((current) => ({ ...current, inspirationImageBase64: null }))} style={{ width: '32px', height: '32px', padding: 0 }}>
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      ) : (
                        <div className="p-5 text-center bg-light rounded-4 border custom-order-form-upload" onClick={() => fileInputRef.current?.click()}>
                          <i className="fas fa-cloud-upload-alt fs-1 text-muted mb-3"></i>
                          <p className="mb-0 fw-semibold">Click to upload image</p>
                          <input type="file" className="d-none" ref={fileInputRef} onChange={handleFileChange} accept=".jpg,.jpeg,.png" />
                        </div>
                      )}
                      {fileSizeError ? <p className="text-danger small mt-2"><i className="fas fa-exclamation-circle me-1"></i>{fileSizeError}</p> : null}
                    </div>

                    <div className="col-lg-6">
                      <div className="custom-order-form-note">
                        <strong>Customer output included in this request:</strong>
                        <div className="mt-2">
                          Original target design, estimated original price, your entered budget, suggested adjusted versions, and the explanation of what changed from the original.
                          {' Visual previews of the original and cheaper alternatives are included too.'}
                        </div>
                        <div className="mt-2 small text-muted">{pageConfig.directOrderNote}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 text-center">
                    <button type="submit" className="btn btn-pink rounded-pill px-5 py-3 fw-bold fs-5 shadow-sm text-white" style={{ minWidth: '250px' }} disabled={!!dateError || !!timeError}>
                      Review Request <i className="fas fa-arrow-right ms-2"></i>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showConfirmModal ? (
        <div className="modal-overlay" style={{ zIndex: 1060 }} onClick={(event) => { if (event.target === event.currentTarget) setShowConfirmModal(false); }}>
          <div className="modal-content-custom bg-white p-4" style={{ maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="text-center mb-4">
              <h3 className="fw-bold font-playfair">Confirm Your {pageConfig.serviceName} Request</h3>
              <p className="text-muted">Please verify your details before adding this request to your cart.</p>
            </div>

            <div className="bg-light rounded p-3 mb-4 small">
              <div className="d-flex justify-content-between mb-2"><span className="text-muted">Your Name:</span><span className="fw-semibold text-end">{formData.customerName}</span></div>
              <div className="d-flex justify-content-between mb-2"><span className="text-muted">Email:</span><span className="fw-semibold text-end">{formData.email}</span></div>
              <div className="d-flex justify-content-between mb-2"><span className="text-muted">Contact:</span><span className="fw-semibold text-end">{formData.contactNumber}</span></div>
              <div className="d-flex justify-content-between mb-2"><span className="text-muted">Recipient:</span><span className="fw-semibold text-end">{formData.recipientName}</span></div>
              <hr className="my-2" />
              <div className="d-flex justify-content-between mb-2"><span className="text-muted">Occasion:</span><span className="fw-semibold text-end">{occasionLabel}</span></div>
              <div className="d-flex justify-content-between mb-2"><span className="text-muted">Venue:</span><span className="fw-semibold text-end" style={{ maxWidth: '60%' }}>{formData.venue}</span></div>
              <div className="d-flex justify-content-between mb-2"><span className="text-muted">Date Needed:</span><span className="fw-semibold text-end">{formData.eventDate}</span></div>
              {formData.eventTime ? <div className="d-flex justify-content-between mb-2"><span className="text-muted">Preferred Time:</span><span className="fw-semibold text-end">{formData.eventTime}</span></div> : null}
              <hr className="my-2" />
              <div className="d-flex justify-content-between mb-2"><span className="text-muted">Original target design:</span><span className="fw-semibold text-end">{selectedDesign.title}</span></div>
              <div className="d-flex justify-content-between mb-2"><span className="text-muted">Estimated original price:</span><span className="fw-semibold text-end">{formatCustomOrderV4Currency(estimateResult.originalDesign.estimatedPrice)}</span></div>
              <div className="d-flex justify-content-between mb-2"><span className="text-muted">Your budget:</span><span className="fw-semibold text-end">{formatCustomOrderV4Currency(budgetValue)}</span></div>
              <div className="d-flex justify-content-between mb-2"><span className="text-muted">Preferred version:</span><span className="fw-semibold text-end">{selectedAlternative?.label || 'Original target design'}</span></div>
              <div className="d-flex justify-content-between mb-2"><span className="text-muted">Selected estimate:</span><span className="fw-semibold text-end">{formatCustomOrderV4Currency(selectedEstimate.estimatedPrice)}</span></div>
              <div className="mb-2">
                <span className="text-muted d-block mb-1">Rough arrangement description:</span>
                <span className="fw-semibold" style={{ whiteSpace: 'pre-line' }}>{formData.specialInstructions}</span>
              </div>
              {selectedAlternative?.changes?.length ? (
                <div className="mb-2">
                  <span className="text-muted d-block mb-1">What changed from the original:</span>
                  <ul className="mb-0 ps-3">
                    {selectedAlternative.changes.map((change) => <li key={change.key} className="mb-1">{change.explanation}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="d-flex gap-3">
              <button className="btn btn-light flex-grow-1 py-2 fw-semibold" onClick={() => setShowConfirmModal(false)}>Edit Details</button>
              <button className="btn btn-pink flex-grow-1 py-2 fw-semibold shadow-sm" onClick={handleSubmit}>Add to Cart</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CustomOrderV4Form;

