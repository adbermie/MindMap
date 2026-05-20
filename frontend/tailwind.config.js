/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        ink: {
          50: "#f8f7f4",
          100: "#eeece4",
          200: "#d8d4c6",
          900: "#1a1a1a",
          950: "#0f0f0f",
        },
      },
    },
  },
  plugins: [],
};
