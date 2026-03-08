/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        canvas: {
          bg: "var(--canvas-bg)",
          surface: "var(--surface)",
          raised: "var(--surface-raised)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          muted: "var(--ink-muted)",
        },
        teal: {
          50: "var(--teal-50)",
          100: "var(--teal-100)",
          200: "var(--teal-200)",
          500: "var(--teal-500)",
          600: "var(--teal-600)",
          700: "var(--teal-700)",
        },
        amber: {
          100: "var(--amber-100)",
          400: "var(--amber-400)",
          600: "var(--amber-600)",
        },
        rose: {
          100: "var(--rose-100)",
          500: "var(--rose-500)",
          600: "var(--rose-600)",
        },
        emerald: {
          100: "var(--emerald-100)",
          500: "var(--emerald-500)",
          600: "var(--emerald-600)",
        },
      },
      fontFamily: {
        heading: "var(--font-heading)",
        body: "var(--font-body)",
      },
      spacing: {
        xs: "var(--space-xs)",
        "sm-token": "var(--space-sm)",
        "md-token": "var(--space-md)",
        "lg-token": "var(--space-lg)",
        "xl-token": "var(--space-xl)",
        "2xl-token": "var(--space-2xl)",
        touch: "var(--touch-target-min)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        normal: "var(--duration-normal)",
        slow: "var(--duration-slow)",
      },
      transitionTimingFunction: {
        default: "var(--easing-default)",
        bounce: "var(--easing-bounce)",
      },
      boxShadow: {
        "token-sm": "var(--shadow-sm)",
        "token-md": "var(--shadow-md)",
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        full: "var(--radius-full)",
      },
    },
  },
  plugins: [],
};
