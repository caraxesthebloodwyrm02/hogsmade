/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
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
          bg: "rgb(var(--canvas-bg-rgb) / <alpha-value>)",
          surface: "rgb(var(--surface-rgb) / <alpha-value>)",
          raised: "rgb(var(--surface-raised-rgb) / <alpha-value>)",
        },
        surface: {
          raised: "rgb(var(--surface-raised-rgb) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          muted: "var(--ink-muted)",
          tertiary: "var(--ink-tertiary)",
          ghost: "var(--ink-ghost)",
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
          500: "var(--amber-400)",
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
          700: "var(--emerald-700)",
        },
        violet: {
          400: "var(--violet-400)",
          600: "var(--violet-600)",
        },
        sediment: {
          dark: "var(--sediment-dark)",
          mid: "var(--sediment-mid)",
          light: "var(--sediment-light)",
        },
      },
      fontFamily: {
        heading: "var(--font-heading)",
        body: "var(--font-body)",
        mono: "var(--font-mono)",
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
        surface: "var(--easing-surface)",
      },
      boxShadow: {
        "token-sm": "var(--shadow-sm)",
        "token-md": "var(--shadow-md)",
        "token-lg": "var(--shadow-lg)",
        "glow-emerald": "var(--glow-emerald)",
        "glow-amber": "var(--glow-amber)",
        "glow-rose": "var(--glow-rose)",
        "glow-signal": "var(--shadow-glow)",
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        full: "var(--radius-full)",
      },
      borderColor: {
        "border-color": "var(--border-color)",
        glass: "var(--glass-border)",
      },
      backdropBlur: {
        glass: "var(--glass-blur)",
      },
      backgroundColor: {
        glass: "var(--glass-fill)",
      },
    },
  },
  plugins: [],
};
