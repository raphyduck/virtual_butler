/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f5ff',
          100: '#e0eaff',
          500: '#4f72e8',
          600: '#3b5bd9',
          700: '#2d47b8',
        },
      },
    },
  },
  plugins: [],
};
