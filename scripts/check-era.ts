// Scans one era end to end and cross-checks the result against Asset Hub's era points.
// Usage: bun scripts/check-era.ts [era]
import { fetchOverview, scanEra, endSessionOf } from "../src/api/eras";
import { destroyClients, relayApi, POINTS_PER_BLOCK } from "../src/api/chains";
import { blockHash, sessionValidatorsAt, finalizedNumber } from "../src/api/relay";

// The hardcoded raw keys must agree with the typed API.
const fin = await finalizedNumber();
const hash = await blockHash(fin);
const typed = await (await relayApi()).query.Session.Validators.getValue({ at: hash });
const raw = await sessionValidatorsAt(fin);
if (typed.join() !== raw.join()) throw new Error("raw Session.Validators decode mismatch");
console.log(`raw storage decode ok (${raw.length} validators)`);

const ov = await fetchOverview(console.log);
const era = ov.eras.find((e) => e.era === Number(process.argv[2] ?? ov.eras[0].era))!;
console.log(`era ${era.era}: sessions from ${era.startSession}${era.startSessionInferred ? " (inferred)" : ""}, total ${era.totalPoints}`);
let last = 0;
const scan = await scanEra(era, endSessionOf(era, ov), (m, f) => { if (f - last > 0.1 || f === 1) { console.log(m); last = f; } });
console.log(scan.sessions);

const points = new Map(era.individual);
const blocks = scan.toBlock - scan.fromBlock;
const authorPts = blocks * POINTS_PER_BLOCK;
const notInPoints = Object.keys(scan.authored).filter((s) => !points.has(s));
const exceeding = Object.entries(scan.authored).filter(([s, b]) => b * POINTS_PER_BLOCK > (points.get(s) ?? 0));
console.log({ blocks, authorPts, share: (authorPts / era.totalPoints * 100).toFixed(3) + "%", authors: Object.keys(scan.authored).length, notInPoints: notInPoints.length, exceeding: exceeding.length });
const top = Object.entries(scan.authored).sort((a, b) => b[1] - a[1]).slice(0, 3);
console.log("top authors", top.map(([s, b]) => [s, b, points.get(s)]));
destroyClients();
process.exit(0);
