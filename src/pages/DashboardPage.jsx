import React, { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Line } from "react-chartjs-2";
import ChartDataLabels from "chartjs-plugin-datalabels";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  CategoryScale,
} from "chart.js";
import "../styles/DashboardPage.css";
import ProfileSection from "../components/ProfileSection";
import ProductImagePlaceholder from "../components/ProductImagePlaceholder";
import { resolveMediaUrl } from "../utils/imageSource";

ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  CategoryScale,
  ChartDataLabels
);

const DashboardPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // const { setTheme } = useOutletContext(); // Only use setTheme
  const [dashboardData, setDashboardData] = useState(
    location.state?.dashboardData || null
  );
  const [loading, setLoading] = useState(!dashboardData);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [products, setProducts] = useState([]);
  const [quantity, setQuantity] = useState(0);
  const [income, setIncom] = useState(0);
  const [expense, setExpense] = useState(0);
  const [soldProducts, setSoldProducts] = useState(0);
  const [boughtProducts, setBoughtProducts] = useState(0);
  const [productsBySells, setProductsBySells] = useState([]);
  const [profits, setProfits] = useState([]);
  const [current_months, setMonth] = useState([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  // Profile Menu State
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);

  // Chart Options State
  const [chartOptions, setChartOptions] = useState({
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: "rgba(255, 255, 255, 0.1)",
          drawBorder: false,
        },
        ticks: {
          color: "#a0aec0",
          callback: function (value) {
            if (value >= 1000000) return value / 1000000 + "M";
            else if (value >= 1000) return value / 1000 + "K";
            return value;
          },
          stepSize: 5000000,
        },
      },
      x: {
        grid: {
          color: "rgba(255, 255, 255, 0.1)",
          drawBorder: false,
        },
        ticks: {
          color: "#a0aec0",
        },
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true,
        callbacks: {
          label: function (context) {
            let value = context.parsed.y;
            if (value) {
              return value.toLocaleString() + " UZS";
            }
            return "";
          },
        },
      },
    },
    elements: {
      line: {
        tension: 0, // Sharp lines
      },
      point: {
        radius: 0, // Hide points by default
      },
    },
  });

  const formatCurrency = (value) =>
    `${Number(value || 0).toLocaleString()} UZS`;

  const apiBaseUrl =
    process.env.REACT_APP_API_BASE_URL || "";

  // Close profile menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        showProfileMenu &&
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target)
      ) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showProfileMenu]);

  // Fetch Dashboard Data
  useEffect(() => {
    const fetchDashboardData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/signin");
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/api/dashboard`, {
          method: "GET",
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },
        });

        const rawText = await response.text();
        if (rawText.trim()) {
          try {
            const data = JSON.parse(rawText);
            setDashboardData(data);
            setLoading(false);
          } catch (parseError) {
            console.error("Failed to parse JSON:", parseError);
            setError("Invalid server response. Please try again later.");
            setLoading(false);
          }
        } else {
          console.log("Response was empty.");
          setError("No dashboard data found.");
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        setError(
          "Failed to fetch dashboard data. Please check your connection."
        );
        setLoading(false);
      }
    };

    if (!dashboardData) {
      fetchDashboardData();
    }
  }, [dashboardData, navigate, apiBaseUrl]);

  // Process Dashboard Data
  useEffect(() => {
    if (dashboardData && Array.isArray(dashboardData)) {
      // Extract market data for user info
      const marketDataObj = dashboardData.find((item) => item.market_data);
      if (marketDataObj && marketDataObj.market_data) {
        const marketData = marketDataObj.market_data;
        setUser({
          name: marketData.market_name || "Unknown Market",
          phone: marketData.phone_number || "No phone number",
          plan: marketData.plan || "Unknown plan",
          profileImage: marketData.profile_picture
            ? `${marketData.profile_picture}`
            : null,
        });
      } else {
        setUser({
          name: "Unknown Market",
          phone: "No phone number",
          plan: "Unknown plan",
          profileImage: null,
        });
      }

      // Extract products
      const productsObj = dashboardData.find((item) => item.products);
      if (productsObj) {
        setProducts(productsObj.products || []);
      }

      // Extract quantity
      const quantityObj = dashboardData.find(
        (item) => item.quantity !== undefined
      );
      if (quantityObj) {
        setQuantity(quantityObj.quantity || 0);
      }

      // Extract incom
      const incomeObj = dashboardData.find((item) => item.income !== undefined);
      if (incomeObj) {
        setIncom(incomeObj.income || 0);
      }
      // Extract expense
      const expenseObj = dashboardData.find(
        (item) => item.expanses_total !== undefined
      );
      if (expenseObj) {
        setExpense(expenseObj.expanses_total || 0);
      }

      // Extract sold products
      const soldProductsObj = dashboardData.find(
        (item) => item.products_subbed !== undefined
      );
      if (soldProductsObj) {
        setSoldProducts(soldProductsObj.products_subbed || 0);
      }

      // Extract bought products
      const boughtProductsObj = dashboardData.find(
        (item) => item.products_added !== undefined
      );
      if (boughtProductsObj) {
        setBoughtProducts(boughtProductsObj.products_added || 0);
      }

      // Extract products by sells
      const productsBySellsObj = dashboardData.find(
        (item) => item.products_by_sells
      );
      if (productsBySellsObj) {
        setProductsBySells(productsBySellsObj.products_by_sells || []);
      }

      // Extract profits and set total revenue from last profit
      const profitsObj = dashboardData.find((item) => item.profit);
      if (profitsObj && Array.isArray(profitsObj.profit)) {
        setProfits(profitsObj.profit);
        const lastProfit = profitsObj.profit.at(-1); // last element of profit array
        setTotalRevenue(lastProfit || 0);
      }

      // Extract current month and set it to the variable called current_months
      const currentMonth = dashboardData.find((item) => item.current_month);
      if (currentMonth) {
        setMonth(currentMonth.current_month);
      } else {
        setMonth("January");
      }
    }
  }, [dashboardData, apiBaseUrl]);

  // Chart Data Preparation
  // Chart Data Preparation
  useEffect(() => {
    if (profits.length > 0) {
      // Validate profits data
      if (profits.every((val, i, arr) => val === arr[0])) {
        console.warn("All profit values are identical, chart may appear flat.");
      }
      if (profits.length < 2) {
        console.warn("Insufficient profit data points for meaningful chart.");
      }

      // Prepare data points
      const maxPoints = 7;
      const dataPoints = [];
      // const displayPoints = Math.min(profits.length, maxPoints);

      // Take the most recent days if more than maxPoints
      const startIndex = Math.max(0, profits.length - maxPoints);
      const recentProfits = profits.slice(startIndex);

      for (let i = 0; i < recentProfits.length; i++) {
        dataPoints.push(recentProfits[i]);
      }
      for (let i = recentProfits.length; i < maxPoints; i++) {
        dataPoints.push(null);
      }

      // Prepare labels
      const labels = [];
      const days = profits.length; // Total days of data
      const labelDays = []; // Days to label

      // Always include the 1st day
      labelDays.push(1);

      // For days 1 to 5, include every day if data exists
      if (days <= 5) {
        for (let i = 2; i <= Math.min(days, 5); i++) {
          labelDays.push(i);
        }
      } else {
        // Include every 5th day up to the last milestone
        for (let i = 5; i <= days; i += 5) {
          labelDays.push(i);
        }
        // Always include the last day if not already included
        if (days > 1 && !labelDays.includes(days)) {
          labelDays.push(days);
        }
      }

      // Generate labels for the selected days
      for (let i = 0; i < maxPoints; i++) {
        const dayIndex = startIndex + i + 1; // 1-based day index
        if (i < recentProfits.length && labelDays.includes(dayIndex)) {
          labels.push(`${dayIndex}-${current_months}`);
        } else {
          labels.push(""); // Empty label for non-labeled points
        }
      }

      // Calculate y-axis scale
      const maxProfit = Math.max(...recentProfits);
      const minProfit = Math.min(...recentProfits);
      const yAxisMax =
        Math.ceil((Math.max(maxProfit, 1) * 1.2) / 1000000) * 1000000 || 1000;
      const yAxisMin = Math.max(
        0,
        Math.floor((minProfit * 0.8) / 1000000) * 1000000
      );
      const yAxisRange = Math.max(yAxisMax - yAxisMin, 1000);

      // Set chart data
      setChartData({
        labels: labels,
        datasets: [
          {
            label: "Profit",
            data: dataPoints,
            borderColor: profits.length === 1 ? "transparent" : "#16a34a",
            backgroundColor: "rgba(22, 163, 74, 0.08)",
            segment: {
              borderColor: (ctx) =>
                profits.length === 1
                  ? "transparent"
                  : ctx.p0.parsed.y < ctx.p1.parsed.y
                  ? "#16a34a"
                  : "#dc2626",
            },
            tension: 0.28,
            borderWidth: profits.length === 1 ? 0 : 3,
            pointRadius: (context) => {
              const value = context.dataset.data[context.dataIndex];
              if (value === null) return 0;
              if (
                context.dataIndex > 0 &&
                context.dataIndex < dataPoints.length - 1
              ) {
                const prev = dataPoints[context.dataIndex - 1] || 0;
                const next = dataPoints[context.dataIndex + 1] || 0;
                if (
                  (value > prev && value > next) ||
                  (value < prev && value < next)
                ) {
                  return 6;
                }
              } else if (
                context.dataIndex === 0 ||
                context.dataIndex === dataPoints.length - 1
              ) {
                return 3;
              }
              return 0;
            },
            pointBackgroundColor: (context) => {
              const value = context.dataset.data[context.dataIndex];
              if (value === null) return "transparent";
              if (
                context.dataIndex > 0 &&
                context.dataIndex < dataPoints.length - 1
              ) {
                const prev = dataPoints[context.dataIndex - 1] || 0;
                const next = dataPoints[context.dataIndex + 1] || 0;
                if (
                  (value > prev && value > next) ||
                  (value < prev && value < next)
                ) {
                  return value >= prev ? "#16a34a" : "#dc2626";
                }
              } else if (
                context.dataIndex === 0 ||
                context.dataIndex === dataPoints.length - 1
              ) {
                return "#FFFFFF";
              }
              return "transparent";
            },
            pointBorderColor: (context) => {
              const value = context.dataset.data[context.dataIndex];
              if (value === null) return "transparent";
              if (
                context.dataIndex > 0 &&
                context.dataIndex < dataPoints.length - 1
              ) {
                const prev = dataPoints[context.dataIndex - 1] || 0;
                const next = dataPoints[context.dataIndex + 1] || 0;
                if (
                  (value > prev && value > next) ||
                  (value < prev && value < next)
                ) {
                  return value >= prev ? "#16a34a" : "#dc2626";
                }
              } else if (
                context.dataIndex === 0 ||
                context.dataIndex === dataPoints.length - 1
              ) {
                return "#FFFFFF";
              }
              return "transparent";
            },
            fill: true,
          },
        ],
      });

      // Update chart options
      setChartOptions({
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: false,
            suggestedMin: yAxisMin,
            suggestedMax: yAxisMax,
            grid: { color: "rgba(148, 163, 184, 0.16)", drawBorder: false },
            ticks: {
              color: "#64748b",
              callback: function (value) {
                if (value >= 1000000) return value / 1000000 + "M";
                else if (value >= 1000) return value / 1000 + "K";
                return value;
              },
              stepSize: Math.max(
                1,
                Math.ceil(yAxisRange / 5 / 1000000) * 1000000
              ),
            },
          },
          x: {
            grid: { color: "rgba(148, 163, 184, 0.12)", drawBorder: false },
            ticks: {
              color: "#64748b",
              callback: function (value, index, values) {
                return labels[index] || ""; // Only show defined labels
              },
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            callbacks: {
              label: function (context) {
                let value = context.parsed.y;
                if (value) {
                  return value.toLocaleString() + " UZS";
                }
                return "";
              },
            },
          },
          datalabels: {
            align: function (context) {
              const value = context.dataset.data[context.dataIndex];
              if (value === null) return "center";
              if (
                context.dataIndex > 0 &&
                context.dataIndex < dataPoints.length - 1
              ) {
                const prev = dataPoints[context.dataIndex - 1] || 0;
                const next = dataPoints[context.dataIndex + 1] || 0;
                if (value > prev && value > next) return "top";
                else if (value < prev && value < next) return "bottom";
              }
              return "center";
            },
            anchor: "center",
            color: function (context) {
              const value = context.dataset.data[context.dataIndex];
              if (value === null) return "transparent";
              if (
                context.dataIndex > 0 &&
                context.dataIndex < dataPoints.length - 1
              ) {
                const prev = dataPoints[context.dataIndex - 1] || 0;
                const next = dataPoints[context.dataIndex + 1] || 0;
                if (
                  (value > prev && value > next) ||
                  (value < prev && value < next)
                ) {
                  return value >= prev ? "#16a34a" : "#dc2626";
                }
              }
              return "transparent";
            },
            backgroundColor: function (context) {
              const value = context.dataset.data[context.dataIndex];
              if (value === null) return "transparent";
              if (
                context.dataIndex > 0 &&
                context.dataIndex < dataPoints.length - 1
              ) {
                const prev = dataPoints[context.dataIndex - 1] || 0;
                const next = dataPoints[context.dataIndex + 1] || 0;
                if (
                  (value > prev && value > next) ||
                  (value < prev && value < next)
                ) {
                  return "rgba(0, 0, 0, 0.6)";
                }
              }
              return "transparent";
            },
            borderRadius: 4,
            formatter: function (value) {
              if (value === null) return "";
              if (value >= 1000000) return (value / 1000000).toFixed(1) + "M";
              if (value >= 1000) return (value / 1000).toFixed(0) + "K";
              return value.toLocaleString();
            },
            display: function (context) {
              const value = context.dataset.data[context.dataIndex];
              if (value === null) return false;
              if (
                context.dataIndex > 0 &&
                context.dataIndex < dataPoints.length - 1
              ) {
                const prev = dataPoints[context.dataIndex - 1] || 0;
                const next = dataPoints[context.dataIndex + 1] || 0;
                return (
                  (value > prev && value > next) ||
                  (value < prev && value < next)
                );
              }
              return false;
            },
            font: { weight: "bold", size: 12 },
            padding: { top: 5, bottom: 5, left: 8, right: 8 },
            offset: 8,
          },
        },
        elements: {
          line: { tension: 0.28 },
          point: {
            radius: function (context) {
              const value = context.dataset.data[context.dataIndex];
              if (value === null) return 0;
              if (
                context.dataIndex > 0 &&
                context.dataIndex < dataPoints.length - 1
              ) {
                const prev = dataPoints[context.dataIndex - 1] || 0;
                const next = dataPoints[context.dataIndex + 1] || 0;
                if (
                  (value > prev && value > next) ||
                  (value < prev && value < next)
                ) {
                  return 6;
                }
              } else if (
                context.dataIndex === 0 ||
                context.dataIndex === dataPoints.length - 1
              ) {
                return 3;
              }
              return 0;
            },
            hoverRadius: 6,
          },
        },
        hover: { mode: "nearest", intersect: true },
      });

      // Remove debugging logs
    }
  }, [profits, current_months]);

  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Filter top selling products by search term (use productsBySells)
  const filteredTopSelling = productsBySells.filter(
    (product) =>
      product.name &&
      product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle click outside to close suggestions
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target)
      ) {
        setShowSuggestions(false);
      }
    }
    if (showSuggestions) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSuggestions]);

  // Scroll to and highlight the product in the table
  const handleSuggestionClick = (productId) => {
    setShowSuggestions(false);
    setSearchTerm("");
    setTimeout(() => {
      const row = document.getElementById(`top-selling-row-${productId}`);
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("highlight-row");
        setTimeout(() => row.classList.remove("highlight-row"), 1500);
      }
    }, 100);
  };

  // DEBUG: Log raw productsBySells for Top Selling table
  useEffect(() => {
    if (productsBySells && productsBySells.length > 0) {
      // console.log("[Top Selling Table] Raw productsBySells data:", productsBySells);
    } else {
      // console.log("[Top Selling Table] productsBySells is empty or undefined:", productsBySells);
    }
  }, [productsBySells]); // Add productsBySells to dependency array

  // DEBUG: Log dashboardData and productsBySells for Top Selling table
  useEffect(() => {
    // console.log("[DashboardPage] dashboardData:", dashboardData);
    // console.log("[DashboardPage] productsBySells:", productsBySells);
  }, [dashboardData, productsBySells]); // Add productsBySells to dependency array

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!dashboardData || dashboardData.length === 0)
    return <div className="no-data">No data yet! Add your first product.</div>;

  // Add this block to define productsByPrice for use in the table
  const productsByPriceObj =
    dashboardData && Array.isArray(dashboardData)
      ? dashboardData.find((item) => item.products_by_price)
      : null;
  const productsByPrice = productsByPriceObj
    ? productsByPriceObj.products_by_price || []
    : [];

  const statCards = [
    { title: "Mahsulotlar", value: quantity.toLocaleString(), tone: "neutral" },
    { title: "Sof daromad", value: formatCurrency(totalRevenue), tone: "success" },
    { title: "Daromad", value: formatCurrency(income), tone: "info" },
    { title: "Xarajat", value: formatCurrency(expense), tone: "danger" },
    {
      title: "Sotilgan tovarlar",
      value: soldProducts.toLocaleString(),
      tone: "success",
    },
    {
      title: "Kelgan tovarlar",
      value: boughtProducts.toLocaleString(),
      tone: "neutral",
    },
  ];

  return (
    <>
      <main className="main-content">
        <div className="search-container" style={{ position: "relative" }}>
          <span className="search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Qidiruv..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowSuggestions(e.target.value.length > 0);
            }}
            onFocus={() => setShowSuggestions(searchTerm.length > 0)}
            style={{ zIndex: 2, position: "relative" }}
          />
          {showSuggestions && filteredTopSelling.length > 0 && (
            <div
              ref={suggestionsRef}
              className="dashboard-search-suggestions"
              style={{
                position: "absolute",
                top: 40,
                left: 0,
                right: 0,
                background: "var(--color-bg-secondary)",
                borderRadius: 8,
                boxShadow: "0 4px 16px var(--color-shadow)",
                zIndex: 10,
                maxHeight: 260,
                overflowY: "auto",
                border: "1px solid var(--color-border)",
                padding: 0,
                margin: 0,
              }}
            >
              {filteredTopSelling.map((product) => {
                // Find matching product in productsByPrice by id
                const priceProduct = productsByPrice.find(
                  (p) => p.id === product.id
                );
                const imageSrc = resolveMediaUrl(
                  product.image_url || product.image
                );
                return (
                  <div
                    key={product.id}
                    className="dashboard-search-suggestion-item"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 16px",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--color-border)",
                      color: "var(--color-text-primary)",
                      background: "none",
                    }}
                    onClick={() => handleSuggestionClick(product.id)}
                  >
                    {imageSrc ? (
                      <img
                        src={imageSrc}
                        alt={product.name}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 6,
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <ProductImagePlaceholder
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 6,
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontWeight: 500,
                        fontSize: 15,
                        flex: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {product.name}
                    </span>
                    <span
                      style={{
                        color: "var(--color-text-secondary)",
                        fontSize: 13,
                      }}
                    >
                      {priceProduct?.price_per_quantity
                        ? Number(
                            priceProduct.price_per_quantity
                          ).toLocaleString()
                        : "0"}{" "}
                      UZS
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <section className="stats-cards">
          {statCards.map((stat) => (
            <div className={`card card-${stat.tone}`} key={stat.title}>
              <h3>{stat.title}</h3>
              <p>{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="chart-section">
          <div className="graph-head-content">
            <div className="graph-headline-left">
              <span className="graph-icon" />
              <h3>Oylik Sof Foyda</h3>
            </div>
            <span className="more-button">batafsil →</span>
          </div>
          <div className="chart-wrapper">
            {chartData ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <p>Loading chart...</p>
            )}
          </div>
        </section>

        <section className="top-selling-section">
          <div className="table-container">
            <h3>Eng ko'p sotilgan mahsulotlar</h3>
            <table>
              <thead>
                <tr>
                  <th>Mahsulot nomi</th>
                  <th>Sotilgan</th>
                  <th>Qoldiq</th>
                  <th>Jami daromad</th>
                </tr>
              </thead>
              <tbody>
                {filteredTopSelling.length > 0 ? (
                  filteredTopSelling.map((product) => {
                    // Find matching product in productsByPrice by id
                    const priceProduct = productsByPrice.find(
                      (p) => p.id === product.id
                    );
                    const imageSrc = resolveMediaUrl(
                      product.image_url || product.image
                    );
                    return (
                      <tr key={product.id} id={`top-selling-row-${product.id}`}>
                        <td
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          {imageSrc ? (
                            <img
                              src={imageSrc}
                              alt={product.name}
                              className="product-table-thumb"
                            />
                          ) : (
                            <ProductImagePlaceholder className="product-table-thumb" />
                          )}
                          <span
                            style={{
                              marginLeft: 14,
                            }}
                          >
                            {product.name}
                          </span>
                        </td>
                        <td>
                          {(product.total_subtracted || 0).toLocaleString()}{" "}
                          {product.quantity_type}
                        </td>
                        <td>
                          {product.quantity.toLocaleString()}{" "}
                          {product.quantity_type}
                        </td>
                        <td>
                          {(
                            priceProduct?.total_sold_price || 0
                          ).toLocaleString()}{" "}
                          UZS
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="4" className="text-center">
                      No sales data available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <div className="right-column">
        <ProfileSection user={user} />
        <div className="table-container products-table bg">
          <table>
            <thead>
              <tr>
                <th>Mahsulot</th>
                <th>Miqdori</th>
              </tr>
            </thead>
            <tbody>
              {products.length > 0 ? (
                products.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.quantity}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="2" className="text-center">
                    No products available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <style>{`
        .dashboard-search-suggestions::-webkit-scrollbar {
          width: 6px;
        }
        .dashboard-search-suggestions::-webkit-scrollbar-thumb {
          background: var(--color-border);
          border-radius: 6px;
        }
        .dashboard-search-suggestion-item:hover {
          background: var(--color-hover);
        }
        .highlight-row {
          background: var(--color-success-bg) !important;
          transition: background 0.5s;
        }
      `}</style>
    </>
  );
};

export default DashboardPage;
