/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./src/**/*.{html,js,ts,jsx,tsx}", "./src/**/*.ts", "./src/components/*.ts", "./src/*.ts"],
	theme: {
		extend: {
			colors: {
				"vs-bg": "#1e1e1e",
				"vs-text": "#d4d4d4",
				"vs-muted": "#8c8c8c",
				"vs-accent": "#569cd6",
				"vs-user": "#6a9955",
				"vs-assistant": "#ce9178",
				"vs-warning": "#f48771",
				"vs-function": "#dcdcaa",
				"vs-type": "#4ec9b0",
				"vs-border": "#3e3e42",
				"vs-bg-secondary": "#2d2d30",
				"vs-nav": "#3e3e42",
				"vs-nav-hover": "#4a4a4e",
				"vs-nav-active": "#f48771",
				"vs-highlight": "#8b6914",
			},
		},
	},
	plugins: [],
};
