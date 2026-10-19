import { AccountId } from "polkadot-api";
import { relayClient } from "./chains";

// Raw storage keys, read with `state_getStorage` rather than the typed API so that blocks under
// any past runtime decode the same way without fetching their metadata.
const SESSION_CURRENT_INDEX = "0xcec5070d609dd3497f72bde07fc96ba072763800a36a99fdfc7c10f6415f6ee6";
const SESSION_VALIDATORS = "0xcec5070d609dd3497f72bde07fc96ba088dcde934c658227ee1dfafcd6e16903";
/** Expected relay blocks per session (4h of 6s blocks); only a search hint. */
const BLOCKS_PER_SESSION_HINT = 2400;

const accountCodec = AccountId(0);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = <T = any>(method: string, params: unknown[]): Promise<T> =>
	relayClient()._request<T, unknown[]>(method, params);

function hexToBytes(hex: string): Uint8Array {
	const h = hex.startsWith("0x") ? hex.slice(2) : hex;
	const out = new Uint8Array(h.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
	return out;
}

/** SCALE compact integer: returns [value, bytes consumed]. */
function decodeCompact(b: Uint8Array, at: number): [number, number] {
	const mode = b[at] & 3;
	if (mode === 0) return [b[at] >> 2, 1];
	if (mode === 1) return [(b[at] | (b[at + 1] << 8)) >> 2, 2];
	if (mode === 2) return [((b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 2), 4];
	throw new Error("compact integer too large");
}

const u32le = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

export const blockHash = (n: number) => rpc<string>("chain_getBlockHash", [n]);

export async function finalizedNumber(): Promise<number> {
	const hash = await rpc<string>("chain_getFinalizedHead", []);
	const header = await rpc<{ number: string }>("chain_getHeader", [hash]);
	return parseInt(header.number, 16);
}

async function sessionIndexAt(n: number): Promise<number> {
	const raw = await rpc<string | null>("state_getStorage", [SESSION_CURRENT_INDEX, await blockHash(n)]);
	return raw ? u32le(hexToBytes(raw), 0) : 0;
}

/** `Session::Validators` as of block `n`; its order is the BABE authority order of that session. */
export async function sessionValidatorsAt(n: number): Promise<string[]> {
	const raw = await rpc<string | null>("state_getStorage", [SESSION_VALIDATORS, await blockHash(n)]);
	if (!raw) return [];
	const b = hexToBytes(raw);
	const [len, off] = decodeCompact(b, 0);
	const out: string[] = [];
	for (let i = 0; i < len; i++) out.push(accountCodec.dec(b.slice(off + i * 32, off + (i + 1) * 32)));
	return out;
}

/**
 * The first relay block of `session`, i.e. the block whose `on_initialize` rotated into it.
 *
 * Every block from there until the next session's first block notes its author into the points
 * that the relay chain reports to Asset Hub for `session`.
 */
export async function firstBlockOfSession(session: number, tip: { number: number; session: number }): Promise<number> {
	const guess = tip.number - (tip.session - session) * BLOCKS_PER_SESSION_HINT;
	// Widen a bracket around the guess until lo < first <= hi.
	let span = BLOCKS_PER_SESSION_HINT;
	let lo = Math.max(1, guess - span);
	let hi = Math.min(tip.number, guess + span);
	while ((await sessionIndexAt(lo)) >= session && lo > 1) {
		span *= 2;
		lo = Math.max(1, lo - span);
	}
	while ((await sessionIndexAt(hi)) < session) {
		if (hi === tip.number) throw new Error(`session ${session} has not started yet`);
		span *= 2;
		hi = Math.min(tip.number, hi + span);
	}
	while (hi - lo > 1) {
		const mid = Math.floor((lo + hi) / 2);
		if ((await sessionIndexAt(mid)) >= session) hi = mid;
		else lo = mid;
	}
	return hi;
}

/**
 * The BABE authority index that authored a block, from the `PreRuntime(BABE, PreDigest)` log of
 * its header. Every `PreDigest` variant (Primary, SecondaryPlain, SecondaryVRF) starts with the
 * `u32` authority index right after its variant byte.
 */
function babeAuthorIndex(logs: string[]): number | null {
	for (const log of logs) {
		const b = hexToBytes(log);
		// DigestItem::PreRuntime = 6, engine id "BABE".
		if (b[0] !== 6 || b[1] !== 0x42 || b[2] !== 0x41 || b[3] !== 0x42 || b[4] !== 0x45) continue;
		const [, lenBytes] = decodeCompact(b, 5);
		return u32le(b, 5 + lenBytes + 1);
	}
	return null;
}

/** BABE authority index of every block in `[from, to)`, scanned with `concurrency` workers. */
export async function scanAuthors(
	from: number,
	to: number,
	onProgress: (done: number) => void,
	concurrency = 48,
): Promise<Int32Array> {
	const authors = new Int32Array(to - from).fill(-1);
	let next = from;
	let done = 0;
	const worker = async () => {
		while (next < to) {
			const n = next++;
			const header = await rpc<{ digest: { logs: string[] } }>("chain_getHeader", [await blockHash(n)]);
			const idx = babeAuthorIndex(header.digest.logs);
			if (idx === null) throw new Error(`block ${n} has no BABE pre-digest`);
			authors[n - from] = idx;
			if (++done % 200 === 0) onProgress(done);
		}
	};
	await Promise.all(Array.from({ length: concurrency }, worker));
	onProgress(done);
	return authors;
}

export async function sessionTip(): Promise<{ number: number; session: number }> {
	const number = await finalizedNumber();
	return { number, session: await sessionIndexAt(number) };
}
