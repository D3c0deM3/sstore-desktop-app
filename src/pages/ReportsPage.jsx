import React, { useEffect, useMemo, useState } from "react";
import "../styles/ToolPages.css";

const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || "";

const formatCurrency = (value) =>
  `${Number(value || 0).toLocaleString("uz-UZ")} UZS`;

const formatNumber = (value) => Number(value || 0).toLocaleString("uz-UZ");

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.products)) return value.products;
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((entry) => (Array.isArray(entry) ? entry : []));
  }
  return [];
};

const dateKey = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const shiftDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateKey(date);
};

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("uz-UZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const paymentLabels = {
  cash: "Naqd",
  card: "Karta",
  transfer: "O'tkazma",
  mixed: "Aralash",
  debt: "Qarz",
};

const getProductId = (item) => item.product ?? item.product_id ?? item.id;

const getProductName = (item) =>
  item.product_name || item.name || item.product?.name || `#${getProductId(item) || "-"}`;

const getItemCostMeta = (item, productCostById) => {
  const directCost = Number(
    item.cost_at_sale ??
      item.cost_per_quantity ??
      item.unit_cost ??
      item.cost_price ??
      item.buy_price ??
      item.purchase_cost ??
      item.purchase_price ??
      item.bought_price ??
      0
  );
  const fallbackCost = Number(
    item.current_cost_per_quantity || productCostById.get(Number(getProductId(item))) || 0
  );
  if (directCost > 0) {
    if (fallbackCost > directCost * 10) {
      return { unitCost: fallbackCost, estimated: true };
    }
    return { unitCost: directCost, estimated: Number(item.cost_at_sale || 0) <= 0 };
  }

  if (fallbackCost > 0) return { unitCost: fallbackCost, estimated: true };

  const quantity = Number(item.quantity || 0);
  const totalPrice = Number(item.total_price || 0);
  const estimatedCost = quantity > 0 && totalPrice > 0 ? totalPrice / quantity : 0;
  return { unitCost: estimatedCost, estimated: estimatedCost > 0 };
};

const getSaleMetrics = (sale, productCostById = new Map()) => {
  const items = Array.isArray(sale.items) ? sale.items : [];
  const returns = Array.isArray(sale.returns) ? sale.returns : [];
  let hasEstimatedCost = false;
  const returnedAmount = returns.reduce(
    (total, item) => total + Number(item.amount || 0),
    0
  );
  const costOfGoods = items.reduce((total, item) => {
    const soldQuantity = Number(item.quantity || 0);
    const returnedQuantity = Number(item.returned_quantity || 0);
    const netQuantity = Math.max(soldQuantity - returnedQuantity, 0);
    const costMeta = getItemCostMeta(item, productCostById);
    if (costMeta.estimated) {
      hasEstimatedCost = true;
    }
    return total + netQuantity * costMeta.unitCost;
  }, 0);
  const revenue = Math.max(Number(sale.total || 0) - returnedAmount, 0);
  const grossProfit = Number(sale.total || 0) - costOfGoods;
  const netProfit = revenue - costOfGoods;

  return {
    revenue,
    returnedAmount,
    costOfGoods,
    grossProfit,
    netProfit,
    hasEstimatedCost,
    itemCount: items.reduce(
      (total, item) => total + Number(item.quantity || 0),
      0
    ),
  };
};

const emptyReport = {
  date: "",
  salesCount: 0,
  itemCount: 0,
  revenue: 0,
  returnedAmount: 0,
  costOfGoods: 0,
  grossProfit: 0,
  netProfit: 0,
  hasEstimatedCost: false,
};

const ReportsPage = () => {
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSale, setSelectedSale] = useState(null);

  const loadSales = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setSales([]);
      setProducts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [salesResponse, productsResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/api/sales/`, {
          headers: { Authorization: `Token ${token}` },
        }),
        fetch(`${apiBaseUrl}/api/products/`, {
          headers: { Authorization: `Token ${token}` },
        }),
      ]);
      const salesData = await salesResponse.json().catch(() => []);
      const productsData = await productsResponse.json().catch(() => []);
      if (!salesResponse.ok) {
        throw new Error(salesData.error || "Sotuv hisobotlari olinmadi");
      }
      setSales(Array.isArray(salesData) ? salesData : []);
      setProducts(productsResponse.ok ? asArray(productsData) : []);
    } catch (err) {
      setError(err.message || "Hisobotni yuklashda xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, []);

  const productCostById = useMemo(() => {
    const costs = new Map();
    products.forEach((product) => {
      costs.set(
        Number(product.id),
        Number(
          product.cost_per_quantity ||
            product.cost_price ||
            product.buy_price ||
            product.purchase_cost ||
            product.purchase_price ||
            product.bought_price ||
            0
        )
      );
    });
    return costs;
  }, [products]);

  const reports = useMemo(() => {
    const byDay = new Map();

    sales.forEach((sale) => {
      const key = dateKey(sale.created_at);
      if (!key) return;

      const current = byDay.get(key) || { ...emptyReport, date: key };
      const metrics = getSaleMetrics(sale, productCostById);

      byDay.set(key, {
        date: key,
        salesCount: current.salesCount + 1,
        itemCount: current.itemCount + metrics.itemCount,
        revenue: current.revenue + metrics.revenue,
        returnedAmount: current.returnedAmount + metrics.returnedAmount,
        costOfGoods: current.costOfGoods + metrics.costOfGoods,
        grossProfit: current.grossProfit + metrics.grossProfit,
        netProfit: current.netProfit + metrics.netProfit,
        hasEstimatedCost: current.hasEstimatedCost || metrics.hasEstimatedCost,
      });
    });

    return Array.from(byDay.values()).sort((a, b) =>
      b.date.localeCompare(a.date)
    );
  }, [sales, productCostById]);

  const totals = useMemo(
    () =>
      reports.reduce(
        (total, row) => ({
          ...total,
          salesCount: total.salesCount + row.salesCount,
          itemCount: total.itemCount + row.itemCount,
          revenue: total.revenue + row.revenue,
          returnedAmount: total.returnedAmount + row.returnedAmount,
          costOfGoods: total.costOfGoods + row.costOfGoods,
          grossProfit: total.grossProfit + row.grossProfit,
          netProfit: total.netProfit + row.netProfit,
          hasEstimatedCost: total.hasEstimatedCost || row.hasEstimatedCost,
        }),
        { ...emptyReport }
      ),
    [reports]
  );

  const todayReport =
    reports.find((report) => report.date === shiftDate(0)) || {
      ...emptyReport,
      date: shiftDate(0),
    };
  const yesterdayReport =
    reports.find((report) => report.date === shiftDate(-1)) || {
      ...emptyReport,
      date: shiftDate(-1),
    };

  const salesWithMetrics = useMemo(
    () =>
      [...sales]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map((sale) => ({
          ...sale,
          metrics: getSaleMetrics(sale, productCostById),
        })),
    [sales, productCostById]
  );

  if (loading) {
    return <div className="tool-page-state">Hisobotlar yuklanmoqda...</div>;
  }

  return (
    <main className="tool-page reports-page">
      <header className="tool-header">
        <div>
          <h1>Hisobotlar</h1>
          <p>Kunlik sotuv tarixi, sof foyda va umumiy savdo ko'rsatkichlari.</p>
        </div>
        <button className="tool-primary-button" onClick={loadSales}>
          Yangilash
        </button>
      </header>

      {error && <div className="tool-alert">{error}</div>}

      <section className="tool-metric-grid reports-metric-grid">
        <div className="tool-metric-card positive">
          <span>Bugungi sof foyda</span>
          <strong>{formatCurrency(todayReport.netProfit)}</strong>
        </div>
        <div className="tool-metric-card">
          <span>Bugungi sotuvlar soni</span>
          <strong>{formatNumber(todayReport.salesCount)}</strong>
        </div>
        <div className="tool-metric-card positive">
          <span>Umumiy sof foyda</span>
          <strong>{formatCurrency(totals.netProfit)}</strong>
        </div>
        <div className="tool-metric-card">
          <span>Umumiy sotuv</span>
          <strong>{formatCurrency(totals.revenue)}</strong>
        </div>
      </section>

      <section className="tool-grid two-columns">
        <ReportCard title="Bugun" report={todayReport} />
        <ReportCard title="Kecha" report={yesterdayReport} />
      </section>

      <section className="tool-panel">
        <div className="reports-panel-header">
          <div>
            <h2>Kunlik hisobot</h2>
            <p className="tool-muted">
              Har bir kun bo'yicha sotuv, tannarx, foyda va qaytarilgan summa.
            </p>
          </div>
        </div>
        <div className="tool-table-wrap">
          <table className="tool-table">
            <thead>
              <tr>
                <th>Sana</th>
                <th>Sotuvlar</th>
                <th>Mahsulot soni</th>
                <th>Umumiy sotuv</th>
                <th>Tannarx</th>
                <th>Qaytarilgan</th>
                <th>Total foyda</th>
                <th>Sof foyda</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.date}>
                  <td>{report.date}</td>
                  <td>{formatNumber(report.salesCount)}</td>
                  <td>{formatNumber(report.itemCount)}</td>
                  <td>{formatCurrency(report.revenue)}</td>
                  <td>
                    {report.hasEstimatedCost ? "~" : ""}
                    {formatCurrency(report.costOfGoods)}
                  </td>
                  <td>{formatCurrency(report.returnedAmount)}</td>
                  <td>{formatCurrency(report.grossProfit)}</td>
                  <td className={report.netProfit >= 0 ? "positive-text" : "danger-text"}>
                    {formatCurrency(report.netProfit)}
                  </td>
                </tr>
              ))}
              {reports.length === 0 && (
                <tr>
                  <td colSpan="8" className="tool-empty-cell">
                    Hali sotuv tarixi yo'q.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tool-panel reports-history-panel">
        <div className="reports-panel-header">
          <div>
            <h2>Sotuv tarixi</h2>
            <p className="tool-muted">
              Oxirgi cheklarning umumiy summasi, to'lov turi va foydasi.
            </p>
          </div>
        </div>
        <div className="tool-table-wrap">
          <table className="tool-table">
            <thead>
              <tr>
                <th>Chek</th>
                <th>Sana</th>
                <th>To'lov</th>
                <th>Mahsulot soni</th>
                <th>Sotuv</th>
                <th>Sof foyda</th>
              </tr>
            </thead>
            <tbody>
              {salesWithMetrics.map((sale) => (
                <tr
                  key={sale.id}
                  className="pressable-table-row"
                  tabIndex="0"
                  role="button"
                  onClick={() => setSelectedSale(sale)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedSale(sale);
                    }
                  }}
                >
                  <td>#{sale.receipt_number}</td>
                  <td>{formatDateTime(sale.created_at)}</td>
                  <td>
                    <span className={`payment-badge ${sale.payment_method || "cash"}`}>
                      {paymentLabels[sale.payment_method] || sale.payment_method || "-"}
                    </span>
                  </td>
                  <td>{formatNumber(sale.metrics.itemCount)}</td>
                  <td>{formatCurrency(sale.metrics.revenue)}</td>
                  <td className={sale.metrics.netProfit >= 0 ? "positive-text" : "danger-text"}>
                    {formatCurrency(sale.metrics.netProfit)}
                  </td>
                </tr>
              ))}
              {salesWithMetrics.length === 0 && (
                <tr>
                  <td colSpan="6" className="tool-empty-cell">
                    Hali sotuv tarixi yo'q.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedSale && (
        <SaleDetailsDrawer
          sale={selectedSale}
          productCostById={productCostById}
          onClose={() => setSelectedSale(null)}
        />
      )}
    </main>
  );
};

const SaleDetailsDrawer = ({ sale, productCostById, onClose }) => {
  const items = Array.isArray(sale.items) ? sale.items : [];
  const payments = Array.isArray(sale.payments) ? sale.payments : [];
  const returns = Array.isArray(sale.returns) ? sale.returns : [];

  return (
    <div className="report-drawer-overlay" onMouseDown={onClose}>
      <aside
        className="report-drawer"
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="Sotuv tafsilotlari"
      >
        <div className="report-drawer-header">
          <div>
            <span>Chek</span>
            <h2>#{sale.receipt_number}</h2>
            <p>{formatDateTime(sale.created_at)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Yopish">
            X
          </button>
        </div>

        <div className="report-drawer-summary">
          <div>
            <span>To'lov</span>
            <strong>
              <span className={`payment-badge ${sale.payment_method || "cash"}`}>
                {paymentLabels[sale.payment_method] || sale.payment_method || "-"}
              </span>
            </strong>
          </div>
          <div>
            <span>Jami sotuv</span>
            <strong>{formatCurrency(sale.metrics.revenue)}</strong>
          </div>
          <div>
            <span>Tannarx</span>
            <strong>
              {sale.metrics.hasEstimatedCost ? "~" : ""}
              {formatCurrency(sale.metrics.costOfGoods)}
            </strong>
          </div>
          <div>
            <span>Sof foyda</span>
            <strong className={sale.metrics.netProfit >= 0 ? "positive-text" : "danger-text"}>
              {formatCurrency(sale.metrics.netProfit)}
            </strong>
          </div>
        </div>

        <section className="report-drawer-section">
          <h3>Mahsulotlar</h3>
          <div className="report-drawer-items">
            {items.map((item) => {
              const quantity = Number(item.quantity || 0);
              const returnedQuantity = Number(item.returned_quantity || 0);
              const netQuantity = Math.max(quantity - returnedQuantity, 0);
              const costMeta = getItemCostMeta(item, productCostById);
              const totalCost = costMeta.unitCost * netQuantity;
              const totalPrice = Number(item.total_price || 0);
              const profit = totalPrice - totalCost;

              return (
                <div className="report-drawer-item" key={item.id || `${getProductId(item)}-${getProductName(item)}`}>
                  <div className="report-drawer-item-main">
                    <strong>{getProductName(item)}</strong>
                    <span>
                      {formatNumber(quantity)} x {formatCurrency(item.unit_price)}
                    </span>
                  </div>
                  <div className="report-drawer-item-grid">
                    <span>Chegirma: {formatCurrency(item.discount)}</span>
                    <span>Sotuv: {formatCurrency(totalPrice)}</span>
                    <span>
                      Tannarx: {costMeta.estimated ? "~" : ""}
                      {formatCurrency(totalCost)}
                    </span>
                    <span className={profit >= 0 ? "positive-text" : "danger-text"}>
                      Foyda: {formatCurrency(profit)}
                    </span>
                  </div>
                  {returnedQuantity > 0 && (
                    <div className="report-drawer-note">
                      Qaytarilgan: {formatNumber(returnedQuantity)}
                    </div>
                  )}
                </div>
              );
            })}
            {items.length === 0 && <div className="tool-empty">Mahsulotlar topilmadi.</div>}
          </div>
        </section>

        <section className="report-drawer-section">
          <h3>To'lov va yakun</h3>
          <div className="report-drawer-totals">
            <div>
              <span>Subtotal</span>
              <strong>{formatCurrency(sale.subtotal)}</strong>
            </div>
            <div>
              <span>Chegirma</span>
              <strong>{formatCurrency(sale.discount)}</strong>
            </div>
            <div>
              <span>To'landi</span>
              <strong>{formatCurrency(sale.paid_amount)}</strong>
            </div>
            <div>
              <span>Qaytarilgan</span>
              <strong>{formatCurrency(sale.metrics.returnedAmount)}</strong>
            </div>
          </div>
          {payments.length > 0 && (
            <div className="report-drawer-payment-list">
              {payments.map((payment, index) => (
                <div key={payment.id || index}>
                  <span>{paymentLabels[payment.method] || payment.method}</span>
                  <strong>{formatCurrency(payment.amount)}</strong>
                </div>
              ))}
            </div>
          )}
          {returns.length > 0 && (
            <div className="report-drawer-note">
              Qaytarishlar soni: {formatNumber(returns.length)}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
};

const ReportCard = ({ title, report }) => (
  <div className="tool-panel report-card">
    <div className="reports-panel-header">
      <div>
        <h2>{title}</h2>
        <p className="tool-muted">{report.date}</p>
      </div>
      <strong className={report.netProfit >= 0 ? "positive-text" : "danger-text"}>
        {formatCurrency(report.netProfit)}
      </strong>
    </div>
    <div className="report-card-grid">
      <div>
        <span>Sotuvlar soni</span>
        <strong>{formatNumber(report.salesCount)}</strong>
      </div>
      <div>
        <span>Umumiy sotuv</span>
        <strong>{formatCurrency(report.revenue)}</strong>
      </div>
      <div>
        <span>Total foyda</span>
        <strong>{formatCurrency(report.grossProfit)}</strong>
      </div>
      <div>
        <span>Qaytarilgan</span>
        <strong>{formatCurrency(report.returnedAmount)}</strong>
      </div>
    </div>
  </div>
);

export default ReportsPage;
