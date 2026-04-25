import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import "../styles/DashboardPage.css";
import { resolveMediaUrl } from "../utils/imageSource";

const ProfileSection = ({ user }) => {
  // Always call useOutletContext at the top level
  const outletContext = useOutletContext();
  const theme =
    outletContext?.theme ?? (localStorage.getItem("theme") || "dark");
  const setTheme = outletContext?.setTheme;

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  // Only use localTheme if setTheme is not available
  const [localTheme, setLocalTheme] = useState(
    localStorage.getItem("theme") || "dark"
  );
  const profileMenuRef = useRef(null);
  const navigate = useNavigate();

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

  const profileImageUrl = resolveMediaUrl(user?.profileImage);

  // Dropdown actions
  const handleLogout = async () => {
    const token = localStorage.getItem("token");
    try {
      await fetch("/api/logout/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : undefined,
        },
      });
    } catch (err) {
      // Optionally handle error (e.g., show notification)
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("market");
      localStorage.setItem("sstoreLoggedOut", "true");
      navigate("/"); // Redirect to landing page
    }
  };
  const handleEditProfile = () => navigate("/profile/edit");
  const handleChangeLanguage = () => {};

  const handleThemeToggle = () => {
    if (setTheme) {
      setTheme(theme === "dark" ? "light" : "dark");
    } else {
      const newTheme = localTheme === "dark" ? "light" : "dark";
      setLocalTheme(newTheme);
      document.documentElement.classList.toggle(
        "light-theme",
        newTheme === "light"
      );
      localStorage.setItem("theme", newTheme);
    }
  };

  // If using localTheme, update DOM/class when it changes
  useEffect(() => {
    if (!setTheme) {
      document.documentElement.classList.toggle(
        "light-theme",
        localTheme === "light"
      );
      localStorage.setItem("theme", localTheme);
    }
  }, [localTheme, setTheme]);

  return (
    <div className="profile-section" ref={profileMenuRef}>
      <div
        className="profile-container"
        onClick={() => setShowProfileMenu((prev) => !prev)}
        style={{ cursor: "pointer" }}
      >
        {profileImageUrl ? (
          <div
            className="profile-pic"
            style={{ backgroundImage: `url(${profileImageUrl})` }}
          />
        ) : (
          <div className="profile-pic default" />
        )}
        <div>
          <span>{user?.name || "User Name"}</span>
          <span>{user?.phone || "+998 97 201 13 17"}</span>
        </div>
        <span className="profile_arrow_icon" />
      </div>
      {showProfileMenu && (
        <div className="profile-dropdown">
          <button onClick={handleEditProfile}>Edit Profile</button>
          <div className="theme-toggle">
            <span>Light Theme</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={setTheme ? theme === "light" : localTheme === "light"}
                onChange={handleThemeToggle}
              />
              <span className="slider"></span>
            </label>
          </div>
          <button onClick={handleChangeLanguage}>Change Language</button>
          <button onClick={handleLogout}>Log Out</button>
        </div>
      )}
    </div>
  );
};

export default ProfileSection;
