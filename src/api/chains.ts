import { createClient, type PolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { dot, dotPeople, pah } from "@polkadot-api/descriptors";

// Endpoints are tried in order; the provider rotates to the next one on failure. The relay
// endpoints must be archive nodes: we read state and headers of blocks months in the past.
const RELAY_RPC = ["wss://rpc.polkadot.io", "wss://polkadot-rpc.n.dwellir.com", "wss://rpc.ibp.network/polkadot"];
const ASSET_HUB_RPC = [
	"wss://polkadot-asset-hub-rpc.polkadot.io",
	"wss://asset-hub-polkadot-rpc.n.dwellir.com",
	"wss://sys.ibp.network/asset-hub-polkadot",
];
const PEOPLE_RPC = ["wss://polkadot-people-rpc.polkadot.io", "wss://sys.ibp.network/people-polkadot"];

/** Points the relay chain credits a block author with (`StakingAhClient::PointsPerBlock`). */
export const POINTS_PER_BLOCK = 20;
/** Points per backed candidate (`polkadot_runtime_parachains::reward_points::BACKING_POINTS`). */
export const POINTS_PER_BACKING = 20;
export const SESSIONS_PER_ERA = 6;

let clients: { relay: PolkadotClient; ah: PolkadotClient; people: PolkadotClient } | null = null;

function get() {
	if (!clients) {
		clients = {
			relay: createClient(getWsProvider(RELAY_RPC)),
			ah: createClient(getWsProvider(ASSET_HUB_RPC)),
			people: createClient(getWsProvider(PEOPLE_RPC)),
		};
	}
	return clients;
}

export const relayClient = () => get().relay;
export const ahApi = () => get().ah.getTypedApi(pah);
export const peopleApi = () => get().people.getTypedApi(dotPeople);
export const relayApi = () => get().relay.getTypedApi(dot);

export function destroyClients() {
	if (!clients) return;
	clients.relay.destroy();
	clients.ah.destroy();
	clients.people.destroy();
	clients = null;
}
