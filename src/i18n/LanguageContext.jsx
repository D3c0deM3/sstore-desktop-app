import React, { createContext, useContext, useMemo, useState } from "react";

const dictionaries = {
  uz: {
    menu: "Menu",
    dashboard: "Asosiy sahifa",
    reports: "Hisobotlar",
    products: "Mahsulotlar",
    sell: "Sotish",
    debts: "Qarzlar",
    calculator: "Kalkulyator",
    aiAdvice: "AI maslahat",
    plan: "PLAN",
    editProfile: "Profilni tahrirlash",
    lightTheme: "Yorqin mavzu",
    language: "Til",
    logout: "Chiqish",
    profileTitle: "Profil",
    profileSubtitle: "Do'kon ma'lumotlari, rasm va kirish sozlamalarini boshqaring.",
    storeImage: "Do'kon rasmi",
    storeImageHint: "Logo yoki do'kon rasmi",
    storeName: "Do'kon nomi",
    phoneNumber: "Telefon raqam",
    password: "Yangi parol",
    passwordHint: "O'zgartirmasangiz bo'sh qoldiring",
    removeImage: "Rasmni olib tashlash",
    save: "Saqlash",
    saving: "Saqlanmoqda...",
    cancel: "Bekor qilish",
    saved: "Profil muvaffaqiyatli saqlandi",
    requiredFields: "Do'kon nomi va telefon raqamni kiriting.",
    phoneInvalid: "Telefon raqam +998 bilan boshlanib, 13 ta belgidan iborat bo'lishi kerak.",
    uzbek: "O'zbek",
    russian: "Русский",
  },
  ru: {
    menu: "Меню",
    dashboard: "Главная",
    reports: "Отчеты",
    products: "Товары",
    sell: "Продажи",
    debts: "Долги",
    calculator: "Калькулятор",
    aiAdvice: "AI совет",
    plan: "ПЛАН",
    editProfile: "Редактировать профиль",
    lightTheme: "Светлая тема",
    language: "Язык",
    logout: "Выйти",
    profileTitle: "Профиль",
    profileSubtitle: "Управляйте данными магазина, изображением и настройками входа.",
    storeImage: "Изображение магазина",
    storeImageHint: "Логотип или фото магазина",
    storeName: "Название магазина",
    phoneNumber: "Номер телефона",
    password: "Новый пароль",
    passwordHint: "Оставьте пустым, если не меняете",
    removeImage: "Удалить изображение",
    save: "Сохранить",
    saving: "Сохранение...",
    cancel: "Отмена",
    saved: "Профиль успешно сохранен",
    requiredFields: "Введите название магазина и номер телефона.",
    phoneInvalid: "Номер должен начинаться с +998 и состоять из 13 символов.",
    uzbek: "O'zbek",
    russian: "Русский",
  },
};

const LanguageContext = createContext({
  language: "uz",
  setLanguage: () => {},
  t: (key) => key,
});

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(
    localStorage.getItem("sstoreLanguage") || "uz"
  );

  const setLanguage = (nextLanguage) => {
    const safeLanguage = dictionaries[nextLanguage] ? nextLanguage : "uz";
    localStorage.setItem("sstoreLanguage", safeLanguage);
    setLanguageState(safeLanguage);
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key) => dictionaries[language]?.[key] || dictionaries.uz[key] || key,
    }),
    [language]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
