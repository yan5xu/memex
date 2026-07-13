import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { zh } from "./locales/zh";

export const languageOptions = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" }
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh }
    },
    fallbackLng: "en",
    supportedLngs: ["en", "zh"],
    load: "languageOnly",
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "mmx.language",
      caches: ["localStorage"]
    }
  });

export default i18n;
