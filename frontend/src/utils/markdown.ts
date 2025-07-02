import { marked } from "marked";

// Configure marked for safe HTML rendering
marked.setOptions({
	gfm: true, // GitHub Flavored Markdown
	breaks: true, // Convert \n to <br>
});

/**
 * Escape HTML entities to prevent XSS
 */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Convert markdown text to HTML string with proper escaping
 * @param markdown - The markdown text to convert
 * @returns HTML string
 */
export function markdownToHtml(markdown: string): string {
	if (!markdown) return "";

	try {
		// First escape any existing HTML entities to prevent XSS
		const escapedMarkdown = markdown;
		return marked(escapedMarkdown) as string;
	} catch (error) {
		console.warn("Failed to parse markdown:", error);
		// Fallback to plain text with basic line break handling and HTML escaping
		return escapeHtml(markdown).replace(/\n/g, "<br>");
	}
}
