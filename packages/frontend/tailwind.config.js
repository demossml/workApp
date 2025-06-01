/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "media", // Активируем поддержку dark mode, автоматическое переключение на основе настроек устройства
  theme: {
    extend: {
      colors: {
        "custom-gray": "rgba(246, 246, 246, 1)", // Добавляем кастомный цвет
        "custom-gray-dark": "rgba(30, 30, 30, 1)", // Цвет для ночного режима
      },
    },
  },
  plugins: [],
};
