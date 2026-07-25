/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  // Preflight is Tailwind's global CSS reset — disabled here so it doesn't
  // touch the rest of Orbit, which is styled with plain inline styles.
  // Tailwind's utility classes (used by the Budget tab) still work fine.
  corePlugins: { preflight: false },
  theme: {
    extend: {},
  },
  plugins: [],
};
