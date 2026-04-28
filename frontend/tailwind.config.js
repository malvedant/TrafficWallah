/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#09131F",
        shell: "#EEF3F8",
        line: "#D6E0EA",
        mist: "#F7FAFC",
        success: "#36D8AE",
        wake: "#F5C96B",
        danger: "#E56F65"
      },
      boxShadow: {
        panel: "0 16px 48px rgba(9, 19, 31, 0.08)"
      },
      keyframes: {
        drift: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" }
        },
        pulseSlow: {
          "0%, 100%": { transform: "scale(0.95)", opacity: "0.7" },
          "50%": { transform: "scale(1.1)", opacity: "1" }
        },
        radar: {
          "0%": { transform: "scale(0.7)", opacity: "0.55" },
          "80%": { transform: "scale(1.5)", opacity: "0" },
          "100%": { transform: "scale(1.5)", opacity: "0" }
        }
      },
      animation: {
        drift: "drift 6s ease-in-out infinite",
        pulseSlow: "pulseSlow 2s ease-in-out infinite",
        radar: "radar 2s ease-out infinite"
      }
    }
  },
  plugins: []
};
