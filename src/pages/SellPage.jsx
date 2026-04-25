import React, { useEffect, useState, useRef } from "react";
import "../styles/ProductsPage.css";
import "../styles/SellPage.css";
import deleteIcon from "../assets/dashboard/delete.svg";
import { resolveMediaUrl } from "../utils/imageSource";

const SellPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("Meals");
  const [cartItems, setCartItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  // Detect theme (light/dark) from html or body class
  const [isLightTheme, setIsLightTheme] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [cartDiscount, setCartDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState("");

  const [showQarzModal, setShowQarzModal] = useState(false);
  const [debtors, setDebtors] = useState([]);
  const [debtorSearch, setDebtorSearch] = useState("");
  const [selectedDebtor, setSelectedDebtor] = useState(null);
  const [debtorName, setDebtorName] = useState("");
  const [debtorPhone, setDebtorPhone] = useState("");
  const [qarzLoading, setQarzLoading] = useState(false);
  const [qarzError, setQarzError] = useState("");
  const debtorInputRef = useRef(null);
  const [debtorDropdownStyle, setDebtorDropdownStyle] = useState({});
  const [showDebtorDropdown, setShowDebtorDropdown] = useState(false);

  // Load cart from localStorage on mount (before any other useEffect that might overwrite it)
  useEffect(() => {
    const savedCart = localStorage.getItem("cartItems");
    if (savedCart) {
      setCartItems(JSON.parse(savedCart));
    }
  }, []);

  useEffect(() => {
    // Fetch products/categories from API on mount
    const fetchProducts = async () => {
      try {
        const token = localStorage.getItem("token");
        const baseUrl =
          process.env.REACT_APP_API_BASE_URL || process.env.VITE_API_URL || "";
        const url = `${baseUrl}/api/categories/products/`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token ${token}`,
          },
        });
        if (!response.ok) {
          const text = await response.text();
          console.error("API error:", response.status, text);
          return;
        }
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          console.log("/api/categories/products/ response:", data);
          // Extract categories and products
          const categoryNames = Object.keys(data).filter((cat) =>
            Array.isArray(data[cat])
          );
          setCategories(categoryNames);
          // Flatten products for all categories, but keep category info
          let allProducts = [];
          categoryNames.forEach((cat) => {
            data[cat].forEach((item) => {
              allProducts.push({ ...item, category: cat });
            });
          });
          setProducts(allProducts);
          // Optionally set default activeCategory to first non-empty category
          const firstNonEmpty = categoryNames.find(
            (cat) => Array.isArray(data[cat]) && data[cat].length > 0
          );
          if (firstNonEmpty) setActiveCategory(firstNonEmpty);
        } else {
          const text = await response.text();
          console.warn("Non-JSON response:", text);
        }
      } catch (error) {
        console.error("Error fetching products:", error);
      }
    };
    fetchProducts();
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("cartItems", JSON.stringify(cartItems));
  }, [cartItems]);

  // Example search handler (replace with real logic as needed)
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    // Add filtering logic here if needed
  };

  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;
    
    // find product by barcode (we already have findProductByBarcode)
    const product = findProductByBarcode(code);
    if (!product) {
      showStockError(`Barcode topilmadi: ${code}`);
      setBarcodeInput("");
      return;
    }
    
    addToCart(product);
    setBarcodeInput(""); // reset for next scan
  };

  const addToCart = (product) => {
    const availableQuantity = Number(product.quantity || 0);
    if (availableQuantity <= 0) {
      showStockError(`${product.name} omborda mavjud emas.`);
      return;
    }
    // Use price_per_quantity if available, fallback to price, and parse as number
    const price = Number(product.price_per_quantity || product.price);
    const cartProduct = {
      id: product.id,
      name: product.name,
      price, // always a number
      image: resolveMediaUrl(product.image_url || product.image),
      quantity: 1,
      availableQuantity,
      quantityType: product.quantity_type,
    };
    const existingItem = cartItems.find((item) => item.id === cartProduct.id);
    if (existingItem) {
      if (Number(existingItem.quantity) + 1 > availableQuantity) {
        showStockError(
          `${product.name} uchun omborda faqat ${availableQuantity} ${product.quantity_type} bor.`
        );
        return;
      }
      setCartItems(
        cartItems.map((item) =>
          item.id === cartProduct.id
            ? { ...item, quantity: item.quantity + 1, availableQuantity }
            : item
        )
      );
    } else {
      setCartItems([...cartItems, cartProduct]);
    }
  };

  const getTotalPrice = () => {
    const itemTotal = cartItems.reduce(
      (total, item) => total + item.price * item.quantity - Number(item.discount || 0),
      0
    );
    return Math.max(itemTotal - Number(cartDiscount || 0), 0);
  };

  const formatPrice = (price) => {
    return price.toLocaleString("uz-UZ") + " UZS";
  };

  const showStockError = (message) => {
    setErrorMessage(message);
    setShowError(true);
  };

  const getAvailableQuantity = (itemOrProduct) => {
    const product = products.find((product) => product.id === itemOrProduct.id);
    return Number(
      product?.quantity ?? itemOrProduct.availableQuantity ?? itemOrProduct.quantity ?? 0
    );
  };

  const findProductByBarcode = (barcode) => {
    const code = String(barcode || "").trim();
    if (!code) return null;
    return products.find(
      (product) =>
        Array.isArray(product.barcodes) &&
        product.barcodes.some((productBarcode) => productBarcode === code)
    );
  };

  const removeFromCart = (itemId) => {
    setCartItems(cartItems.filter((item) => item.id !== itemId));
  };

  const updateItemDiscount = (itemId, value) => {
    setCartItems((prevItems) =>
      prevItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              discount: Math.min(
                Number(value || 0),
                Number(item.price || 0) * Number(item.quantity || 0)
              ),
            }
          : item
      )
    );
  };

  const decreaseQuantity = (itemId) => {
    setCartItems((prevItems) =>
      prevItems
        .map((item) =>
          item.id === itemId ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const increaseQuantity = (itemId) => {
    setCartItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id !== itemId) return item;
        const availableQuantity = getAvailableQuantity(item);
        if (Number(item.quantity) + 1 > availableQuantity) {
          showStockError(
            `${item.name} uchun omborda faqat ${availableQuantity} ${item.quantityType || ""} bor.`
          );
          return item;
        }
        return { ...item, quantity: item.quantity + 1, availableQuantity };
      })
    );
  };

  // Detect theme (light/dark) from html or body class
  useEffect(() => {
    const checkTheme = () => {
      const htmlClass = document.documentElement.className;
      setIsLightTheme(htmlClass.includes("light-theme"));
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  // Enhanced search: search across all categories, auto-switch to first matching category
  useEffect(() => {
    if (!searchTerm) return; // Don't auto-switch if search is empty
    // Find the first category with a matching product
    const lowerSearch = searchTerm.toLowerCase();
    const match = products.find(
      (product) =>
        product.name && product.name.toLowerCase().includes(lowerSearch)
    );
    if (match && match.category !== activeCategory) {
      setActiveCategory(match.category);
    }
  }, [searchTerm, products, activeCategory]);

  // Filter products by active category and search term
  const filteredProducts = products.filter(
    (product) =>
      product.category === activeCategory &&
      ((product.name &&
        product.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (Array.isArray(product.barcodes) &&
          product.barcodes.some((barcode) => barcode.includes(searchTerm))))
  );

  const buildPaymentPayload = (method) => {
    if (method !== "mixed") return undefined;
    return [
      { method: "cash", amount: Number(cashAmount || 0) },
      { method: "card", amount: Number(cardAmount || 0) },
      { method: "transfer", amount: Number(transferAmount || 0) },
    ].filter((payment) => payment.amount > 0);
  };

  const handlePay = async (override = {}) => {
    // If override is an event object (from onClick), ignore it
    if (override && override.nativeEvent) {
      override = {};
    }
    if (cartItems.length === 0) return;
    setLoading(true);
    setShowError(false);
    setErrorMessage("");
    const token = localStorage.getItem("token");
    const baseUrl =
      process.env.REACT_APP_API_BASE_URL || process.env.VITE_API_URL || "";
    const url = `${baseUrl}/api/sell/`;
    const sells = cartItems.map((item) => ({
      product_id: item.id,
      price: item.price,
      quantity: item.quantity,
      discount: Number(item.discount || 0),
    }));
    const method = override.payment_method || paymentMethod;
    const payments = buildPaymentPayload(method);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${token}`,
        },
        body: JSON.stringify({
          sells,
          discount: Number(cartDiscount || 0),
          payment_method: method,
          paid_amount:
            method === "debt" ? 0 : method === "mixed" ? undefined : getTotalPrice(),
          payments,
          ...override,
        }),
      });
      if (response.status === 200) {
        const data = await response.json().catch(() => ({}));
        setReceipt(data.receipt || null);
        setShowSuccess(true);
        setCartItems([]);
        setCartDiscount("");
        setCashAmount("");
        setCardAmount("");
        setTransferAmount("");
        setTimeout(() => setShowSuccess(false), 1500);
      } else {
        const data = await response.json().catch(() => ({}));
        setErrorMessage(data.error || "Xatolik yuz berdi. Qayta urinib ko'ring.");
        setShowError(true);
      }
    } catch (e) {
      console.error(e);
      setErrorMessage(`Tarmoq xatosi yoki server javob bermadi. Detailed error: ${e.message}`);
      setShowError(true);
    }
    setLoading(false);
  };

  // Fetch debtors when modal opens
  useEffect(() => {
    if (showQarzModal) {
      const fetchDebtors = async () => {
        try {
          const token = localStorage.getItem("token");
          const baseUrl =
            process.env.REACT_APP_API_BASE_URL || process.env.VITE_API_URL || "";
          const url = `${baseUrl}/api/debtors/`;
          const response = await fetch(url, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Token ${token}`,
            },
          });
          if (response.ok) {
            const data = await response.json();
            setDebtors(Array.isArray(data) ? data : []);
          } else {
            setDebtors([]);
          }
        } catch {
          setDebtors([]);
        }
      };
      fetchDebtors();
      setDebtorSearch("");
      setSelectedDebtor(null);
      setDebtorName("");
      setDebtorPhone("");
      setQarzError("");
    }
  }, [showQarzModal]);

  // When selectedDebtor changes, autofill fields
  useEffect(() => {
    if (selectedDebtor) {
      setDebtorName(selectedDebtor.name);
      setDebtorPhone(selectedDebtor.phone);
    }
  }, [selectedDebtor]);

  const handleQarz = async () => {
    if (!debtorName.trim() || !debtorPhone.trim()) {
      setQarzError("Ism va telefon raqami to'ldirilishi shart.");
      return;
    }
    setQarzLoading(true);
    setQarzError("");
    const token = localStorage.getItem("token");
    const baseUrl =
      process.env.REACT_APP_API_BASE_URL || process.env.VITE_API_URL || "";
    const url = `${baseUrl}/api/sell/`;
    const sells = cartItems.map((item) => ({
      product_id: item.id,
      price: item.price,
      quantity: item.quantity,
      discount: Number(item.discount || 0),
    }));
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${token}`,
        },
        body: JSON.stringify({
          sells,
          discount: Number(cartDiscount || 0),
          payment_method: "debt",
          debtor_name: debtorName,
          debtor_phone: debtorPhone,
        }),
      });
      if (response.status === 200) {
        const data = await response.json().catch(() => ({}));
        setReceipt(data.receipt || null);
        setShowSuccess(true);
        setCartItems([]);
        setCartDiscount("");
        setShowQarzModal(false);
        setTimeout(() => setShowSuccess(false), 1500);
      } else {
        const data = await response.json().catch(() => ({}));
        setQarzError(data.error || "Xatolik yuz berdi. Qayta urinib ko'ring.");
      }
    } catch {
      setQarzError("Tarmoq xatosi yoki server javob bermadi.");
    }
    setQarzLoading(false);
  };

  // Update debtor dropdown style on render and when dependencies change
  useEffect(() => {
    if (debtorInputRef.current) {
      const rect = debtorInputRef.current.getBoundingClientRect();
      setDebtorDropdownStyle({
        width: rect.width,
      });
    }
  }, [showDebtorDropdown, debtorSearch]);

  return (
    <div
      className="sell-page-container products-page"
      style={{ display: "flex", height: "100vh", overflow: "hidden" }}
    >
      {/* Sidebar would be here if present */}
      <div
        style={{
          flex: 2,
          minWidth: 0,
          height: "100vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          scrollbarWidth: "none", // Hide Firefox scrollbar
          msOverflowStyle: "none", // Hide IE/Edge scrollbar
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          <div
            className="sell-page-header-section header-section"
            style={{
              alignItems: "flex-start",
              marginBottom: 8,
            }}
          >
            <h1
              className="sell-page-title"
              style={{
                marginBottom: 0,
                fontSize: 32,
              }}
            >
              Sotuv
            </h1>
          </div>
          <div
            className="sell-page-search-container"
            style={{
              marginBottom: 16,
            }}
          >
            <div className="search-container">
              <span className="search-icon" />
              <input
                type="text"
                placeholder="Qidiruv..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="sell-page-search-input"
              />
            </div>
          </div>
          <form 
            className="sell-page-scanner-panel" 
            onSubmit={handleBarcodeSubmit}
          >
            <div style={{ flex: 1 }}>
              <div className="sell-page-scanner-title">Barcode Skaner</div>
              <div className="sell-page-scanner-subtitle">
                Hardware skanerni ulab mahsulotni skanerlang yoki shtrix kodni qo'lda yozib Enter bosing.
              </div>
              <input
                type="text"
                placeholder="Shtrix kodni o'qiting (masalan: 123456789)..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  marginTop: '12px',
                  fontSize: '16px',
                  outline: 'none',
                  background: isLightTheme ? "#fff" : "#23273a",
                  color: isLightTheme ? "#111827" : "#fff",
                }}
              />
            </div>
            <div className="sell-page-scanner-actions">
              <button
                type="submit"
                className="sell-page-scanner-btn"
              >
                Izlash
              </button>
            </div>
          </form>
          <div className="sell-page-product-selection">
            <div className="sell-page-category-bar">
              {categories.map((category, index) => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`sell-page-category-btn${
                    activeCategory === category ? " active" : ""
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
            <div
              className="sell-page-products-grid"
              style={
                {
                  /* ...existing styles... */
                }
              }
            >
              {filteredProducts.map((product) => {
                const availableQuantity = Number(product.quantity || 0);
                const isOutOfStock = availableQuantity <= 0;
                const imageSrc = resolveMediaUrl(product.image_url || product.image);
                return (
                  <div
                    key={product.id}
                    onClick={() => !isOutOfStock && addToCart(product)}
                    className="sell-page-product-card product-card"
                    style={{
                      opacity: isOutOfStock ? 0.5 : 1,
                      cursor: isOutOfStock ? "not-allowed" : "pointer",
                    }}
                  >
                    {imageSrc ? (
                      <img
                        src={imageSrc}
                        alt={product.name}
                        className="sell-page-product-img"
                      />
                    ) : (
                      <div className="sell-page-product-img sell-page-image-placeholder">
                        {product.name?.slice(0, 1)}
                      </div>
                    )}
                    <div className="sell-page-product-name">{product.name}</div>
                    <div className="sell-page-product-price">
                      {formatPrice(
                        Number(product.price_per_quantity || product.price)
                      )}
                    </div>
                    <div
                      style={{
                        color: isOutOfStock ? "#ef4444" : "var(--color-text-muted)",
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      {availableQuantity.toLocaleString("uz-UZ")} {product.quantity_type}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {/* Cart area - fixed, not scrollable, like sidebar */}
      <div
        className="sell-page-cart-area"
        style={{
          flex: "0 0 clamp(420px, 24vw, 500px)",
          minWidth: 420,
          maxWidth: 500,
          height: "100vh",
          alignSelf: "stretch",
          position: "sticky",
          top: 0,
          display: "flex",
          flexDirection: "column",
          background: isLightTheme ? "var(--color-bg-secondary)" : "#2e3342",
          borderRadius: 0,
          padding: 24,
          boxSizing: "border-box",
          overflow: "hidden",
          marginLeft: 24,
          boxShadow: isLightTheme ? "0 4px 6px var(--color-shadow)" : "none",
        }}
      >
        <div className="sell-page-cart-header">
          <h2
            className="sell-page-cart-title"
            style={{
              color: isLightTheme ? "var(--color-text-primary)" : "#fff",
              transition: "color 0.2s",
            }}
          >
            Xarid
          </h2>
          {/* Removed close (X) button */}
        </div>
        <div
          className="sell-page-cart-list"
          style={{
            flex: 1,
            overflowY: "auto",
            minHeight: 0,
            display: cartItems.length === 0 ? "flex" : undefined,
            flexDirection: cartItems.length === 0 ? "column" : undefined,
            alignItems: cartItems.length === 0 ? "center" : undefined,
            justifyContent: cartItems.length === 0 ? "center" : undefined,
          }}
        >
          {cartItems.length === 0 ? (
            <div className="sell-page-cart-empty" style={{ width: "100%" }}>
              <svg
                width="56"
                height="56"
                viewBox="0 0 56 56"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ display: "block", margin: "0 auto 12px auto" }}
              >
                <rect
                  x="8"
                  y="16"
                  width="40"
                  height="28"
                  rx="6"
                  fill="#e5e7eb"
                />
                <rect
                  x="16"
                  y="8"
                  width="24"
                  height="12"
                  rx="6"
                  fill="#cbd5e1"
                />
                <path
                  d="M20 36h16"
                  stroke="#bfc9d1"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx="20" cy="44" r="3" fill="#bfc9d1" />
                <circle cx="36" cy="44" r="3" fill="#bfc9d1" />
              </svg>
              <div
                style={{
                  textAlign: "center",
                  color: "var(--color-text-secondary)",
                  fontSize: 16,
                  marginBottom: 8,
                }}
              >
                Savatcha hozircha bo'sh
              </div>
              <div
                style={{
                  textAlign: "center",
                  color: "var(--color-text-muted)",
                  fontSize: 14,
                }}
              >
                Mahsulot qo'shish uchun ro'yxatdan tanlang
              </div>
            </div>
          ) : (
            cartItems.map((item, index) => (
              <div key={`${item.id}-${index}`} className="sell-page-cart-item">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="sell-page-cart-item-img"
                  />
                ) : (
                  <div className="sell-page-cart-item-img sell-page-image-placeholder">
                    {item.name?.slice(0, 1)}
                  </div>
                )}
                <div
                  className="sell-page-cart-item-info"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    color: isLightTheme ? "var(--color-text-primary)" : "#fff",
                    transition: "color 0.2s",
                  }}
                >
                  <div
                    className="sell-page-cart-item-name"
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      minWidth: 0,
                      width: "100%",
                      display: "block",
                      fontWeight: 700,
                      fontSize: 18,
                    }}
                  >
                    {item.name}
                  </div>
                  <div className="sell-page-cart-item-price">
                    {formatPrice(item.price)}
                  </div>
                </div>
                <div className="sell-page-cart-item-controls">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      decreaseQuantity(item.id);
                    }}
                    className="sell-page-cart-qty-btn"
                    aria-label="Decrease quantity"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <rect
                        x="4"
                        y="8.25"
                        width="10"
                        height="1.5"
                        rx="0.75"
                        fill="#bfc9d1"
                      />
                    </svg>
                  </button>
                  <div className="sell-page-cart-qty">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="sell-page-cart-qty-value"
                      value={item.quantity}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (val === "") val = 0;
                        const num = parseFloat(val);
                        if (!isNaN(num) && num >= 0) {
                          const availableQuantity = getAvailableQuantity(item);
                          if (num > availableQuantity) {
                            showStockError(
                              `${item.name} uchun omborda faqat ${availableQuantity} ${item.quantityType || ""} bor.`
                            );
                            return;
                          }
                          setCartItems((prevItems) =>
                            prevItems.map((it) =>
                              it.id === item.id
                                ? { ...it, quantity: num, availableQuantity }
                                : it
                            )
                          );
                        }
                      }}
                      style={{
                        width: 40,
                        textAlign: "center",
                        background: "transparent",
                        border: "none",
                        color: "inherit",
                        fontWeight: 700,
                        fontSize: 16,
                        outline: "none",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      increaseQuantity(item.id);
                    }}
                    className="sell-page-cart-qty-btn"
                    aria-label="Increase quantity"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <rect
                        x="8.25"
                        y="4"
                        width="1.5"
                        height="10"
                        rx="0.75"
                        fill="#bfc9d1"
                      />
                      <rect
                        x="4"
                        y="8.25"
                        width="10"
                        height="1.5"
                        rx="0.75"
                        fill="#bfc9d1"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromCart(item.id);
                    }}
                    className="sell-page-cart-remove-btn"
                    aria-label="Remove item"
                  >
                    <img
                      src={deleteIcon}
                      alt="Remove"
                      style={{ width: 20, height: 20 }}
                    />
                  </button>
                </div>
                <input
                  className="sell-page-cart-discount-input"
                  type="number"
                  min="0"
                  placeholder="Chegirma"
                  value={item.discount || ""}
                  onChange={(event) =>
                    updateItemDiscount(item.id, event.target.value)
                  }
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    padding: "8px 6px",
                    background: isLightTheme ? "#fff" : "#23273a",
                    color: isLightTheme ? "#111827" : "#fff",
                  }}
                />
              </div>
            ))
          )}
        </div>
        <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
          <input
            type="number"
            min="0"
            placeholder="Umumiy chegirma"
            value={cartDiscount}
            onChange={(event) => setCartDiscount(event.target.value)}
            style={{
              minHeight: 40,
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              padding: "0 12px",
              background: isLightTheme ? "#fff" : "#23273a",
              color: isLightTheme ? "#111827" : "#fff",
            }}
          />
          <select
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            style={{
              minHeight: 40,
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              padding: "0 12px",
              background: isLightTheme ? "#fff" : "#23273a",
              color: isLightTheme ? "#111827" : "#fff",
            }}
          >
            <option value="cash">Naqd</option>
            <option value="card">Karta</option>
            <option value="transfer">O'tkazma</option>
            <option value="mixed">Aralash</option>
          </select>
          {paymentMethod === "mixed" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <input
                type="number"
                min="0"
                placeholder="Naqd"
                value={cashAmount}
                onChange={(event) => setCashAmount(event.target.value)}
              />
              <input
                type="number"
                min="0"
                placeholder="Karta"
                value={cardAmount}
                onChange={(event) => setCardAmount(event.target.value)}
              />
              <input
                type="number"
                min="0"
                placeholder="O'tkazma"
                value={transferAmount}
                onChange={(event) => setTransferAmount(event.target.value)}
              />
            </div>
          )}
        </div>
        <div className="sell-page-cart-total-row">
          <span
            className="sell-page-cart-total-label"
            style={{
              color: isLightTheme ? "var(--color-text-primary)" : undefined,
            }}
          >
            Total :
          </span>
          <span
            className="sell-page-cart-total-value"
            style={{
              color: isLightTheme ? "var(--color-text-primary)" : undefined,
              fontWeight: 700,
            }}
          >
            {formatPrice(getTotalPrice())}
          </span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            className="sell-page-cart-pay-btn"
            onClick={handlePay}
            disabled={loading || cartItems.length === 0}
            style={{
              flex: 1,
              opacity: loading ? 0.7 : 1,
              position: "relative",
            }}
            onMouseEnter={(e) => (e.target.style.backgroundColor = "#5a8384")}
            onMouseLeave={(e) => (e.target.style.backgroundColor = "#4c7273")}
          >
            {loading ? (
              <span
                className="pay-btn-spinner"
                style={{ display: "inline-block", verticalAlign: "middle" }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ animation: "spin 1s linear infinite" }}
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="#fff"
                    strokeWidth="4"
                    opacity="0.2"
                  />
                  <path
                    d="M22 12a10 10 0 0 1-10 10"
                    stroke="#fff"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            ) : (
              "Pay"
            )}
          </button>
          <button
            className="sell-page-cart-qarz-btn"
            style={{
              flex: 1,
              background: cartItems.length === 0 ? "#7a8e8e" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "16px 0",
              fontWeight: 700,
              fontSize: 20,
              cursor: cartItems.length === 0 ? "not-allowed" : "pointer",
              transition: "background-color 0.2s ease",
              opacity: cartItems.length === 0 ? 0.7 : 1,
              position: "relative",
            }}
            disabled={cartItems.length === 0}
            onMouseEnter={
              cartItems.length === 0
                ? undefined
                : (e) => (e.target.style.background = "#1d4ed8")
            }
            onMouseLeave={
              cartItems.length === 0
                ? undefined
                : (e) => (e.target.style.background = "#2563eb")
            }
            onClick={
              cartItems.length === 0 ? undefined : () => setShowQarzModal(true)
            }
          >
            Qarz
          </button>
        </div>
      </div>
      <style>{`
        .sell-page-container.products-page > div[style*='overflowY: auto']::-webkit-scrollbar {
          display: none;
        }
        .sell-success-notification {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 9999;
          background: rgba(255,255,255,0.95);
          border-radius: 16px;
          box-shadow: 0 8px 32px var(--color-shadow);
          padding: 40px 60px;
          display: flex;
          flex-direction: column;
          align-items: center;
          animation: pop-in 0.18s cubic-bezier(0.4,2,0.6,1) both;
        }
        .sell-success-tick {
          width: 72px;
          height: 72px;
          margin-bottom: 18px;
        }
        @keyframes pop-in {
          0% { transform: scale(0.7) translate(-50%, -50%); opacity: 0; }
          100% { transform: scale(1) translate(-50%, -50%); opacity: 1; }
        }
        .sell-page-cart-pay-btn[disabled] {
          cursor: not-allowed;
          background: #7a8e8e !important;
        }
        .pay-btn-spinner svg {
          animation: pay-spin 0.8s linear infinite;
        }
        @keyframes pay-spin {
          100% { transform: rotate(360deg); }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .sell-error-notification {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 9999;
          background: rgba(255,255,255,0.97);
          border-radius: 16px;
          box-shadow: 0 8px 32px var(--color-shadow);
          padding: 40px 60px;
          display: flex;
          flex-direction: column;
          align-items: center;
          animation: pop-in 0.18s cubic-bezier(0.4,2,0.6,1) both;
        }
        .sell-error-cross {
          width: 72px;
          height: 72px;
          margin-bottom: 18px;
          animation: shake 0.5s cubic-bezier(0.36,0.07,0.19,0.97) both;
        }
        @keyframes shake {
          10%, 90% { transform: translate(-50%, -50%) translateX(-1px); }
          20%, 80% { transform: translate(-50%, -50%) translateX(2px); }
          30%, 50%, 70% { transform: translate(-50%, -50%) translateX(-4px); }
          40%, 60% { transform: translate(-50%, -50%) translateX(4px); }
        }
        .sell-error-close-btn:hover {
          background: #dc2626;
        }
        .qarz-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 10000;
          background: rgba(0, 0, 0, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .qarz-modal {
          background: var(--color-bg-primary);
          border-radius: 16px;
          box-shadow: 0 8px 32px var(--color-shadow);
          padding: 32px;
          min-width: 340px;
          max-width: 400px;
          width: 100%;
        }
        @keyframes dropdown-fade-in {
          0% { opacity: 0; transform: translateY(-10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .qarz-debtor-dropdown {
          animation: dropdown-fade-in 0.18s cubic-bezier(0.4,2,0.6,1);
        }
      `}</style>
      {showSuccess && (
        <div className="sell-success-notification">
          <svg
            className="sell-success-tick"
            viewBox="0 0 72 72"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="36"
              cy="36"
              r="34"
              fill="#e6f9ed"
              stroke="#4ade80"
              strokeWidth="4"
            />
            <path
              d="M22 38l10 10 18-22"
              stroke="#22c55e"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div
            style={{
              color: "#22c55e",
              fontWeight: 700,
              fontSize: 22,
              marginBottom: 2,
            }}
          >
            Sotuv muvaffaqiyatli!
          </div>
        </div>
      )}
      {receipt && (
        <div className="qarz-modal-overlay">
          <div className="qarz-modal" style={{ maxWidth: 460 }}>
            <h2 style={{ marginTop: 0 }}>Chek</h2>
            <div id="sstore-receipt" style={{ color: isLightTheme ? "#111827" : "#fff" }}>
              <strong>{receipt.market_name}</strong>
              <div>{receipt.market_phone}</div>
              <div>#{receipt.receipt_number}</div>
              <div>{new Date(receipt.date).toLocaleString()}</div>
              <hr />
              {(receipt.items || []).map((item) => (
                <div key={item.id} style={{ marginBottom: 8 }}>
                  <div>{item.product_name}</div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>
                      {item.quantity} x {formatPrice(Number(item.unit_price || 0))}
                      {Number(item.discount || 0) > 0
                        ? ` - ${formatPrice(Number(item.discount))}`
                        : ""}
                    </span>
                    <strong>{formatPrice(Number(item.total_price || 0))}</strong>
                  </div>
                </div>
              ))}
              <hr />
              <div>Chegirma: {formatPrice(Number(receipt.discount || 0))}</div>
              <div>Jami: {formatPrice(Number(receipt.total || 0))}</div>
              <div>To'landi: {formatPrice(Number(receipt.paid_amount || 0))}</div>
              {Number(receipt.unpaid_amount || 0) > 0 && (
                <div>
                  Qarz: {formatPrice(Number(receipt.unpaid_amount))} (
                  {receipt.debtor?.name})
                </div>
              )}
              <div>To'lov: {receipt.payment_method}</div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                onClick={() => window.print()}
                style={{
                  flex: 1,
                  border: 0,
                  borderRadius: 8,
                  padding: 12,
                  background: "#2563eb",
                  color: "#fff",
                  fontWeight: 700,
                }}
              >
                Chop etish
              </button>
              <button
                onClick={() => setReceipt(null)}
                style={{
                  flex: 1,
                  border: 0,
                  borderRadius: 8,
                  padding: 12,
                  background: "#e5e7eb",
                  color: "#111827",
                  fontWeight: 700,
                }}
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
      {showError && (
        <div className="sell-error-notification">
          <svg
            className="sell-error-cross"
            viewBox="0 0 72 72"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="36"
              cy="36"
              r="34"
              fill="#fef2f2"
              stroke="#f87171"
              strokeWidth="4"
            />
            <path
              d="M26 26l20 20M46 26l-20 20"
              stroke="#ef4444"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </svg>
          <div
            style={{
              color: "#ef4444",
              fontWeight: 700,
              fontSize: 22,
              marginBottom: 2,
            }}
          >
            Xatolik!
          </div>
          <div
            style={{
              color: "#ef4444",
              fontWeight: 500,
              fontSize: 16,
              textAlign: "center",
              maxWidth: 320,
            }}
          >
            {errorMessage}
          </div>
          <button
            className="sell-error-close-btn"
            onClick={() => setShowError(false)}
            style={{
              marginTop: 18,
              background: "#ef4444",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 24px",
              fontWeight: 700,
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Yopish
          </button>
        </div>
      )}
      {showQarzModal && (
        <div className="qarz-modal-overlay">
          <div className="qarz-modal">
            <h2
              style={{
                marginTop: 0,
                marginBottom: 18,
                color: isLightTheme ? "var(--color-text-primary)" : "#fff",
              }}
            >
              Qarzga sotish
            </h2>
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  fontWeight: 600,
                  color: isLightTheme ? "var(--color-text-primary)" : "#fff",
                }}
              >
                Qarzdor tanlash
              </label>
              <div style={{ position: "relative" }}>
                <input
                  ref={debtorInputRef}
                  type="text"
                  placeholder="Ism bo'yicha qidiring..."
                  value={debtorSearch}
                  onChange={(e) => {
                    setDebtorSearch(e.target.value);
                    setSelectedDebtor(null);
                    setDebtorName("");
                    setDebtorPhone("");
                    setShowDebtorDropdown(true);
                  }}
                  onFocus={() => setShowDebtorDropdown(true)}
                  onBlur={() =>
                    setTimeout(() => setShowDebtorDropdown(false), 120)
                  }
                  style={{
                    width: "100%",
                    padding: 10,
                    marginTop: 6,
                    marginBottom: 8,
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                    fontSize: 16,
                    position: "relative",
                    zIndex: 2,
                  }}
                />
                {showDebtorDropdown && debtors.length > 0 && (
                  <div
                    className="qarz-debtor-dropdown"
                    style={{
                      ...debtorDropdownStyle,
                      position: "absolute",
                      left: 0,
                      top: debtorInputRef.current
                        ? debtorInputRef.current.offsetTop +
                          debtorInputRef.current.offsetHeight
                        : 44,
                      background: isLightTheme ? "#fff" : "#23273a",
                      maxHeight: 176,
                      overflowY: "auto",
                      borderRadius: 8,
                      boxShadow: "0 2px 8px #0001",
                      zIndex: 10001,
                      animation:
                        "dropdown-fade-in 0.18s cubic-bezier(0.4,2,0.6,1)",
                    }}
                  >
                    {debtors
                      .filter((d) =>
                        d.name
                          .toLowerCase()
                          .includes(debtorSearch.toLowerCase())
                      )
                      .map((d) => (
                        <div
                          key={d.id}
                          style={{
                            padding: "10px 12px",
                            minHeight: 44,
                            display: "flex",
                            alignItems: "center",
                            cursor: "pointer",
                            borderBottom: "1px solid #eee",
                            color: isLightTheme ? "#222" : "#fff",
                            background:
                              debtorSearch === d.name
                                ? isLightTheme
                                  ? "#f3f4f6"
                                  : "#374151"
                                : "inherit",
                            transition: "background 0.15s",
                          }}
                          onMouseDown={() => {
                            setSelectedDebtor(d);
                            setDebtorSearch(d.name);
                            setDebtorName(d.name);
                            setDebtorPhone(d.phone);
                            setShowDebtorDropdown(false);
                          }}
                        >
                          {d.name}{" "}
                          <span
                            style={{
                              color: "#888",
                              fontSize: 13,
                              marginLeft: 8,
                            }}
                          >{`${d.phone}`}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  fontWeight: 600,
                  color: isLightTheme ? "var(--color-text-primary)" : "#fff",
                }}
              >
                To'liq ism
              </label>
              <input
                type="text"
                value={debtorName}
                onChange={(e) => setDebtorName(e.target.value)}
                style={{
                  width: "100%",
                  padding: 10,
                  marginTop: 6,
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontSize: 16,
                }}
                placeholder="Ism"
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  fontWeight: 600,
                  color: isLightTheme ? "var(--color-text-primary)" : "#fff",
                }}
              >
                Telefon raqam
              </label>
              <input
                type="text"
                value={
                  debtorPhone.startsWith("+998")
                    ? debtorPhone
                    : `+998${debtorPhone.replace(/^\+?998?/, "")}`
                }
                onChange={(e) => {
                  let val = e.target.value;
                  // Always keep +998 at the start
                  if (!val.startsWith("+998"))
                    val =
                      "+998" + val.replace(/[^0-9]/g, "").replace(/^998/, "");
                  // Only allow up to 9 digits after +998
                  val =
                    "+998" +
                    val
                      .slice(4)
                      .replace(/[^0-9]/g, "")
                      .slice(0, 9);
                  setDebtorPhone(val);
                }}
                style={{
                  width: "100%",
                  padding: 10,
                  marginTop: 6,
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontSize: 16,
                }}
                placeholder="Telefon raqam"
                maxLength={13}
              />
            </div>
            {qarzError && (
              <div
                style={{
                  color: "#ef4444",
                  marginBottom: 10,
                  fontWeight: 600,
                }}
              >
                {qarzError}
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 8,
              }}
            >
              <button
                onClick={handleQarz}
                disabled={qarzLoading}
                style={{
                  flex: 1,
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "12px 0",
                  fontWeight: 700,
                  fontSize: 18,
                  cursor: qarzLoading ? "not-allowed" : "pointer",
                  opacity: qarzLoading ? 0.7 : 1,
                }}
              >
                {qarzLoading ? "Yuborilmoqda..." : "Tasdiqlash"}
              </button>
              <button
                onClick={() => setShowQarzModal(false)}
                style={{
                  flex: 1,
                  background: "#e5e7eb",
                  color: "#222",
                  border: "none",
                  borderRadius: 8,
                  padding: "12px 0",
                  fontWeight: 700,
                  fontSize: 18,
                  cursor: "pointer",
                }}
              >
                Bekor qilish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellPage;
