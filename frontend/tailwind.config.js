/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Original
        ink: "#09131F",
        shell: "#EEF3F8",
        line: "#D6E0EA",
        mist: "#F7FAFC",
        success: "#36D8AE",
        wake: "#F5C96B",
        danger: "#E56F65",
        // New orange theme
        orange: {
          50: "#FFFBEB",
          100: "#FEF3C7",
          200: "#FDE68A",
          300: "#FCD34D",
          400: "#FDBA74",
          500: "#FB923C",
          600: "#F97316",
          700: "#EA580C",
          800: "#C2410C",
          900: "#92400E",
          950: "#451A03"
        },
        amber: {
          50: "#FEF3C7",
          100: "#FEF3C7",
          200: "#FED7AA",
          300: "#FDBA74"
        },
        brown: "#92400E"
      },
      boxShadow: {
        panel: "0 4px 6px -1px rgba(0, 0,0,0.1), 0 2px 4px -1px rgba(0, 0,0,0.06)", // Minimal shadow
        subtle: "0 1px 3px 0 rgba(0, 0,0,0.1)"
      },
      // Remove heavy animations for minimalism
    }
  },
  plugins: []
};
