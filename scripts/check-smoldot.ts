// Reads era points and identities through smoldot, as the "Smoldot light client" setting does.
// The app runs smoldot in a web worker; this uses the in-process build of the same client.
// Usage: [NETWORK=westend] bun scripts/check-smoldot.ts
import { createClient } from "polkadot-api";
import { getSmProvider } from "polkadot-api/sm-provider";
import { start } from "polkadot-api/smoldot";
import { dotPeople, pah } from "@polkadot-api/descriptors";
import { NETWORK } from "../src/network";

const t = Date.now();
const [relaySpec, ahSpec, peopleSpec] = await NETWORK.chainSpecs();
const smoldot = start();
const relay = await smoldot.addChain({ chainSpec: relaySpec });
const ah = createClient(getSmProvider(await smoldot.addChain({ chainSpec: ahSpec, potentialRelayChains: [relay] })));
const people = createClient(getSmProvider(await smoldot.addChain({ chainSpec: peopleSpec, potentialRelayChains: [relay] })));
const ahApi = ah.getTypedApi(pah);
const active = await ahApi.query.Staking.ActiveEra.getValue();
const pts = await ahApi.query.Staking.ErasRewardPoints.getValue(active!.index - 1);
console.log(`era ${active!.index - 1}: ${pts.total} points, ${pts.individual.length} validators (${(Date.now() - t) / 1000}s)`);
const entries = await ahApi.query.Staking.ErasRewardPoints.getEntries();
console.log(`${entries.length} eras via getEntries (${(Date.now() - t) / 1000}s)`);
const id = await people.getTypedApi(dotPeople).query.Identity.IdentityOf.getValues(pts.individual.slice(0, 20).map(([s]) => [s]));
console.log(`${id.filter(Boolean).length}/20 identities (${(Date.now() - t) / 1000}s)`);
ah.destroy();
people.destroy();
smoldot.terminate();
process.exit(0);
