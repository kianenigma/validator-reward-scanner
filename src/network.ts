/** The relay chains the dashboard can read, each with its Asset Hub and People chain. */
export type NetworkId = "polkadot" | "westend";

export interface Network {
	id: NetworkId;
	name: string;
	token: { symbol: string; decimals: number };
	/**
	 * SS58 prefix of the relay chain and Asset Hub. Stashes decoded from relay storage must encode
	 * exactly as papi encodes Asset Hub's, which uses the chain's own prefix.
	 */
	ss58: number;
	/** Expected relay blocks per session; only a search hint. */
	blocksPerSession: number;
	/** Default endpoints, tried in order. */
	rpc: { relay: string[]; assetHub: string[]; people: string[] };
	/** Relay, Asset Hub and People chain specs for smoldot, loaded on demand. */
	chainSpecs: () => Promise<[relay: string, assetHub: string, people: string]>;
	/** Prefix of this network's settings and IndexedDB scan cache, so networks never share them. */
	storageKey: string;
}

const specs = (...mods: Promise<{ chainSpec: string }>[]) =>
	Promise.all(mods).then((m) => m.map((x) => x.chainSpec) as [string, string, string]);

export const NETWORKS: Record<NetworkId, Network> = {
	polkadot: {
		id: "polkadot",
		name: "Polkadot",
		token: { symbol: "DOT", decimals: 10 },
		ss58: 0,
		// 4h of 6s blocks.
		blocksPerSession: 2400,
		rpc: {
			relay: ["wss://rpc.polkadot.io", "wss://polkadot-rpc.n.dwellir.com", "wss://rpc.ibp.network/polkadot"],
			assetHub: [
				"wss://polkadot-asset-hub-rpc.polkadot.io",
				"wss://asset-hub-polkadot-rpc.n.dwellir.com",
				"wss://sys.ibp.network/asset-hub-polkadot",
			],
			people: ["wss://polkadot-people-rpc.polkadot.io", "wss://sys.ibp.network/people-polkadot"],
		},
		chainSpecs: () =>
			specs(
				import("polkadot-api/chains/polkadot"),
				import("polkadot-api/chains/polkadot_asset_hub"),
				import("polkadot-api/chains/polkadot_people"),
			),
		// Unsuffixed: the keys used before networks were selectable.
		storageKey: "validator-reward-scanner",
	},
	westend: {
		id: "westend",
		name: "Westend",
		token: { symbol: "WND", decimals: 12 },
		ss58: 42,
		// 1h of 6s blocks.
		blocksPerSession: 600,
		rpc: {
			relay: ["wss://westend-rpc.polkadot.io", "wss://westend-rpc.n.dwellir.com", "wss://rpc.ibp.network/westend"],
			assetHub: [
				"wss://westend-asset-hub-rpc.polkadot.io",
				"wss://asset-hub-westend-rpc.n.dwellir.com",
				"wss://sys.ibp.network/asset-hub-westend",
			],
			people: ["wss://westend-people-rpc.polkadot.io", "wss://sys.ibp.network/people-westend"],
		},
		chainSpecs: () =>
			specs(
				import("polkadot-api/chains/westend2"),
				import("polkadot-api/chains/westend2_asset_hub"),
				import("polkadot-api/chains/westend2_people"),
			),
		storageKey: "validator-reward-scanner.westend",
	},
};

const KEY = "validator-reward-scanner.network";
const isId = (v: unknown): v is NetworkId => typeof v === "string" && v in NETWORKS;

/** `NETWORK=westend` for the CLI scripts, else the choice saved in this browser. */
function chosen(): NetworkId {
	const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.NETWORK;
	if (isId(env)) return env;
	try {
		const saved = localStorage.getItem(KEY);
		if (isId(saved)) return saved;
	} catch {
		// no storage: the default
	}
	return "polkadot";
}

/**
 * The network this page reads. Fixed for the page's lifetime: switching saves the choice and
 * reloads, which also drops every open connection and running scan of the old network.
 */
export const NETWORK: Network = NETWORKS[chosen()];

export function switchNetwork(id: NetworkId) {
	try {
		localStorage.setItem(KEY, id);
	} catch {
		// not remembered, so the reload comes back to the same network
	}
	location.reload();
}
