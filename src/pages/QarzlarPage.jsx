import React, { useState, useEffect } from "react";
import "../styles/QarzlarPage.css";
import ProfileSection from "../components/ProfileSection";
import { ReactComponent as AccountSvg } from "../assets/dashboard/account.svg";
import DebtorDetailsDrawer from "../components/DebtorDetailsDrawer";

const DebtorProfileCard = ({ debtor, onClick }) => {
  return (
    <div
      className="qarzlar-debtor-row"
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      <div className="qarzlar-debtor-avatar">
        <AccountSvg width={32} height={32} />
      </div>
      <div className="qarzlar-debtor-name">{debtor.name}</div>
      <div className="qarzlar-debtor-phone">{debtor.phone}</div>
      <div className="qarzlar-debtor-date">
        {new Date(debtor.date).toLocaleDateString()}
      </div>
      <div className="qarzlar-debtor-amount">
        {Number(debtor.price).toLocaleString()} UZS
      </div>
    </div>
  );
};

// Professional skeleton for debtor profile cards (Telegram-style)
const DebtorProfileCardSkeleton = () => (
  <div className="qarzlar-debtor-row qarzlar-debtor-card-skeleton">
    <div className="qarzlar-debtor-avatar skeleton-avatar-shimmer" />
    <div
      className="qarzlar-debtor-name skeleton-line-shimmer"
      style={{ width: "80px", height: 16 }}
    />
    <div
      className="qarzlar-debtor-phone skeleton-line-shimmer"
      style={{ width: "60px", height: 12 }}
    />
    <div
      className="qarzlar-debtor-date skeleton-line-shimmer"
      style={{ width: "50px", height: 10 }}
    />
    <div
      className="qarzlar-debtor-amount skeleton-amount-shimmer"
      style={{ width: "60px", height: 16 }}
    />
  </div>
);

const QarzlarPage = () => {
  const [debts, setDebts] = useState([]);
  const [payInput, setPayInput] = useState({});
  const [user, setUser] = useState({});
  const [debtors, setDebtors] = useState([]);
  const [debtorsLoading, setDebtorsLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerData, setDrawerData] = useState(null);
  const [drawerError, setDrawerError] = useState("");
  const [debtLoading, setDebtLoading] = useState({});
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    // Load user from localStorage (set by DashboardLayout)
    const market = JSON.parse(localStorage.getItem("market"));
    if (market) {
      setUser({
        name: market.market_name,
        phone: market.phone_number,
        plan: market.plan,
        profileImage: market.profile_picture,
      });
    }
  }, []);

  const apiBaseUrl =
    process.env.REACT_APP_API_BASE_URL || "";

  useEffect(() => {
    const fetchDebts = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const res = await fetch(`${apiBaseUrl}/api/debts/`, {
          method: "GET",
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },
        });
        const data = await res.json();
        setDebts(Array.isArray(data) ? data : []);
      } catch (err) {
        setDebts([]);
      }
    };
    fetchDebts();
  }, [apiBaseUrl]);

  useEffect(() => {
    const fetchDebtors = async () => {
      setDebtorsLoading(true);
      const token = localStorage.getItem("token");
      if (!token) {
        setDebtorsLoading(false);
        return;
      }
      try {
        const res = await fetch(`${apiBaseUrl}/api/debtors/`, {
          method: "GET",
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },
        });
        const data = await res.json();
        setDebtors(Array.isArray(data) ? data : []);
      } catch (err) {
        setDebtors([]);
      } finally {
        setDebtorsLoading(false);
      }
    };
    fetchDebtors();
  }, [apiBaseUrl]);

  const handlePay = (id, amount) => {
    setDebts((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              paid: Math.min((d.paid || 0) + amount, d.total),
            }
          : d
      )
    );
    setPayInput((prev) => ({ ...prev, [id]: "" }));
  };

  const handleDebtorClick = async (debtorId) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerError("");
    setDrawerData(null);
    const token = localStorage.getItem("token");
    if (!token) {
      setDrawerError("Token not found");
      setDrawerLoading(false);
      return;
    }
    try {
      const res = await fetch(`${apiBaseUrl}/api/debtors/${debtorId}/`, {
        method: "GET",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) throw new Error("Serverdan ma'lumot olinmadi");
      const data = await res.json();
      setDrawerData(data);
    } catch (err) {
      setDrawerError(err.message);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setDrawerData(null);
    setDrawerError("");
  };

  const handleCompleteDebt = async (debtId) => {
    setDebtLoading((prev) => ({ ...prev, [debtId]: true }));
    const token = localStorage.getItem("token");
    if (!token || !drawerData) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/debtors/delete/${debtId}/`, {
        method: "DELETE",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (res.status === 200) {
        const newDebts = Array.isArray(drawerData.debts)
          ? drawerData.debts.filter((d) => d.id !== debtId)
          : [];
        if (newDebts.length === 0) {
          setDebtors((prev) =>
            prev.filter((d) => d.id !== drawerData.debtor.id)
          );
          setDrawerOpen(false);
          setDrawerData(null);
        } else {
          setDrawerData({ ...drawerData, debts: newDebts });
        }
      } else {
        alert("Qarzni o'chirishda xatolik yuz berdi.");
      }
    } catch (err) {
      alert("Qarzni o'chirishda xatolik yuz berdi.");
    } finally {
      setDebtLoading((prev) => ({ ...prev, [debtId]: false }));
    }
  };

  const handlePartialPayment = async (debtorId, payment) => {
    setDebtLoading((prev) => ({ ...prev, [`payment-${debtorId}`]: true }));
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/debtors/payment/`, {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          debtor_id: debtorId,
          amount: Number(payment.amount),
          method: payment.method,
          note: payment.note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "To'lov saqlanmadi");
      const paidAmount = Number(data.amount || payment.amount || 0);
      setDrawerData((prev) => {
        if (!prev) return prev;
        const nextPrice = Math.max(Number(prev.debtor.price || 0) - paidAmount, 0);
        return {
          ...prev,
          debtor: { ...prev.debtor, price: nextPrice },
          payments: [
            {
              id: Date.now(),
              amount: paidAmount,
              method: payment.method,
              note: payment.note,
              created_at: new Date().toISOString(),
            },
            ...(Array.isArray(prev.payments) ? prev.payments : []),
          ],
        };
      });
      setDebtors((prev) =>
        prev
          .map((debtor) =>
            debtor.id === debtorId
              ? { ...debtor, price: Math.max(Number(debtor.price || 0) - paidAmount, 0) }
              : debtor
          )
          .filter((debtor) => Number(debtor.price || 0) > 0)
      );
    } catch (err) {
      alert(err.message || "To'lov saqlanmadi");
    } finally {
      setDebtLoading((prev) => ({ ...prev, [`payment-${debtorId}`]: false }));
    }
  };

  // Filter debtors by name (case-insensitive)
  const filteredDebtors = (Array.isArray(debtors) ? debtors : []).filter(
    (debtor) =>
      debtor.name &&
      debtor.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="qarzlar-page">
      <div className="qarzlar-header-row">
        <div className="qarzlar-search-container">
          <span className="search-icon" />
          <input
            type="text"
            className="qarzlar-searchbar"
            placeholder="Qarzdor nomi bo'yicha qidirish..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <ProfileSection user={user} />
      </div>
      <h2 className="qarzlar-title">Qarzlar Ro'yxati</h2>
      <div className="qarzlar-profile-cards-container qarzlar-profile-cards-centered">
        <div className="qarzlar-debtor-table">
          <div className="qarzlar-debtor-row qarzlar-debtor-header">
            <div className="qarzlar-debtor-avatar" />
            <div className="qarzlar-debtor-name">Ism</div>
            <div className="qarzlar-debtor-phone">Telefon</div>
            <div className="qarzlar-debtor-date">Sana</div>
            <div className="qarzlar-debtor-amount">Qarz</div>
          </div>
          {debtorsLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <DebtorProfileCardSkeleton key={i} />
            ))
          ) : filteredDebtors.length === 0 ? (
            <div className="qarzlar-profile-cards-empty">
              <img
                className="qarzlar-profile-cards-empty-bg"
                src={require("../assets/dashboard/no-account.svg").default}
                alt=""
              />
            </div>
          ) : (
            filteredDebtors.map((debtor) => (
              <DebtorProfileCard
                key={debtor.id}
                debtor={debtor}
                onClick={() => handleDebtorClick(debtor.id)}
              />
            ))
          )}
        </div>
      </div>
      <div className="qarzlar-list">
        {(Array.isArray(debts) ? debts : []).map((debt) => (
          <div className="qarz-card" key={debt.id}>
            <div className="qarz-header">
              <div className="qarz-person">{debt.person}</div>
              <div className="qarz-date">{debt.date}</div>
            </div>
            <div className="qarz-products">
              {debt.products.map((p, idx) => (
                <div className="qarz-product" key={idx}>
                  <span className="qarz-product-name">{p.name}</span>
                  <span className="qarz-product-qty">x{p.quantity}</span>
                  <span className="qarz-product-price">
                    {(p.price * p.quantity).toLocaleString()} UZS
                  </span>
                </div>
              ))}
            </div>
            <div className="qarz-summary">
              <span className="qarz-total">
                Jami: {debt.total.toLocaleString()} UZS
              </span>
              <span className="qarz-paid">
                To'langan: {(debt.paid || 0).toLocaleString()} UZS
              </span>
              <span className="qarz-remaining">
                Qolgan: {(debt.total - (debt.paid || 0)).toLocaleString()} UZS
              </span>
            </div>
            <div className="qarz-actions">
              <input
                type="number"
                min="1"
                max={debt.total - (debt.paid || 0)}
                placeholder="To'lov summasi"
                value={payInput[debt.id] || ""}
                onChange={(e) =>
                  setPayInput((prev) => ({
                    ...prev,
                    [debt.id]: e.target.value,
                  }))
                }
                className="qarz-pay-input"
                disabled={(debt.paid || 0) >= debt.total}
              />
              <button
                className="qarz-pay-btn"
                disabled={
                  (debt.paid || 0) >= debt.total ||
                  !payInput[debt.id] ||
                  Number(payInput[debt.id]) <= 0 ||
                  Number(payInput[debt.id]) > debt.total - (debt.paid || 0)
                }
                onClick={() => handlePay(debt.id, Number(payInput[debt.id]))}
              >
                {(debt.paid || 0) + (Number(payInput[debt.id]) || 0) >=
                debt.total
                  ? "To'liq to'landi"
                  : "To'lash"}
              </button>
            </div>
          </div>
        ))}
      </div>
      <DebtorDetailsDrawer
        open={drawerOpen}
        loading={drawerLoading}
        error={drawerError}
        data={drawerData}
        onClose={handleCloseDrawer}
        onCompleteDebt={handleCompleteDebt}
        onPartialPayment={handlePartialPayment}
        debtLoading={debtLoading}
      />
    </div>
  );
};

export default QarzlarPage;
