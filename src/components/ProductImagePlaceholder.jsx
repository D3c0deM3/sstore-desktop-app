import React from "react";

const ProductImagePlaceholder = ({ className = "", label = "Rasm yo'q", style }) => (
  <div
    className={`product-image-placeholder-icon ${className}`.trim()}
    aria-label={label}
    style={style}
  >
    <svg viewBox="0 0 48 48" role="img" aria-hidden="true">
      <rect x="7" y="9" width="34" height="30" rx="5" />
      <circle cx="18" cy="19" r="4" />
      <path d="M12 34l9-10 7 7 5-5 5 8" />
    </svg>
  </div>
);

export default ProductImagePlaceholder;
