import React from "react";

const NotificationPopup = ({ show, type, children }) => {
  if (!show) return null;
  return (
    <div className={`notification-icon-popup ${type}`}>
      {type === "success" ? (
        <span className="tick-popup-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" fill="#48bb78" fillOpacity="0.18" />
            <circle cx="24" cy="24" r="18" fill="#48bb78" fillOpacity="0.32" />
            <path
              className="tick-path"
              d="M16 25L22 31L33 19"
              stroke="#48bb78"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : (
        <span className="x-popup-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" fill="#f56565" fillOpacity="0.18" />
            <circle cx="24" cy="24" r="18" fill="#f56565" fillOpacity="0.32" />
            <path
              className="x-path"
              d="M18 18L30 30M30 18L18 30"
              stroke="#f56565"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
      {children}
    </div>
  );
};

export default NotificationPopup;
