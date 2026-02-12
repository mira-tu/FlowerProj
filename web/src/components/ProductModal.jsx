import React, { useState } from 'react';

const ProductModal = ({ product, onClose, onAddToCart }) => {
  const [quantity, setQuantity] = useState(1);

  if (!product) {
    return null;
  }

  const increase = () => setQuantity((prev) => prev + 1);
  const decrease = () => setQuantity((prev) => (prev > 1 ? prev - 1 : 1));

  const handleAdd = () => {
    for (let i = 0; i < quantity; i += 1) {
      onAddToCart(product);
    }
    onClose();
    setQuantity(1);
  };

  return (
    <div className="product-modal-overlay" onClick={onClose}>
      <div className="product-modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="product-modal-close" onClick={onClose}>×</button>
        <img src={product.image_url} alt={product.name} className="product-modal-image" />
        <h4>{product.name}</h4>
        <p className="product-price">₱{product.price?.toLocaleString()}</p>
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
