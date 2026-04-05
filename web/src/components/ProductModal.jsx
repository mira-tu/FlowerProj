import React, { useState } from 'react';
import { formatProductDiscountLabel } from '../utils/productPricing';
import { getFreeShippingPromoDetails } from '../utils/freeShipping';

const ProductModal = ({ product, onClose, onAddToCart }) => {
  const [quantity, setQuantity] = useState(1);

  if (!product) {
    return null;
  }

  const increase = () => setQuantity((prev) => (product.stock_quantity ? Math.min(prev + 1, product.stock_quantity) : prev + 1));
  const decrease = () => setQuantity((prev) => (prev > 1 ? prev - 1 : 1));

  const handleAdd = () => {
    // onAddToCart receives the product object which already contains stock_quantity.
    for (let i = 0; i < quantity; i += 1) {
      onAddToCart(product);
    }
    onClose();
    setQuantity(1);
  };

  const formatCurrency = (value) => `\u20b1${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const freeShippingPromo = getFreeShippingPromoDetails(product);

  return (
    <div className="product-modal-overlay" onClick={onClose}>
      <div className="product-modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="product-modal-close" onClick={onClose}>×</button>
        <img src={product.image_url} alt={product.name} className="product-modal-image" />
        <h4>{product.name}</h4>
        <div className="product-price-wrap mb-2">
          <p className="product-price mb-1">{formatCurrency(product.price)}</p>
          {product.has_discount ? (
            <div className="product-price-meta">
              <span className="product-original-price">{formatCurrency(product.original_price)}</span>
              <span className="product-inline-discount-badge">{formatProductDiscountLabel(product.discount_percentage)}</span>
            </div>
          ) : null}
        </div>
        {freeShippingPromo.isConfigured ? (
          <div className="product-modal-promo">
            <p className="mb-0">Free delivery from {formatCurrency(freeShippingPromo.minimumOrderAmount)}</p>
          </div>
        ) : null}
        {product.description && <p className="text-muted">{product.description}</p>}

        <div className="d-flex align-items-center gap-2 mb-3 justify-content-center">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={decrease}>-</button>
          <span className="fw-semibold">{quantity}</span>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={increase}>+</button>
        </div>

        <button
          type="button"
          className="btn-add-cart"
          onClick={handleAdd}
          disabled={product.is_active === false}
        >
          {product.is_active === false ? 'Unavailable' : 'Add to Cart'}
        </button>
      </div>
    </div>
  );
};

export default ProductModal;
