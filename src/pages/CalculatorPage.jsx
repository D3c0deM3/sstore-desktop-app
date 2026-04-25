import React, { useMemo, useState } from "react";
import "../styles/ToolPages.css";

const formatCurrency = (value) => `${Number(value || 0).toLocaleString()} UZS`;

const CalculatorPage = () => {
  const [values, setValues] = useState({
    buyPrice: "",
    sellPrice: "",
    quantity: "1",
    discount: "",
  });

  const result = useMemo(() => {
    const buyPrice = Number(values.buyPrice || 0);
    const sellPrice = Number(values.sellPrice || 0);
    const quantity = Number(values.quantity || 0);
    const discount = Number(values.discount || 0);
    const grossRevenue = sellPrice * quantity;
    const discountAmount = grossRevenue * (discount / 100);
    const revenue = grossRevenue - discountAmount;
    const cost = buyPrice * quantity;
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    return { revenue, cost, discountAmount, profit, margin };
  }, [values]);

  const update = (key, value) => setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <main className="tool-page">
      <header className="tool-header">
        <div>
          <h1>Kalkulyator</h1>
          <p>Sotuv narxi, foyda va chegirmani tez hisoblash uchun.</p>
        </div>
      </header>

      <section className="tool-grid two-columns">
        <div className="tool-panel">
          <h2>Hisoblash</h2>
          <div className="tool-form stacked">
            <label>
              Kelish narxi
              <input
                type="number"
                min="0"
                value={values.buyPrice}
                onChange={(event) => update("buyPrice", event.target.value)}
              />
            </label>
            <label>
              Sotish narxi
              <input
                type="number"
                min="0"
                value={values.sellPrice}
                onChange={(event) => update("sellPrice", event.target.value)}
              />
            </label>
            <label>
              Miqdor
              <input
                type="number"
                min="1"
                value={values.quantity}
                onChange={(event) => update("quantity", event.target.value)}
              />
            </label>
            <label>
              Chegirma foizi
              <input
                type="number"
                min="0"
                max="100"
                value={values.discount}
                onChange={(event) => update("discount", event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="tool-panel calculator-result">
          <h2>Natija</h2>
          <div className="tool-list">
            <div className="tool-list-row">
              <span>Tushum</span>
              <strong>{formatCurrency(result.revenue)}</strong>
            </div>
            <div className="tool-list-row">
              <span>Tannarx</span>
              <strong>{formatCurrency(result.cost)}</strong>
            </div>
            <div className="tool-list-row">
              <span>Chegirma</span>
              <strong>{formatCurrency(result.discountAmount)}</strong>
            </div>
            <div className="tool-list-row total">
              <span>Foyda</span>
              <strong>{formatCurrency(result.profit)}</strong>
            </div>
            <div className="tool-list-row">
              <span>Marja</span>
              <strong>{result.margin.toFixed(1)}%</strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default CalculatorPage;
