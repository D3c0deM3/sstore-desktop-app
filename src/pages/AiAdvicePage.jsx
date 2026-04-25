import React, { useEffect, useMemo, useState } from "react";
import "../styles/ToolPages.css";

const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || "";

const pickDashboardValue = (dashboardData, key, fallback) => {
  const source = Array.isArray(dashboardData) ? dashboardData : [];
  const item = source.find((entry) => entry[key] !== undefined);
  return item ? item[key] : fallback;
};

const AiAdvicePage = () => {
  const [dashboardData, setDashboardData] = useState([]);
  const [debtors, setDebtors] = useState([]);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem("token");

  useEffect(() => {
    const loadAdviceData = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const [dashboardRes, debtorsRes] = await Promise.all([
          fetch(`${apiBaseUrl}/api/dashboard/`, {
            headers: { Authorization: `Token ${token}` },
          }),
          fetch(`${apiBaseUrl}/api/debtors/`, {
            headers: { Authorization: `Token ${token}` },
          }),
        ]);
        const dashboard = dashboardRes.ok ? await dashboardRes.json() : [];
        const debtorData = debtorsRes.ok ? await debtorsRes.json() : [];
        setDashboardData(Array.isArray(dashboard) ? dashboard : []);
        setDebtors(Array.isArray(debtorData) ? debtorData : []);
      } finally {
        setLoading(false);
      }
    };

    loadAdviceData();
  }, [token]);

  const advice = useMemo(() => {
    const products = pickDashboardValue(dashboardData, "products", []);
    const topProducts = pickDashboardValue(dashboardData, "products_by_sells", []);
    const profit = pickDashboardValue(dashboardData, "profit", []);
    const income = Number(pickDashboardValue(dashboardData, "income", 0));
    const expenses = Number(pickDashboardValue(dashboardData, "expanses_total", 0));
    const lowStock = products.filter((product) => Number(product.quantity) <= 50);
    const totalDebt = debtors.reduce((sum, debtor) => sum + Number(debtor.price || 0), 0);
    const newestProfit = Number(profit.at?.(-1) || 0);
    const previousProfit = Number(profit.length > 1 ? profit[profit.length - 2] : newestProfit);
    const cards = [];

    if (lowStock.length > 0) {
      cards.push({
        title: "Omborni to'ldirish",
        tone: "warning",
        text: `${lowStock.length} ta mahsulot kam qolgan. Avval eng ko'p sotiladigan kam qoldiq mahsulotlarni to'ldiring.`,
      });
    }

    if (expenses > income && expenses > 0) {
      cards.push({
        title: "Xarajat nazorati",
        tone: "danger",
        text: "Bu oy xarajat daromaddan yuqori. Xarajatlarni tur bo'yicha tekshirib, majburiy bo'lmaganlarini kechiktiring.",
      });
    }

    if (totalDebt > 0) {
      cards.push({
        title: "Qarzlarni kuzatish",
        tone: "info",
        text: `Jami qarzdorlik ${totalDebt.toLocaleString()} UZS. Eng eski qarzlarni birinchi yopishni odat qiling.`,
      });
    }

    if (newestProfit < previousProfit) {
      cards.push({
        title: "Foyda pasayishi",
        tone: "danger",
        text: "So'nggi foyda oldingi ko'rsatkichdan past. Chegirma, xarajat va narxlarni qayta tekshiring.",
      });
    }

    if (topProducts.length > 0) {
      cards.push({
        title: "Sotuv imkoniyati",
        tone: "positive",
        text: `${topProducts[0].name} yaxshi sotilyapti. Uni ko'rinarli joyga qo'ying va zaxirasini oldindan rejalang.`,
      });
    }

    if (cards.length === 0) {
      cards.push({
        title: "Holat barqaror",
        tone: "positive",
        text: "Hozircha jiddiy ogohlantirish yo'q. Savdo va qoldiqni har kuni kuzatishda davom eting.",
      });
    }

    return cards;
  }, [dashboardData, debtors]);

  if (loading) return <div className="tool-page-state">Maslahatlar tayyorlanmoqda...</div>;

  return (
    <main className="tool-page">
      <header className="tool-header">
        <div>
          <h1>AI maslahat</h1>
          <p>Offline ishlaydigan, ombor va savdo ma'lumotlariga asoslangan tavsiyalar.</p>
        </div>
      </header>

      <section className="advice-grid">
        {advice.map((item) => (
          <article className={`advice-card ${item.tone}`} key={item.title}>
            <span>{item.title}</span>
            <p>{item.text}</p>
          </article>
        ))}
      </section>

      <section className="tool-panel">
        <h2>Qanday ishlaydi?</h2>
        <p className="tool-muted">
          Bu bo'lim internetga ulanmaydi. U mahsulot qoldig'i, oylik foyda, xarajat
          va qarzlar asosida tezkor qoidaviy tavsiyalar beradi.
        </p>
      </section>
    </main>
  );
};

export default AiAdvicePage;
