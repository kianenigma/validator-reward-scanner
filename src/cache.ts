import type { EraScan } from "./types";

// Era scans take a minute of RPC calls each and never change once an era concluded, so they are
// kept in IndexedDB. Any failure here just means re-scanning.
const DB = "validator-reward-scanner";
const STORE = "scans";

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "era" });
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function loadScans(): Promise<Map<number, EraScan>> {
	try {
		const db = await open();
		const all = await new Promise<EraScan[]>((resolve, reject) => {
			const req = db.transaction(STORE).objectStore(STORE).getAll();
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		return new Map(all.map((s) => [s.era, s]));
	} catch {
		return new Map();
	}
}

export async function saveScan(scan: EraScan): Promise<void> {
	try {
		const db = await open();
		db.transaction(STORE, "readwrite").objectStore(STORE).put(scan);
	} catch {
		// not persisted; the scan is still shown for this visit
	}
}

export async function deleteScan(era: number): Promise<void> {
	try {
		const db = await open();
		db.transaction(STORE, "readwrite").objectStore(STORE).delete(era);
	} catch {
		// nothing to do
	}
}
