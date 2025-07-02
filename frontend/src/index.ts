import { ClaudeApp } from "./app";
import "./components/simple-conversation-view";
import "./components/raw-pairs-view";
import "./components/json-view";

// Inject CSS styles into the page
declare const __CSS_CONTENT__: string;
const css = __CSS_CONTENT__;
if (css && css !== "__CSS_CONTENT__") {
	const style = document.createElement("style");
	style.textContent = css;
	document.head.appendChild(style);
}

// Initialize the application when DOM is ready
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initApp);
} else {
	initApp();
}

function initApp() {
	const app = new ClaudeApp();
	const appElement = document.getElementById("app");
	if (appElement) {
		appElement.appendChild(app);
	} else {
		console.error("App mount point not found");
	}
}
