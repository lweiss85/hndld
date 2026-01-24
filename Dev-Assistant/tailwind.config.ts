import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        "2xl": "1.375rem", /* 22px - premium cards */
        xl: "1rem", /* 16px - buttons */
        lg: ".75rem", /* 12px */
        md: ".5rem", /* 8px */
        sm: ".25rem", /* 4px */
      },
      colors: {
        // Flat / base colors (regular buttons)
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        surface2: "hsl(var(--surface2) / <alpha-value>)",
        highlight: "hsl(var(--highlight) / <alpha-value>)",
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          foreground: "hsl(var(--success-foreground) / <alpha-value>)",
          muted: "hsl(var(--success-muted) / <alpha-value>)",
          "muted-foreground": "hsl(var(--success-muted-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          foreground: "hsl(var(--warning-foreground) / <alpha-value>)",
          muted: "hsl(var(--warning-muted) / <alpha-value>)",
          "muted-foreground": "hsl(var(--warning-muted-foreground) / <alpha-value>)",
        },
        info: {
          DEFAULT: "hsl(var(--info) / <alpha-value>)",
          foreground: "hsl(var(--info-foreground) / <alpha-value>)",
          muted: "hsl(var(--info-muted) / <alpha-value>)",
          "muted-foreground": "hsl(var(--info-muted-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
          border: "hsl(var(--card-border) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
          border: "hsl(var(--popover-border) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          border: "var(--primary-border)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
          border: "var(--secondary-border)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
          border: "var(--muted-border)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          border: "var(--accent-border)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
          border: "var(--destructive-border)",
          muted: "hsl(var(--destructive-muted) / <alpha-value>)",
          "muted-foreground": "hsl(var(--destructive-muted-foreground) / <alpha-value>)",
        },
        ring: "hsl(var(--ring) / <alpha-value>)",
        chart: {
          "1": "hsl(var(--chart-1) / <alpha-value>)",
          "2": "hsl(var(--chart-2) / <alpha-value>)",
          "3": "hsl(var(--chart-3) / <alpha-value>)",
          "4": "hsl(var(--chart-4) / <alpha-value>)",
          "5": "hsl(var(--chart-5) / <alpha-value>)",
        },
        sidebar: {
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
          DEFAULT: "hsl(var(--sidebar) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
        },
        "sidebar-primary": {
          DEFAULT: "hsl(var(--sidebar-primary) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          border: "var(--sidebar-primary-border)",
        },
        "sidebar-accent": {
          DEFAULT: "hsl(var(--sidebar-accent) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "var(--sidebar-accent-border)"
        },
        status: {
          online: "rgb(34 197 94)",
          away: "rgb(245 158 11)",
          busy: "rgb(239 68 68)",
          offline: "rgb(156 163 175)",
        },
        'hndld-sage': {
          50: 'hsl(138 35% 97% / <alpha-value>)',
          100: 'hsl(138 30% 94% / <alpha-value>)',
          200: 'hsl(138 25% 88% / <alpha-value>)',
          300: 'hsl(138 22% 78% / <alpha-value>)',
          400: 'hsl(138 20% 65% / <alpha-value>)',
          500: 'hsl(138 18% 50% / <alpha-value>)',
          600: 'hsl(138 20% 42% / <alpha-value>)',
          700: 'hsl(138 22% 35% / <alpha-value>)',
        },
        'hndld-terra': {
          400: 'hsl(16 65% 60% / <alpha-value>)',
          500: 'hsl(16 70% 52% / <alpha-value>)',
          600: 'hsl(16 75% 45% / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        /* Typography Scale - hndld Design System
         * text-xs: 12px - timestamps, metadata, badges
         * text-sm: 14px - body text, labels, descriptions
         * text-base: 16px - primary body, form inputs
         * text-lg: 18px - section headers, card titles
         * text-xl: 20px - page subtitles, emphasis
         * text-2xl: 24px - page titles
         * text-3xl: 32px - hero text, onboarding headers
         */
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['2rem', { lineHeight: '2.25rem' }],
      },
      transitionTimingFunction: {
        'luxury': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'luxury-bounce': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "shimmer": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "slide-out-right": {
          "0%": { transform: "translateX(0)", opacity: "1" },
          "100%": { transform: "translateX(100%)", opacity: "0" },
        },
        "checkmark-draw": {
          "0%": { strokeDashoffset: "20" },
          "100%": { strokeDashoffset: "0" },
        },
        "heartbeat": {
          "0%, 100%": { transform: "scale(1)" },
          "25%": { transform: "scale(1.2)" },
          "50%": { transform: "scale(1)" },
          "75%": { transform: "scale(1.15)" },
        },
        "float-up": {
          "0%": { 
            opacity: "1", 
            transform: "translateY(0) scale(1)" 
          },
          "100%": { 
            opacity: "0", 
            transform: "translateY(-40px) scale(0.5)" 
          },
        },
        "ripple-out": {
          "0%": { 
            transform: "scale(0.5)", 
            opacity: "0.4" 
          },
          "100%": { 
            transform: "scale(2)", 
            opacity: "0" 
          },
        },
        "count-pop": {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.3)" },
          "100%": { transform: "scale(1)" },
        },
        "sparkle": {
          "0%, 100%": { opacity: "0", transform: "scale(0) rotate(0deg)" },
          "50%": { opacity: "1", transform: "scale(1) rotate(180deg)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "shimmer": "shimmer 2s infinite",
        "fade-in-up": "fade-in-up 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        "scale-in": "scale-in 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        "fade-in": "fade-in 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        "slide-in-right": "slide-in-right 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        "slide-out-right": "slide-out-right 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        "checkmark-draw": "checkmark-draw 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.2s forwards",
        "heartbeat": "heartbeat 0.6s ease-in-out",
        "float-up": "float-up 0.8s ease-out forwards",
        "ripple-out": "ripple-out 0.5s ease-out forwards",
        "count-pop": "count-pop 0.3s ease-out",
        "sparkle": "sparkle 0.6s ease-in-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
