/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "PingFang SC",
          "Segoe UI",
          "Helvetica Neue",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        ink: "#171a1f",
        muted: "#68707d",
        line: "#e4e7ec",
        canvas: "#f7f8fa",
        brand: {
          DEFAULT: "#2f6feb",
          soft: "#eef3ff",
          ink: "#1f4fb8",
        },
      },
      boxShadow: {
        panel: "-18px 0 50px -24px rgb(15 23 42 / 0.25)",
        card: "0 1px 2px rgb(15 23 42 / 0.05), 0 8px 24px -16px rgb(15 23 42 / 0.18)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 50%" },
          "100%": { backgroundPosition: "-200% 50%" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "0.25", transform: "scale(0.85)" },
          "50%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 400ms ease-out both",
        shimmer: "shimmer 2.2s linear infinite",
        "pulse-dot": "pulse-dot 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
