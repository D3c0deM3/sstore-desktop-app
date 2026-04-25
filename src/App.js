import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import RegistrationPage from "./pages/RegistrationPage.jsx";
import "./styles/global.css";
import PlanPage from "./pages/PlanPage.jsx";
import DashboardLayout from "./components/DashboardLayout.jsx";
import PrivateRoute from "./components/PrivateRoute.jsx";
import Dashboardpage from "./pages/DashboardPage.jsx";
import ProductsPage from "./pages/ProductsPage.jsx";
import SellPage from "./pages/SellPage.jsx";
import QarzlarPage from "./pages/QarzlarPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import CalculatorPage from "./pages/CalculatorPage.jsx";
import AiAdvicePage from "./pages/AiAdvicePage.jsx";
import { useDesktopBackend } from "./desktop/useDesktopBackend.js";

const RootRedirect = () => {
  const token = localStorage.getItem("token");
  return <Navigate to={token ? "/dashboard" : "/signin"} replace />;
};

function App() {
  const desktopBackend = useDesktopBackend();

  if (desktopBackend.error) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#101820",
          color: "#f8fafc",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 10 }}>
            Desktop backend failed to start
          </h1>
          <p style={{ color: "#94a3b8", maxWidth: 620 }}>
            {desktopBackend.error}
          </p>
        </div>
      </div>
    );
  }

  if (!desktopBackend.ready) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#101820",
          color: "#f8fafc",
          fontWeight: 700,
        }}
      >
        SStore yuklanmoqda...
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/signin" element={<RegistrationPage />} />
        <Route path="/register" element={<RegistrationPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <DashboardLayout />
            </PrivateRoute>
          }
        >
          <Route path="dashboard" element={<Dashboardpage />} />
          <Route path="hisobotlar" element={<ReportsPage />} />
          <Route path="mahsulotlar" element={<ProductsPage />} />
          <Route path="qarzlar" element={<QarzlarPage />} />
          <Route path="sotish" element={<SellPage />} />
          <Route path="kalkulyator" element={<CalculatorPage />} />
          <Route path="ai-maslahat" element={<AiAdvicePage />} />
        </Route>
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </Router>
  );
}

export default App;
