/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'rgb(var(--c-paper) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        sun: 'rgb(var(--c-sun) / <alpha-value>)',
        teal: 'rgb(var(--c-teal) / <alpha-value>)',
        tutor: 'rgb(var(--c-tutor) / <alpha-value>)',
        grass: 'rgb(var(--c-grass) / <alpha-value>)',
        amber: 'rgb(var(--c-amber) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Fredoka', 'ui-rounded', 'system-ui', 'sans-serif'],
        body: ['Nunito', 'ui-rounded', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl2: '1.25rem', xl3: '1.75rem' },
      boxShadow: {
        card: '0 10px 30px -12px rgb(var(--c-ink) / 0.25)',
        tile: '0 4px 0 0 rgb(var(--c-ink) / 0.12)',
      },
    },
  },
  plugins: [],
};
