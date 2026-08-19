import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        reelish: {
          bg: "#1A1614",
          surface: "#242019",
          elevated: "#2E2824",
          border: "#3D3530",
          accent: "#A04B28",
          accentHover: "#C45A32",
          cream: "#F4E8D8",
          muted: "#9A8F85",
          gold: "#C9A962",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "1.25rem",
        pill: "9999px",
      },
      boxShadow: {
        soft: "0 4px 24px rgba(0, 0, 0, 0.25)",
        glow: "0 0 40px rgba(160, 75, 40, 0.15)",
      },
    },
  },
  plugins: [],
};

export default config;
