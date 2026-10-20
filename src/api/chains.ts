import { createClient, type PolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { dot, dotPeople, pah } from "@polkadot-api/descriptors";
import { DEFAULT_SETTINGS, type Settings } from "../settings";

/** Points the relay chain credits a block author with (`StakingAhClient::PointsPerBlock`). */
export const POINTS_PER_BLOCK = 20;
/** Points per backed candidate (`polkadot_runtime_parachains::reward_points::BACKING_POINTS`). */
export const POINTS_PER_BACKING = 20;
export const SESSIONS_PER_ERA = 6;

let settings: Settings = DEFAULT_SETTINGS;
type Provider = Parameters<typeof createClient>[0];
interface Clients {
	relay: PolkadotClient;
	ah: PolkadotClient;
	people: PolkadotClient;
}

let clients: Clients | null = null;
let teardown: (() => void) | null = null;

/** Sets where chains are read from. Takes effect for clients created after this call. */
export function configure(s: Settings) {
	destroyClients();
	settings = s;
}

/**
 * Asset Hub and People providers through an in-browser smoldot light client. Loaded on demand so
 * the default RPC setup never downloads smoldot.
 */
async function smoldotProviders(): Promise<{ ah: Provider; people: Provider }> {
	const [{ startFromWorker }, { getSmProvider }, { default: SmWorker }, relaySpec, ahSpec, peopleSpec] =
		await Promise.all([
			import("polkadot-api/smoldot/from-worker"),
			import("polkadot-api/sm-provider"),
			import("polkadot-api/smoldot/worker?worker"),
			import("polkadot-api/chains/polkadot"),
			import("polkadot-api/chains/polkadot_asset_hub"),
			import("polkadot-api/chains/polkadot_people"),
		]);
	const smoldot = startFromWorker(new SmWorker());
	teardown = () => smoldot.terminate();
	const relay = await smoldot.addChain({ chainSpec: relaySpec.chainSpec });
	const [ah, people] = await Promise.all([
		smoldot.addChain({ chainSpec: ahSpec.chainSpec, potentialRelayChains: [relay] }),
		smoldot.addChain({ chainSpec: peopleSpec.chainSpec, potentialRelayChains: [relay] }),
	]);
	return { ah: getSmProvider(ah), people: getSmProvider(people) };
}

let pending: Promise<Clients> | null = null;

function get(): Promise<Clients> {
	if (clients) return Promise.resolve(clients);
	pending ??= (async () => {
		const relay = createClient(getWsProvider(settings.relayRpc));
		const providers =
			settings.source === "smoldot"
				? await smoldotProviders()
				: { ah: getWsProvider(settings.assetHubRpc), people: getWsProvider(settings.peopleRpc) };
		clients = { relay, ah: createClient(providers.ah), people: createClient(providers.people) };
		pending = null;
		return clients;
	})();
	return pending;
}

export const relayClient = async () => (await get()).relay;
export const ahApi = async () => (await get()).ah.getTypedApi(pah);
/** Hash of Asset Hub's finalized block, to read several storage items at one consistent state. */
export const ahFinalizedHash = async () => (await (await get()).ah.getFinalizedBlock()).hash;
export const peopleApi = async () => (await get()).people.getTypedApi(dotPeople);
export const relayApi = async () => (await get()).relay.getTypedApi(dot);

export function destroyClients() {
	if (clients) {
		clients.relay.destroy();
		clients.ah.destroy();
		clients.people.destroy();
		clients = null;
	}
	teardown?.();
	teardown = null;
}
