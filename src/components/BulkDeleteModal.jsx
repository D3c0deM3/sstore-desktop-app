import React from "react";

const BulkDeleteModal = ({
  show,
  selectedProducts,
  onConfirm,
  onCancel,
  loading,
}) => {
  if (!show) return null;
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
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="modal"
        style={{
          background: "var(--color-bg-secondary)",
          borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          padding: "32px 28px",
          minWidth: 320,
          maxWidth: "90vw",
          textAlign: "center",
        }}
      >
        {selectedProducts.length === 0 ? (
          <>
            <p
              style={{
                fontSize: 18,
                marginBottom: 18,
                color: "#e53e3e",
                fontWeight: 600,
              }}
            >
              O'chirish uchun hech qanday mahsulot tanlanmadi.
            </p>
            <div
              className="modal-actions"
              style={{ display: "flex", gap: 16, justifyContent: "center" }}
            >
              <button
                className="ok-btn"
                style={{
                  background: "#4caf50",
                  color: "#fff",
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "none",
                  fontWeight: 700,
                  fontSize: 16,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  transition: "background 0.18s, opacity 0.18s",
                }}
                onClick={onCancel}
                disabled={loading}
              >
                OK
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 18, marginBottom: 18 }}>
              {selectedProducts.length === 1
                ? `Haqiqatan ham tanlangan bu mahsulotni o‘chirmoqchimisiz?`
                : `Haqiqatan ham tanlangan bu mahsulotlarni o‘chirmoqchimisiz?`}
              <br />
              <span
                style={{
                  display: "block",
                  marginTop: 10,
                  color: "#ffb3b3",
                  fontWeight: 500,
                  fontSize: 15,
                  textAlign: "left",
                  maxHeight: 120,
                  overflowY: "auto",
                  whiteSpace: "pre-line",
                }}
              >
                {selectedProducts.map((p) => `• ${p.name}`).join("\n")}
              </span>
            </p>
            <div
              className="modal-actions"
              style={{ display: "flex", gap: 16, justifyContent: "center" }}
            >
              <button
                className="confirm-btn"
                style={{
                  background: "#e53e3e",
                  color: "#fff",
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "none",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  position: "relative",
                  transition: "background 0.18s, opacity 0.18s",
                }}
                onClick={onConfirm}
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
                  "Ha, o‘chirish"
                )}
              </button>
              <button
                className="cancel-btn"
                style={{
                  background: "#f2f2f2",
                  color: "#222",
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "none",
                  fontWeight: 500,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  transition: "background 0.18s, opacity 0.18s",
                }}
                onClick={onCancel}
                disabled={loading}
              >
                Bekor qilish
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BulkDeleteModal;
