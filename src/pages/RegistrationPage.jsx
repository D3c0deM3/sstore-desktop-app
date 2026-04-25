import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import "../styles/RegistrationPage.css";
import { desktopApiPost } from "../desktop/localApiBridge";
import { isDesktopApp } from "../desktop/tauriClient";

const RegistrationPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(
    location.pathname === "/register" ? "register" : "login"
  );
  const [storeName, setStoreName] = useState("");
  const [storeImage, setStoreImage] = useState(null);
  const [storeImagePreview, setStoreImagePreview] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("token")) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    setActiveTab(location.pathname === "/register" ? "register" : "login");
    setErrorMessage("");
  }, [location.pathname]);

  useEffect(() => {
    if (!storeImage) {
      setStoreImagePreview("");
      return undefined;
    }

    const previewUrl = URL.createObjectURL(storeImage);
    setStoreImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [storeImage]);

  const saveSession = (data) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("market", JSON.stringify(data.market));
    localStorage.removeItem("sstoreLoggedOut");
    navigate("/dashboard", { replace: true });
  };

  const validateForm = () => {
    if (!phoneNumber || !password) {
      return "Please fill all required fields.";
    }

    if (activeTab === "register" && !storeName.trim()) {
      return "Please enter the store name.";
    }

    if (!phoneNumber.startsWith("+998") || phoneNumber.length !== 13) {
      return "Phone number must start with +998 and be 13 characters long.";
    }

    if (activeTab === "register" && password !== confirmPassword) {
      return "Passwords do not match.";
    }

    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || "";
      let response;

      if (activeTab === "login") {
        const payload = {
          phone_number: phoneNumber,
          password,
        };
        response = isDesktopApp()
          ? await desktopApiPost("/api/login/", payload)
          : await axios.post(`${apiBaseUrl}/api/login/`, payload);
      } else {
        const formData = new FormData();
        formData.append("phone_number", phoneNumber);
        formData.append("market_name", storeName.trim());
        formData.append("password", password);
        if (storeImage) {
          formData.append("profile_picture", storeImage);
        }

        response = isDesktopApp()
          ? await desktopApiPost("/api/signup/", formData)
          : await axios.post(`${apiBaseUrl}/api/signup/`, formData);
      }

      saveSession(response.data);
    } catch (error) {
      const serverMessage =
        error.response?.data?.message || error.response?.data?.error;
      setErrorMessage(serverMessage || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setErrorMessage("");
    navigate(tab === "register" ? "/register" : "/signin", { replace: true });
  };

  return (
    <div className="registration-container">
      <div className="form-card">
        <div className="tabs">
          <button
            type="button"
            className={`tab ${activeTab === "login" ? "active" : ""}`}
            onClick={() => switchTab("login")}
          >
            LOGIN
          </button>
          <div className="divider" />
          <button
            type="button"
            className={`tab ${activeTab === "register" ? "active" : ""}`}
            onClick={() => switchTab("register")}
          >
            REGISTER
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          {activeTab === "register" && (
            <>
              <label className="store-image-picker">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setStoreImage(event.target.files?.[0] || null)
                  }
                />
                <span
                  className="store-image-preview"
                  style={
                    storeImagePreview
                      ? { backgroundImage: `url(${storeImagePreview})` }
                      : undefined
                  }
                >
                  {!storeImagePreview && "Logo"}
                </span>
                <span className="store-image-copy">
                  <strong>Store image</strong>
                  <small>Logo or storefront photo</small>
                </span>
              </label>

              <input
                type="text"
                placeholder="Store name"
                value={storeName}
                onChange={(event) => setStoreName(event.target.value)}
              />
            </>
          )}

          <input
            type="tel"
            placeholder="+998 phone number"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value.trim())}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {activeTab === "register" && (
            <input
              type="password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          )}
          <button type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : activeTab === "login"
              ? "LOGIN"
              : "CREATE STORE"}
          </button>
        </form>

        {errorMessage && <div className="error-message">{errorMessage}</div>}
      </div>
    </div>
  );
};

export default RegistrationPage;
