import { useState } from "react";

/**
 * Open state of a collapsible section, kept in this browser under `key`: collapsed unless the
 * viewer left it open last time. Returns the state and a handler for the `toggle` event.
 */
export function useFold(key: string): [boolean, (open: boolean) => void] {
	const [open, setOpen] = useState(() => {
		try {
			return localStorage.getItem(key) === "true";
		} catch {
			return false;
		}
	});
	// Browsers also fire `toggle` when a details element is first rendered open; only a real change counts.
	const toggle = (next: boolean) => {
		if (next === open) return;
		setOpen(next);
		try {
			localStorage.setItem(key, String(next));
		} catch {
			// not remembered; still toggled for this visit
		}
	};
	return [open, toggle];
}
