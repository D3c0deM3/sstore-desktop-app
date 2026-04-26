import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProfileSection from "../components/ProfileSection";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { resolveMediaUrl } from "../utils/imageSource";
import "../styles/ProfileEditPage.css";

const ProfileEditPage = () => {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const [market, setMarket] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("market")) || {};
    } catch {
      return {};
    }
  });
  const [storeName, setStoreName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [storeImage, setStoreImage] = useState(null);
  const [storeImagePreview, setStoreImagePreview] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setStoreName(market.market_name || "");
    setPhoneNumber(market.phone_number || "");
    setStoreImagePreview(resolveMediaUrl(market.profile_picture));
  }, [market]);

  useEffect(() => {
    if (!storeImage) return undefined;
    const previewUrl = URL.createObjectURL(storeImage);
    setStoreImagePreview(previewUrl);
    setRemoveImage(false);
    return () => URL.revokeObjectURL(previewUrl);
  }, [storeImage]);

  const validate = () => {
    if (!storeName.trim() || !phoneNumber.trim()) return t("requiredFields");
    if (!phoneNumber.startsWith("+998") || phoneNumber.length !== 13) {
      return t("phoneInvalid");
    }
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("market_name", storeName.trim());
    formData.append("phone_number", phoneNumber.trim());
    formData.append("password", password);
    formData.append("remove_profile_picture", removeImage ? "true" : "false");
    if (storeImage) {
      formData.append("profile_picture", storeImage);
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");
      const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || "";
      const response = await fetch(`${apiBaseUrl}/api/profile/`, {
        method: "POST",
        headers: {
          Authorization: token ? `Token ${token}` : "",
        },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.message || "Profile update failed");
      }
      localStorage.setItem("market", JSON.stringify(data.market));
      setMarket(data.market);
      setPassword("");
      setStoreImage(null);
      setMessage(t("saved"));
      window.dispatchEvent(new Event("sstore:market-updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const clearImage = () => {
    setStoreImage(null);
    setStoreImagePreview("");
    setRemoveImage(true);
  };

  const user = {
    name: market.market_name,
    phone: market.phone_number,
    plan: market.plan,
    profileImage: market.profile_picture,
  };

  return (
    <div className="profile-edit-page">
      <div className="profile-edit-header">
        <div>
          <h1>{t("profileTitle")}</h1>
          <p>{t("profileSubtitle")}</p>
        </div>
        <ProfileSection user={user} />
      </div>

      <form className="profile-edit-panel" onSubmit={handleSubmit}>
        <div className="profile-edit-image-block">
          <label>{t("storeImage")}</label>
          <div className="profile-edit-image-row">
            <label className="profile-edit-image-picker">
              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  setStoreImage(event.target.files?.[0] || null)
                }
              />
              {storeImagePreview && !removeImage ? (
                <img src={storeImagePreview} alt={storeName} />
              ) : (
                <span>{storeName?.slice(0, 1)?.toUpperCase() || "S"}</span>
              )}
            </label>
            <div>
              <strong>{t("storeImageHint")}</strong>
              <button type="button" onClick={clearImage}>
                {t("removeImage")}
              </button>
            </div>
          </div>
        </div>

        <div className="profile-edit-grid">
          <label>
            <span>{t("storeName")}</span>
            <input
              type="text"
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
            />
          </label>
          <label>
            <span>{t("phoneNumber")}</span>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value.trim())}
            />
          </label>
          <label>
            <span>{t("password")}</span>
            <input
              type="password"
              value={password}
              placeholder={t("passwordHint")}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label>
            <span>{t("language")}</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option value="uz">{t("uzbek")}</option>
              <option value="ru">{t("russian")}</option>
            </select>
          </label>
        </div>

        {error && <div className="profile-edit-error">{error}</div>}
        {message && <div className="profile-edit-success">{message}</div>}

        <div className="profile-edit-actions">
          <button type="button" onClick={() => navigate(-1)}>
            {t("cancel")}
          </button>
          <button type="submit" disabled={loading}>
            {loading ? t("saving") : t("save")}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProfileEditPage;
