import React, { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";

const getPlanIconClass = (planType) => {
  if (!planType) return "";
  const planTypeLower = planType.toLowerCase();
  if (planTypeLower.includes("basic")) return "basic";
  if (planTypeLower.includes("pro")) return "pro";
  if (planTypeLower.includes("vip")) return "vip";
  return "basic";
};

const DashboardLayout = () => {
  const [user, setUser] = useState({});
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");
  const location = useLocation();
  const loadUser = () => {
    // Example: fetch user from localStorage or API
    const market = JSON.parse(localStorage.getItem("market"));
    if (market) {
      setUser({
        name: market.market_name,
        phone: market.phone_number,
        plan: market.plan,
        profileImage: market.profile_picture,
      });
    }
  };

  useEffect(() => {
    loadUser();
    window.addEventListener("sstore:market-updated", loadUser);
    return () => window.removeEventListener("sstore:market-updated", loadUser);
  }, []);

  // Theme toggling logic (persistent across all dashboard pages)
  useEffect(() => {
    document.documentElement.classList.toggle("light-theme", theme === "light");
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Only show right column for dashboard page
  const showRightColumn = location.pathname === "/dashboard";

  return (
    <div className={`dashboard${theme === "light" ? " light-theme" : ""}`}>
      <Sidebar user={user} getPlanIconClass={getPlanIconClass} />
      <div
        className={`content-wrapper${
          !showRightColumn ? " no-right-column" : ""
        }`}
      >
        <Outlet context={{ theme, setTheme }} />
      </div>
    </div>
  );
};

export default DashboardLayout;
