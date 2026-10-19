import { useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";

// Keep in sync with the inline script in `index.html`, which applies the theme before first paint.
const KEY = "validator-reward-scanner.theme";
const dark = () => window.matchMedia("(prefers-color-scheme: dark)");

function read(): ThemeChoice {
	try {
		const v = localStorage.getItem(KEY);
		if (v === "light" || v === "dark") return v;
	} catch {
		// storage unavailable: follow the system
	}
	return "system";
}

function apply(choice: ThemeChoice) {
	const resolved = choice === "system" ? (dark().matches ? "dark" : "light") : choice;
	document.documentElement.dataset.theme = resolved;
}

export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
	const [choice, setChoice] = useState<ThemeChoice>(read);

	useEffect(() => {
		apply(choice);
		try {
			if (choice === "system") localStorage.removeItem(KEY);
			else localStorage.setItem(KEY, choice);
		} catch {
			// not remembered; still applied for this visit
		}
		if (choice !== "system") return;
		const mq = dark();
		const onChange = () => apply("system");
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [choice]);

	return [choice, setChoice];
}
