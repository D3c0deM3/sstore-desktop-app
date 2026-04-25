import React, { useState } from "react";
import "../styles/DebtorDetailsDrawer.css";

const DebtorDetailsDrawer = ({
  open,
  loading,
  error,
  data,
  onClose,
  onCompleteDebt,
  onPartialPayment,
  debtLoading = {},
}) => {
  const [payment, setPayment] = useState({ amount: "", method: "cash", note: "" });
  const submitPayment = (event) => {
    event.preventDefault();
    if (!payment.amount || !data?.debtor?.id || !onPartialPayment) return;
    onPartialPayment(data.debtor.id, payment).then(() =>
      setPayment({ amount: "", method: "cash", note: "" })
    );
  };

  return (
    <div
      className={`debtor-details-drawer${open ? " open" : ""}`}
      style={{
        right: open ? 0 : "-480px",
        transition: "right 0.35s cubic-bezier(.4,0,.2,1)",
        zIndex: 1002,
      }}
      tabIndex={-1}
      aria-modal="true"
      role="dialog"
    >
      <button
        className="drawer-close-btn"
        onClick={onClose}
        aria-label="Yopish"
      >
        <span style={{ fontSize: 24, fontWeight: 700 }}>&times;</span>
      </button>
      {loading ? (
        <div className="drawer-loading">Yuklanmoqda...</div>
      ) : error ? (
        <div className="drawer-error">{error}</div>
      ) : data ? (
        <div className="drawer-content">
          <div className="drawer-header">
            <div className="drawer-title-section">
              <h2 className="drawer-product-name">{data.debtor.name}</h2>
              <div className="drawer-product-meta">
                <span>Telefon: {data.debtor.phone}</span>
                <span>
                  Qarz: {Number(data.debtor.price).toLocaleString()} UZS
                </span>
                <span>
                  Sana: {new Date(data.debtor.date).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
          <div className="drawer-debts-list">
            <h3>Qisman to'lov</h3>
            <form
              onSubmit={submitPayment}
              style={{ display: "grid", gap: 8, marginBottom: 18 }}
            >
              <input
                type="number"
                min="0"
                placeholder="To'lov summasi"
                value={payment.amount}
                onChange={(event) =>
                  setPayment((prev) => ({ ...prev, amount: event.target.value }))
                }
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              />
              <select
                value={payment.method}
                onChange={(event) =>
                  setPayment((prev) => ({ ...prev, method: event.target.value }))
                }
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <option value="cash">Naqd</option>
                <option value="card">Karta</option>
                <option value="transfer">O'tkazma</option>
              </select>
              <input
                placeholder="Izoh"
                value={payment.note}
                onChange={(event) =>
                  setPayment((prev) => ({ ...prev, note: event.target.value }))
                }
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              />
              <button className="drawer-complete-btn" type="submit">
                To'lovni saqlash
              </button>
            </form>

            <h3>Qarzdorliklar</h3>
            {data.debts.length === 0 ? (
              <div className="drawer-empty">Qarzdorliklar topilmadi.</div>
            ) : (
              data.debts.map((debt) => (
                <div className="drawer-debt-item" key={debt.id}>
                  <div className="drawer-debt-info">
                    <span className="drawer-debt-product">
                      {debt.product_name}
                    </span>
                    <span className="drawer-debt-qty">x{debt.quantity}</span>
                    <span className="drawer-debt-price">
                      {Number(debt.price).toLocaleString()} UZS
                    </span>
                    <span className="drawer-debt-date">
                      {new Date(debt.date).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    className="drawer-complete-btn"
                    onClick={() => onCompleteDebt(debt.id)}
                    disabled={debtLoading[debt.id]}
                  >
                    {debtLoading[debt.id] ? (
                      <span className="drawer-btn-spinner" />
                    ) : (
                      "Qarz yopildi"
                    )}
                  </button>
                </div>
              ))
            )}
            <h3 style={{ marginTop: 18 }}>To'lov tarixi</h3>
            {!Array.isArray(data.payments) || data.payments.length === 0 ? (
              <div className="drawer-empty">To'lovlar hali yo'q.</div>
            ) : (
              data.payments.map((payment) => (
                <div className="drawer-debt-item" key={payment.id}>
                  <div className="drawer-debt-info">
                    <span className="drawer-debt-product">
                      {Number(payment.amount).toLocaleString()} UZS
                    </span>
                    <span className="drawer-debt-qty">{payment.method}</span>
                    <span className="drawer-debt-date">
                      {new Date(payment.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DebtorDetailsDrawer;
