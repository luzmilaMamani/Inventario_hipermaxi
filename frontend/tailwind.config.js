/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#1769FF",
          blueDark: "#0D4FC4",
          orange: "#F47B20",
          orangeDark: "#C95A0A",
          red: "#F47B20",
          redDark: "#C95A0A",
          yellow: "#FFC247",
          gray: "#E7EDF6",
          dark: "#15233D",
          panel: "#F5F8FD",
          nav: "#101D35",
          navMuted: "#AABBD4",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};