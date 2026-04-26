import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SotishIcon from "../assets/dashboard/sotish.svg";
import QarzIcon from "../assets/dashboard/qarz-icon.svg";
import { useLanguage } from "../i18n/LanguageContext.jsx";

const Sidebar = ({ user, getPlanIconClass }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  return (
    <aside className="sidebar">
      <div className="logo" />
      <span className="logo_underline"></span>
      <nav className="menu">
        <p className="sidebar-menu">{t("menu")}</p>
        <ul>
          <li
            className={location.pathname === "/dashboard" ? "active" : ""}
            onClick={() => navigate("/dashboard")}
          >
            <span className="icon home-icon" />
            {t("dashboard")}
          </li>
          <li
            className={location.pathname === "/hisobotlar" ? "active" : ""}
            onClick={() => navigate("/hisobotlar")}
          >
            <span className="icon history-icon" />
            {t("reports")}
          </li>
          <li
            className={location.pathname === "/mahsulotlar" ? "active" : ""}
            onClick={() => navigate("/mahsulotlar")}
          >
            <span className="icon products-icon" />
            {t("products")}
          </li>
          <li
            className={location.pathname === "/sotish" ? "active" : ""}
            onClick={() => navigate("/sotish")}
          >
            <img
              src={SotishIcon}
              alt={t("sell")}
              className="icon sotish-icon"
              style={{
                width: 20,
                height: 20,
                marginRight: 10,
                verticalAlign: "middle",
              }}
            />
            {t("sell")}
          </li>
          <li
            className={location.pathname === "/qarzlar" ? "active" : ""}
            onClick={() => navigate("/qarzlar")}
          >
            <img
              src={QarzIcon}
              alt={t("debts")}
              className="icon qarz-icon"
              style={{
                width: 20,
                height: 20,
                marginRight: 10,
                verticalAlign: "middle",
                display: "inline-block",
              }}
            />
            {t("debts")}
          </li>
          <li
            className={location.pathname === "/kalkulyator" ? "active" : ""}
            onClick={() => navigate("/kalkulyator")}
          >
            <span className="icon calculator-icon" />
            {t("calculator")}
          </li>
          <li
            className={location.pathname === "/ai-maslahat" ? "active" : ""}
            onClick={() => navigate("/ai-maslahat")}
          >
            <span className="icon ai-icon" />
            {t("aiAdvice")}
          </li>
        </ul>
      </nav>
      <div className="vip-plan">
        {user?.plan && (
          <span className={`plan-icon ${getPlanIconClass?.(user?.plan)}`} />
        )}
        {user?.plan} {t("plan")}
      </div>
    </aside>
  );
};

export default Sidebar;
