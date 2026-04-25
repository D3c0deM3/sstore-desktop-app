import React, { useRef, useState } from "react";
import { resolveMediaUrl } from "../utils/imageSource";

const EditProductModal = ({
  show,
  loading,
  error,
  form,
  categories,
  onFieldChange,
  onSave,
  onCancel,
  apiBaseUrl, // pass this prop from ProductsPage
}) => {
  const [imageError, setImageError] = useState("");
  const fileInputRef = useRef();

  const handleBrowse = (e) => {
    const file = e.target.files[0];
    if (file) {
      console.log("[EditProductModal] User selected file:", file);
      onFieldChange("localImage", URL.createObjectURL(file));
      onFieldChange("localImageFile", file);
      setImageError("");
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) {
      console.log("[EditProductModal] User dropped file:", file);
      onFieldChange("localImage", URL.createObjectURL(file));
      onFieldChange("localImageFile", file);
      setImageError("");
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (!show) return null;
  const existingImageSrc = resolveMediaUrl(form?.image_url || form?.image);

  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.32)",
        zIndex: 1300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="modal edit-modal"
        style={{
          background: "var(--color-bg-secondary)",
          borderRadius: 20,
          boxShadow: "0 12px 48px rgba(0,0,0,0.22)",
          padding: "48px 40px 36px 40px",
          minWidth: 600,
          maxWidth: "98vw",
          width: 700,
          textAlign: "center",
          fontFamily: "Inter, Segoe UI, Arial, sans-serif",
          position: "relative",
          transition: "box-shadow 0.2s",
          color: "#fff",
        }}
      >
        <h2
          style={{
            fontSize: 26,
            fontWeight: 700,
            marginBottom: 32,
            color: "var(--modal-label-color, #fff)",
          }}
        >
          Mahsulotni tahrirlash
        </h2>
        {loading && (
          <div
            className="loading-spinner"
            style={{ marginBottom: 18, fontSize: 18, color: "#fff" }}
          >
            Loading...
          </div>
        )}
        {error && (
          <div
            className="error-message"
            style={{
              marginBottom: 18,
              color: "#ffb3b3",
              fontWeight: 500,
              fontSize: 16,
            }}
          >
            {error}
          </div>
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 32,
            alignItems: "flex-start",
            justifyContent: "center",
            marginBottom: 10,
          }}
        >
          {/* Left: Image upload */}
          <div style={{ flex: 1, minWidth: 180, maxWidth: 240 }}>
            <label
              style={{
                fontWeight: 600,
                fontSize: 15,
                marginBottom: 6,
                display: "block",
                textAlign: "left",
                color: "var(--modal-label-color, #fff)",
              }}
            >
              Rasm (ixtiyoriy)
            </label>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              style={{
                border: "2px dashed #bdbdbd",
                borderRadius: 10,
                padding: 14,
                textAlign: "center",
                background: "#fafbfc",
                cursor: "pointer",
                position: "relative",
                marginBottom: 8,
                minHeight: 180,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: 200,
                overflow: "hidden",
              }}
              onClick={() => fileInputRef.current.click()}
            >
              {form.localImage ? (
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: 160,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <img
                    src={form.localImage}
                    alt="Yangi rasm"
                    style={{
                      maxWidth: "100%",
                      maxHeight: 160,
                      borderRadius: 8,
                      marginBottom: 8,
                      objectFit: "contain",
                      background: "#fff",
                      width: "100%",
                      height: "100%",
                      display: "block",
                    }}
                  />
                  <div
                    className="image-hover-overlay"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      background: "rgba(0,0,0,0.32)",
                      opacity: 0,
                      transition: "opacity 0.2s",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current.click();
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = 1;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = 0;
                    }}
                  >
                    <svg
                      width="44"
                      height="44"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        background: "rgba(0,0,0,0.32)",
                        borderRadius: "50%",
                        padding: 8,
                      }}
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19.5 3 21l1.5-4L16.5 3.5z" />
                    </svg>
                  </div>
                </div>
              ) : existingImageSrc ? (
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: 160,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <img
                    src={existingImageSrc}
                    alt="Yuklangan rasm"
                    style={{
                      maxWidth: "100%",
                      maxHeight: 160,
                      borderRadius: 8,
                      marginBottom: 8,
                      objectFit: "contain",
                      background: "#fff",
                      width: "100%",
                      height: "100%",
                      display: "block",
                    }}
                  />
                  <div
                    className="image-hover-overlay"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      background: "rgba(0,0,0,0.32)",
                      opacity: 0,
                      transition: "opacity 0.2s",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current.click();
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = 1;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = 0;
                    }}
                  >
                    <svg
                      width="44"
                      height="44"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        background: "rgba(0,0,0,0.32)",
                        borderRadius: "50%",
                        padding: 8,
                      }}
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19.5 3 21l1.5-4L16.5 3.5z" />
                    </svg>
                  </div>
                </div>
              ) : (
                <>
                  <span
                    style={{
                      fontSize: 28,
                      color: "#bdbdbd",
                      marginBottom: 6,
                    }}
                  >
                    <svg width="32" height="32" fill="none" viewBox="0 0 36 36">
                      <rect
                        x="6"
                        y="6"
                        width="24"
                        height="24"
                        rx="4"
                        fill="#f5f6fa"
                        stroke="#bdbdbd"
                        strokeWidth="2"
                      />
                      <path
                        d="M12 24l4.5-6 4.5 6 6-8"
                        stroke="#bdbdbd"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <div
                    style={{
                      color: "#888",
                      fontSize: 14,
                      marginBottom: 4,
                    }}
                  >
                    Mahsulot rasmini bu yerga torting yoki
                  </div>
                  <button
                    type="button"
                    style={{
                      background: "#e3e6ee",
                      color: "#222",
                      border: "none",
                      borderRadius: 6,
                      padding: "5px 14px",
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: "pointer",
                      marginTop: 4,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current.click();
                    }}
                  >
                    Faylni tanlash
                  </button>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleBrowse}
              />
              {imageError && (
                <div
                  style={{
                    color: "#e53e3e",
                    fontSize: 13,
                    marginTop: 4,
                  }}
                >
                  {imageError}
                </div>
              )}
            </div>
            {((form?.localImage && form?.localImage !== "") ||
              form?.localImageFile ||
              existingImageSrc) && (
              <button
                type="button"
                style={{
                  background: "#f2f2f2",
                  color: "#e53e3e",
                  border: "none",
                  borderRadius: 6,
                  padding: "3px 10px",
                  fontWeight: 500,
                  fontSize: 13,
                  cursor: "pointer",
                  marginBottom: 6,
                }}
                onClick={() => {
                  onFieldChange("localImage", "");
                  onFieldChange("localImageFile", null);
                  onFieldChange("image_url", "");
                }}
              >
                Rasmni olib tashlash
              </button>
            )}
          </div>
          {/* Right: Input fields */}
          <div style={{ flex: 2 }}>
            <div
              className="edit-form"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 22,
                marginBottom: 18,
              }}
            >
              <div className="form-group" style={{ textAlign: "left" }}>
                <label
                  style={{
                    fontWeight: 600,
                    fontSize: 15,
                    marginBottom: 6,
                    display: "block",
                    color: "var(--modal-label-color, #fff)",
                  }}
                >
                  Mahsulot nomi
                </label>
                <input
                  type="text"
                  value={form?.name || ""}
                  onChange={(e) => onFieldChange("name", e.target.value)}
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1.5px solid #e0e0e0",
                    fontSize: 16,
                    background: "var(--modal-input-bg, #fff)",
                    color: "#222",
                    outline: "none",
                    transition: "border 0.18s",
                    marginTop: 2,
                  }}
                />
              </div>
              <div className="form-group" style={{ textAlign: "left" }}>
                <label
                  style={{
                    fontWeight: 600,
                    fontSize: 15,
                    marginBottom: 6,
                    display: "block",
                    color: "var(--modal-label-color, #fff)",
                  }}
                >
                  Kategoriya
                </label>
                <select
                  value={form?.category_id || ""}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const selectedCategory = categories.find(
                      (c) => String(c.id) === selectedId
                    );
                    onFieldChange("category_id", selectedId);
                    if (selectedCategory) {
                      onFieldChange("category_name", selectedCategory.name);
                    }
                  }}
                  disabled={loading || categories.length === 0}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1.5px solid #e0e0e0",
                    fontSize: 16,
                    background: "var(--modal-input-bg, #fff)",
                    color: "#222",
                    outline: "none",
                    transition: "border 0.18s",
                    marginTop: 2,
                    appearance: "none",
                  }}
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={String(cat.id)}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ textAlign: "left" }}>
                <label
                  style={{
                    fontWeight: 600,
                    fontSize: 15,
                    marginBottom: 6,
                    display: "block",
                    color: "var(--modal-label-color, #fff)",
                  }}
                >
                  Qoldiq
                </label>
                <input
                  type="number"
                  value={form?.quantity || ""}
                  onChange={(e) => onFieldChange("quantity", e.target.value)}
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1.5px solid #e0e0e0",
                    fontSize: 16,
                    background: "var(--modal-input-bg, #fff)",
                    color: "#222",
                    outline: "none",
                    transition: "border 0.18s",
                    marginTop: 2,
                    MozAppearance: "textfield",
                  }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  onWheel={(e) => e.target.blur()}
                  onKeyDown={(e) =>
                    (e.key === "ArrowUp" || e.key === "ArrowDown") &&
                    e.preventDefault()
                  }
                />
              </div>
              <div className="form-group" style={{ textAlign: "left" }}>
                <label
                  style={{
                    fontWeight: 600,
                    fontSize: 15,
                    marginBottom: 6,
                    display: "block",
                    color: "var(--modal-label-color, #fff)",
                  }}
                >
                  Narx
                </label>
                <input
                  type="number"
                  value={form?.price_per_quantity || ""}
                  onChange={(e) =>
                    onFieldChange("price_per_quantity", e.target.value)
                  }
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1.5px solid #e0e0e0",
                    fontSize: 16,
                    background: "var(--modal-input-bg, #fff)",
                    color: "#222",
                    outline: "none",
                    transition: "border 0.18s",
                    marginTop: 2,
                    MozAppearance: "textfield",
                  }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  onWheel={(e) => e.target.blur()}
                  onKeyDown={(e) =>
                    (e.key === "ArrowUp" || e.key === "ArrowDown") &&
                    e.preventDefault()
                  }
                />
              </div>
              <div className="form-group" style={{ textAlign: "left" }}>
                <label
                  style={{
                    fontWeight: 600,
                    fontSize: 15,
                    marginBottom: 6,
                    display: "block",
                    color: "var(--modal-label-color, #fff)",
                  }}
                >
                  Miqdor turi
                </label>
                <select
                  value={form?.quantity_type || "kg"}
                  onChange={(e) =>
                    onFieldChange("quantity_type", e.target.value)
                  }
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1.5px solid #e0e0e0",
                    fontSize: 16,
                    background: "var(--modal-input-bg, #fff)",
                    color: "#222",
                    outline: "none",
                    transition: "border 0.18s",
                    marginTop: 2,
                    appearance: "none",
                  }}
                >
                  <option value="kg">kg</option>
                  <option value="dona">dona</option>
                  <option value="metr">metr</option>
                  <option value="litr">litr</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div
          className="modal-actions"
          style={{
            display: "flex",
            gap: 18,
            justifyContent: "center",
            marginTop: 18,
          }}
        >
          <button
            className="save-btn"
            style={{
              background: "#4caf50",
              color: "#fff",
              padding: "12px 32px",
              borderRadius: 10,
              border: "none",
              fontWeight: 700,
              fontSize: 16,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              position: "relative",
              transition: "background 0.18s, opacity 0.18s",
              boxShadow: "0 2px 8px rgba(76,175,80,0.08)",
            }}
            onClick={() =>
              onSave({ ...form, localImageFile: form.localImageFile || null })
            }
            disabled={loading}
          >
            {loading ? (
              <span
                className="btn-spinner"
                style={{
                  display: "inline-block",
                  verticalAlign: "middle",
                  width: 20,
                  height: 20,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 50 50">
                  <circle
                    cx="25"
                    cy="25"
                    r="20"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="5"
                    strokeDasharray="31.4 31.4"
                    strokeLinecap="round"
                  >
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from="0 25 25"
                      to="360 25 25"
                      dur="0.8s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </svg>
              </span>
            ) : (
              "Saqlash"
            )}
          </button>
          <button
            className="cancel-btn"
            style={{
              background: "#f2f2f2",
              color: "#222",
              padding: "12px 32px",
              borderRadius: 10,
              border: "none",
              fontWeight: 600,
              fontSize: 16,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              transition: "background 0.18s, opacity 0.18s",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}
            onClick={onCancel}
            disabled={loading}
          >
            Bekor qilish
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditProductModal;
