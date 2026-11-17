import { NETWORK } from "./network";

/** Where the dashboard reads each chain from. */
export interface Settings {
	/**
	 * How Asset Hub and the People chain are reached. The relay chain is always read over RPC: the
	 * authorship scan needs headers and state of months-old blocks, which only archive nodes keep.
	 */
	source: "rpc" | "smoldot";
	// Endpoints are tried in order; the provider rotates to the next one on failure.
	relayRpc: string[];
	assetHubRpc: string[];
	peopleRpc: string[];
}

/** Defaults of the network this page reads. */
export const DEFAULT_SETTINGS: Settings = {
	source: "rpc",
	relayRpc: NETWORK.rpc.relay,
	assetHubRpc: NETWORK.rpc.assetHub,
	peopleRpc: NETWORK.rpc.people,
};

// Per network, so each keeps its own endpoints.
const KEY = `${NETWORK.storageKey}.settings`;

export function loadSettings(): Settings {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return DEFAULT_SETTINGS;
		const s = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as Settings;
		const urls = (v: unknown, fallback: string[]) =>
			Array.isArray(v) && v.length > 0 && v.every((u) => typeof u === "string") ? v : fallback;
		return {
			source: s.source === "smoldot" ? "smoldot" : "rpc",
			relayRpc: urls(s.relayRpc, DEFAULT_SETTINGS.relayRpc),
			assetHubRpc: urls(s.assetHubRpc, DEFAULT_SETTINGS.assetHubRpc),
			peopleRpc: urls(s.peopleRpc, DEFAULT_SETTINGS.peopleRpc),
		};
	} catch {
		return DEFAULT_SETTINGS;
	}
}

/** Saves `settings`, or clears them when they equal the defaults. */
export function saveSettings(settings: Settings) {
	try {
		if (JSON.stringify(settings) === JSON.stringify(DEFAULT_SETTINGS)) localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, JSON.stringify(settings));
	} catch {
		// not remembered; applies to this visit only
	}
}
