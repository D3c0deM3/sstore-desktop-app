import React, { useEffect, useMemo, useState } from "react";
import "../styles/ToolPages.css";

const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || "";

const formatCurrency = (value) => `${Number(value || 0).toLocaleString()} UZS`;

const pickDashboardValue = (dashboardData, key, fallback) => {
  const source = Array.isArray(dashboardData) ? dashboardData : [];
  const item = source.find((entry) => entry[key] !== undefined);
  return item ? item[key] : fallback;
};

const emptyPurchase = {
  product_id: "",
  quantity: "",
  price: "",
  supplier_name: "",
  supplier_phone: "",
  invoice_number: "",
  batch_number: "",
  expiry_date: "",
};

const ReportsPage = () => {
  const [dashboardData, setDashboardData] = useState([]);
  const [summaryReport, setSummaryReport] = useState(null);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [expenseForm, setExpenseForm] = useState({ type: "salary", price: "" });
  const [supplierForm, setSupplierForm] = useState({ name: "", phone: "" });
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchase);
  const [auditForm, setAuditForm] = useState({ product_id: "", quantity: "", reason: "" });
  const [returnForm, setReturnForm] = useState({ sale_item_id: "", quantity: "", reason: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const token = localStorage.getItem("token");

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Token ${token}`,
  };

  const loadReports = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [dashboardRes, summaryRes, salesRes, suppliersRes, purchasesRes, productsRes] =
        await Promise.all([
          fetch(`${apiBaseUrl}/api/dashboard/`, { headers: { Authorization: `Token ${token}` } }),
          fetch(`${apiBaseUrl}/api/reports/summary/`, { headers: { Authorization: `Token ${token}` } }),
          fetch(`${apiBaseUrl}/api/sales/`, { headers: { Authorization: `Token ${token}` } }),
          fetch(`${apiBaseUrl}/api/suppliers/`, { headers: { Authorization: `Token ${token}` } }),
          fetch(`${apiBaseUrl}/api/purchases/`, { headers: { Authorization: `Token ${token}` } }),
          fetch(`${apiBaseUrl}/api/products/`, { headers: { Authorization: `Token ${token}` } }),
        ]);

      if (!dashboardRes.ok) throw new Error("Hisobot ma'lumotlari olinmadi");
      const dashboard = await dashboardRes.json();
      const summaryData = summaryRes.ok ? await summaryRes.json() : null;
      const salesData = salesRes.ok ? await salesRes.json() : [];
      const suppliersData = suppliersRes.ok ? await suppliersRes.json() : [];
      const purchasesData = purchasesRes.ok ? await purchasesRes.json() : [];
      const productsData = productsRes.ok ? await productsRes.json() : {};

      setDashboardData(Array.isArray(dashboard) ? dashboard : []);
      setSummaryReport(summaryData && !Array.isArray(summaryData) ? summaryData : null);
      setSales(Array.isArray(salesData) ? salesData : []);
      setSuppliers(Array.isArray(suppliersData) ? suppliersData : []);
      setPurchases(Array.isArray(purchasesData) ? purchasesData : []);
      setProducts(Array.isArray(productsData.products) ? productsData.products : []);
    } catch (err) {
      setError(err.message || "Hisobotni yuklashda xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    const dashboardProducts = pickDashboardValue(dashboardData, "products", []);
    const lowStock = summaryReport?.low_stock || dashboardProducts.filter(
      (product) => Number(product.quantity) <= Number(product.min_quantity || 50)
    );
    return {
      productsCount: pickDashboardValue(dashboardData, "quantity", 0),
      netProfit: summaryReport?.monthly_profit ?? pickDashboardValue(dashboardData, "profit", []).at?.(-1) ?? 0,
      income: summaryReport?.income ?? pickDashboardValue(dashboardData, "income", 0),
      expensesTotal: summaryReport?.expenses_total ?? pickDashboardValue(dashboardData, "expanses_total", 0),
      returnsTotal: summaryReport?.returns_total || 0,
      topProducts: (summaryReport?.top_products || pickDashboardValue(dashboardData, "products_by_sells", [])).slice(0, 6),
      lowStock: lowStock.slice(0, 8),
      deadStock: (summaryReport?.dead_stock || []).slice(0, 8),
      dailySales: summaryReport?.daily_sales || [],
      debtReport: summaryReport?.debt_report || [],
    };
  }, [dashboardData, summaryReport]);

  const saleItems = useMemo(
    () =>
      sales.flatMap((sale) =>
        (sale.items || []).map((item) => ({
          ...item,
          saleReceipt: sale.receipt_number,
          saleDate: sale.created_at,
        }))
      ),
    [sales]
  );

  const postJson = async (path, body) => {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || "So'rov bajarilmadi");
    return data;
  };

  const handleSaveExpense = async (event) => {
    event.preventDefault();
    if (!expenseForm.price) return;
    setSaving(true);
    try {
      await postJson("/api/expense/add/", {
        type: expenseForm.type,
        price: Number(expenseForm.price),
      });
      setExpenseForm({ type: "salary", price: "" });
      await loadReports();
    } catch (err) {
      setError(err.message || "Xarajatni saqlashda xatolik");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSupplier = async (event) => {
    event.preventDefault();
    if (!supplierForm.name.trim()) return;
    setSaving(true);
    try {
      await postJson("/api/suppliers/create/", supplierForm);
      setSupplierForm({ name: "", phone: "" });
      await loadReports();
    } catch (err) {
      setError(err.message || "Yetkazib beruvchi saqlanmadi");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePurchase = async (event) => {
    event.preventDefault();
    if (!purchaseForm.product_id || !purchaseForm.quantity || !purchaseForm.price) return;
    setSaving(true);
    try {
      await postJson("/api/purchases/create/", {
        ...purchaseForm,
        product_id: Number(purchaseForm.product_id),
        quantity: Number(purchaseForm.quantity),
        price: Number(purchaseForm.price),
      });
      setPurchaseForm(emptyPurchase);
      await loadReports();
    } catch (err) {
      setError(err.message || "Kirim saqlanmadi");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAudit = async (event) => {
    event.preventDefault();
    if (!auditForm.product_id || auditForm.quantity === "") return;
    setSaving(true);
    try {
      await postJson("/api/inventory/audit/", {
        product_id: Number(auditForm.product_id),
        quantity: Number(auditForm.quantity),
        reason: auditForm.reason || "manual_adjustment",
      });
      setAuditForm({ product_id: "", quantity: "", reason: "" });
      await loadReports();
    } catch (err) {
      setError(err.message || "Inventar tuzatish saqlanmadi");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveReturn = async (event) => {
    event.preventDefault();
    if (!returnForm.sale_item_id || !returnForm.quantity) return;
    setSaving(true);
    try {
      await postJson("/api/returns/", {
        sale_item_id: Number(returnForm.sale_item_id),
        quantity: Number(returnForm.quantity),
        reason: returnForm.reason || "return",
      });
      setReturnForm({ sale_item_id: "", quantity: "", reason: "" });
      await loadReports();
    } catch (err) {
      setError(err.message || "Qaytarish saqlanmadi");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadProducts = async () => {
    const response = await fetch(`${apiBaseUrl}/api/products/report/`, {
      headers: { Authorization: `Token ${token}` },
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = response.headers.get("content-type")?.includes("text/csv")
      ? "products_report.csv"
      : "products_report.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  if (loading) return <div className="tool-page-state">Hisobotlar yuklanmoqda...</div>;

  return (
    <main className="tool-page">
      <header className="tool-header">
        <div>
          <h1>Hisobotlar</h1>
          <p>Kunlik savdo, foyda, ombor, qarz va kirimlarni boshqaring.</p>
        </div>
        <button className="tool-primary-button" onClick={handleDownloadProducts}>
          Mahsulot hisobotini yuklash
        </button>
      </header>

      {error && <div className="tool-alert">{error}</div>}

      <section className="tool-metric-grid">
        <div className="tool-metric-card">
          <span>Ombordagi mahsulot</span>
          <strong>{Number(summary.productsCount).toLocaleString()}</strong>
        </div>
        <div className="tool-metric-card positive">
          <span>Sof foyda</span>
          <strong>{formatCurrency(summary.netProfit)}</strong>
        </div>
        <div className="tool-metric-card">
          <span>Daromad</span>
          <strong>{formatCurrency(summary.income)}</strong>
        </div>
        <div className="tool-metric-card danger">
          <span>Xarajat</span>
          <strong>{formatCurrency(summary.expensesTotal)}</strong>
        </div>
        <div className="tool-metric-card danger">
          <span>Qaytarilgan</span>
          <strong>{formatCurrency(summary.returnsTotal)}</strong>
        </div>
      </section>

      <section className="tool-grid two-columns">
        <div className="tool-panel">
          <h2>Tezkor xarajat</h2>
          <form className="tool-form" onSubmit={handleSaveExpense}>
            <select value={expenseForm.type} onChange={(event) => setExpenseForm((prev) => ({ ...prev, type: event.target.value }))}>
              <option value="salary">Maosh</option>
              <option value="rent">Ijara</option>
              <option value="tax">Soliq</option>
              <option value="ad">Reklama</option>
              <option value="communal">Komunal to'lovlar</option>
              <option value="other">Boshqa</option>
            </select>
            <input type="number" min="0" placeholder="Summa" value={expenseForm.price} onChange={(event) => setExpenseForm((prev) => ({ ...prev, price: event.target.value }))} />
            <button type="submit" disabled={saving}>{saving ? "Saqlanmoqda..." : "Saqlash"}</button>
          </form>
        </div>

        <div className="tool-panel">
          <h2>Yetkazib beruvchi</h2>
          <form className="tool-form" onSubmit={handleSaveSupplier}>
            <input placeholder="Nomi" value={supplierForm.name} onChange={(event) => setSupplierForm((prev) => ({ ...prev, name: event.target.value }))} />
            <input placeholder="Telefon" value={supplierForm.phone} onChange={(event) => setSupplierForm((prev) => ({ ...prev, phone: event.target.value }))} />
            <button type="submit" disabled={saving}>Saqlash</button>
          </form>
        </div>
      </section>

      <section className="tool-grid two-columns">
        <div className="tool-panel">
          <h2>Kirim / invoice</h2>
          <form className="tool-form" onSubmit={handleSavePurchase}>
            <select value={purchaseForm.product_id} onChange={(event) => setPurchaseForm((prev) => ({ ...prev, product_id: event.target.value }))}>
              <option value="">Mahsulot tanlang</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
            <input type="number" min="0" step="any" placeholder="Miqdor" value={purchaseForm.quantity} onChange={(event) => setPurchaseForm((prev) => ({ ...prev, quantity: event.target.value }))} />
            <input type="number" min="0" placeholder="Jami narx" value={purchaseForm.price} onChange={(event) => setPurchaseForm((prev) => ({ ...prev, price: event.target.value }))} />
            <input placeholder="Yetkazib beruvchi" value={purchaseForm.supplier_name} onChange={(event) => setPurchaseForm((prev) => ({ ...prev, supplier_name: event.target.value }))} />
            <input placeholder="Supplier telefon" value={purchaseForm.supplier_phone} onChange={(event) => setPurchaseForm((prev) => ({ ...prev, supplier_phone: event.target.value }))} />
            <input placeholder="Invoice raqami" value={purchaseForm.invoice_number} onChange={(event) => setPurchaseForm((prev) => ({ ...prev, invoice_number: event.target.value }))} />
            <input placeholder="Batch" value={purchaseForm.batch_number} onChange={(event) => setPurchaseForm((prev) => ({ ...prev, batch_number: event.target.value }))} />
            <input type="date" value={purchaseForm.expiry_date} onChange={(event) => setPurchaseForm((prev) => ({ ...prev, expiry_date: event.target.value }))} />
            <button type="submit" disabled={saving}>Kirim qilish</button>
          </form>
        </div>

        <div className="tool-panel">
          <h2>Inventar audit</h2>
          <form className="tool-form" onSubmit={handleSaveAudit}>
            <select value={auditForm.product_id} onChange={(event) => setAuditForm((prev) => ({ ...prev, product_id: event.target.value }))}>
              <option value="">Mahsulot tanlang</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
            <input type="number" min="0" step="any" placeholder="Sanab topilgan qoldiq" value={auditForm.quantity} onChange={(event) => setAuditForm((prev) => ({ ...prev, quantity: event.target.value }))} />
            <input placeholder="Sabab" value={auditForm.reason} onChange={(event) => setAuditForm((prev) => ({ ...prev, reason: event.target.value }))} />
            <button type="submit" disabled={saving}>Qoldiqni tuzatish</button>
          </form>
        </div>
      </section>

      <section className="tool-panel">
        <h2>Qaytarish / refund</h2>
        <form className="tool-form" onSubmit={handleSaveReturn}>
          <select value={returnForm.sale_item_id} onChange={(event) => setReturnForm((prev) => ({ ...prev, sale_item_id: event.target.value }))}>
            <option value="">Sotuv mahsulotini tanlang</option>
            {saleItems.map((item) => (
              <option key={item.id} value={item.id}>
                #{item.saleReceipt} - {item.product_name} ({item.quantity - Number(item.returned_quantity || 0)} qoldi)
              </option>
            ))}
          </select>
          <input type="number" min="0" step="any" placeholder="Qaytarish miqdori" value={returnForm.quantity} onChange={(event) => setReturnForm((prev) => ({ ...prev, quantity: event.target.value }))} />
          <input placeholder="Sabab" value={returnForm.reason} onChange={(event) => setReturnForm((prev) => ({ ...prev, reason: event.target.value }))} />
          <button type="submit" disabled={saving}>Qaytarishni saqlash</button>
        </form>
      </section>

      <section className="tool-grid two-columns">
        <div className="tool-panel">
          <h2>Kunlik savdo</h2>
          <div className="tool-list">
            {summary.dailySales.slice(-7).map((row) => (
              <div className="tool-list-row" key={row.date}>
                <span>{row.date}</span>
                <strong>{formatCurrency(row.total)}</strong>
              </div>
            ))}
            {summary.dailySales.length === 0 && <p className="tool-empty">Kunlik savdo hali yo'q.</p>}
          </div>
        </div>

        <div className="tool-panel">
          <h2>Eng ko'p sotilganlar</h2>
          <div className="tool-list">
            {summary.topProducts.map((product) => (
              <div className="tool-list-row" key={product.id}>
                <span>{product.name}</span>
                <strong>{Number(product.total_subtracted || 0).toLocaleString()} {product.quantity_type}</strong>
              </div>
            ))}
            {summary.topProducts.length === 0 && <p className="tool-empty">Sotuv ma'lumotlari hali yo'q.</p>}
          </div>
        </div>
      </section>

      <section className="tool-grid two-columns">
        <div className="tool-panel">
          <h2>Kam qolgan mahsulotlar</h2>
          <div className="tool-list compact">
            {summary.lowStock.map((product) => (
              <div className="tool-list-row" key={product.id}>
                <span>{product.name}</span>
                <strong>{Number(product.quantity).toLocaleString()} / {Number(product.min_quantity || 0).toLocaleString()} {product.quantity_type}</strong>
              </div>
            ))}
            {summary.lowStock.length === 0 && <p className="tool-empty">Ombor holati yaxshi.</p>}
          </div>
        </div>

        <div className="tool-panel">
          <h2>Sotilmayotgan mahsulotlar</h2>
          <div className="tool-list compact">
            {summary.deadStock.map((product) => (
              <div className="tool-list-row" key={product.id}>
                <span>{product.name}</span>
                <strong>{Number(product.quantity || 0).toLocaleString()} {product.quantity_type}</strong>
              </div>
            ))}
            {summary.deadStock.length === 0 && <p className="tool-empty">Barcha mahsulotlarda harakat bor.</p>}
          </div>
        </div>
      </section>

      <section className="tool-grid two-columns">
        <div className="tool-panel">
          <h2>Qarz hisoboti</h2>
          <div className="tool-list compact">
            {summary.debtReport.slice(0, 8).map((debtor) => (
              <div className="tool-list-row" key={debtor.id}>
                <span>{debtor.name}</span>
                <strong>{formatCurrency(debtor.price)}</strong>
              </div>
            ))}
            {summary.debtReport.length === 0 && <p className="tool-empty">Qarzlar yo'q.</p>}
          </div>
        </div>

        <div className="tool-panel">
          <h2>Oxirgi kirimlar</h2>
          <div className="tool-list compact">
            {purchases.slice(0, 8).map((purchase) => (
              <div className="tool-list-row" key={purchase.id}>
                <span>{purchase.invoice_number} - {purchase.supplier_name}</span>
                <strong>{formatCurrency(purchase.total)}</strong>
              </div>
            ))}
            {purchases.length === 0 && <p className="tool-empty">Kirimlar hali yo'q.</p>}
          </div>
        </div>
      </section>

      <section className="tool-grid two-columns">
        <div className="tool-panel">
          <h2>Yetkazib beruvchilar</h2>
          <div className="tool-list compact">
            {suppliers.slice(0, 8).map((supplier) => (
              <div className="tool-list-row" key={supplier.id}>
                <span>{supplier.name}</span>
                <strong>{supplier.phone || "-"}</strong>
              </div>
            ))}
            {suppliers.length === 0 && <p className="tool-empty">Supplier hali yo'q.</p>}
          </div>
        </div>

        <div className="tool-panel">
          <h2>Oxirgi sotuvlar</h2>
          <div className="tool-list compact">
            {sales.slice(0, 8).map((sale) => (
              <div className="tool-list-row" key={sale.id}>
                <span>#{sale.receipt_number}</span>
                <strong>{formatCurrency(sale.total)}</strong>
              </div>
            ))}
            {sales.length === 0 && <p className="tool-empty">Sotuvlar hali yo'q.</p>}
          </div>
        </div>
      </section>
    </main>
  );
};

export default ReportsPage;
