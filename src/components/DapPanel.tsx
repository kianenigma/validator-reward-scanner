import { Fragment } from "react";
import { fmt, short, tokenAmount } from "../format";
import { useFold } from "../fold";
import { NETWORK } from "../network";
import type { Dap, DapAccount, DapRole } from "../types";

const OPEN_KEY = "validator-reward-scanner.dap-open";

/** Row order, name, swatch and role of each kind of account. Swatches match the issuance chart. */
const ROLES: Record<DapRole, { order: number; label?: string; swatch: string; what: string }> = {
	buffer: {
		order: 0,
		label: "DAP buffer",
		swatch: "dap",
		what: "The DAP's own share of each drip, plus everything that reaches it through staging.",
	},
	staker: {
		order: 1,
		label: "Staker rewards pot",
		swatch: "staker",
		what: "Drips of the running era. Moved into an era pot when the era ends.",
	},
	incentive: {
		order: 2,
		label: "Validator incentive pot",
		swatch: "incentive",
		what: "Drips of the running era. Moved into an era pot when the era ends.",
	},
	other: { order: 3, swatch: "plain", what: "Another drip recipient." },
	staging: {
		order: 4,
		label: "Staging",
		swatch: "plain",
		what: "Slashes, forfeited deposits, dust, burns and expired rewards. Moved into the buffer when a block has weight to spare.",
	},
};

const percent = (perbill: number) => `${fmt(perbill / 1e7)}%`;

/** `ms` as whole hours, minutes or seconds. */
function duration(ms: number): string {
	if (ms >= 3_600_000 && ms % 3_600_000 === 0) return `${ms / 3_600_000} h`;
	if (ms >= 60_000 && ms % 60_000 === 0) return `${ms / 60_000} min`;
	return `${fmt(ms / 1000)} s`;
}

const held = (a: DapAccount) => a.balance + (a.eraPots?.balance ?? 0n);

interface Props {
	dap: Dap | null;
	error: string | null;
}

/** The DAP's accounts: where each drip goes, and what every account holds now. */
export function DapPanel({ dap, error }: Props) {
	const [open, toggle] = useFold(OPEN_KEY);
	const { decimals, symbol } = NETWORK.token;
	const amount = (planck: bigint, digits = 0) => tokenAmount(planck, decimals, digits);

	const accounts = dap ? [...dap.accounts].sort((a, b) => ROLES[a.role].order - ROLES[b.role].order) : [];
	const dripped = accounts.filter((a) => a.share);
	const buffer = accounts.filter((a) => a.role === "buffer").reduce((s, a) => s + a.balance, 0n);
	const pots = accounts.filter((a) => a.role === "staker" || a.role === "incentive").reduce((s, a) => s + held(a), 0n);
	const total = accounts.reduce((s, a) => s + held(a), 0n);
	const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

	return (
		<details className="fold" open={open} onToggle={(e) => toggle(e.currentTarget.open)}>
			<summary>
				<span className="section-title">Dynamic Allocation Pool</span>
				<span className="fold-sub">
					{error
						? "Couldn't be read"
						: dap
							? `${amount(buffer)} ${symbol} in the buffer, ${amount(pots)} ${symbol} in staking pots`
							: "Reading…"}
				</span>
			</summary>

			<div className="fold-body">
				{error ? (
					<p className="alert" role="alert">
						{error}
					</p>
				) : !dap ? (
					<p className="muted">Reading the DAP's accounts…</p>
				) : (
					<>
						{dripped.length > 0 && (
							<div className="dap-drip">
								<span>Each drip</span>
								<div
									className="split"
									role="img"
									aria-label={dripped.map((a) => `${ROLES[a.role].label ?? a.key} ${percent(a.share!)}`).join(", ")}
								>
									{dripped.map((a) => (
										<span key={a.address} className={`seg ${ROLES[a.role].swatch}`} style={{ flexGrow: a.share! }} />
									))}
								</div>
							</div>
						)}

						<div className="dap-scroll">
							<table className="dap-table">
								<thead>
									<tr>
										<th>Account</th>
										<th>Address</th>
										<th className="num">Of each drip</th>
										<th className="num">Balance ({symbol})</th>
									</tr>
								</thead>
								<tbody>
									{accounts.map((a) => {
										const role = ROLES[a.role];
										return (
											<Fragment key={a.address}>
											<tr>
												<td>
													<i className={`swatch ${role.swatch}`} />
													<span className="strong">{role.label ?? a.key}</span>
													<span className="dap-what">{role.what}</span>
												</td>
												<td className="addr" title={a.address}>
													{short(a.address)}
												</td>
												<td className="num">{a.share === null ? "–" : percent(a.share)}</td>
												<td className="num strong">{amount(a.balance, 2)}</td>
											</tr>
											{a.eraPots && (
												<tr className="dap-pots">
													<td>
														Its era pots
														<span className="dap-what">
															Left to pay out of the last {a.eraPots.eras} eras. What is unclaimed once an era
															expires goes to the DAP.
														</span>
													</td>
													<td />
													<td />
													<td className="num">{amount(a.eraPots.balance, 2)}</td>
												</tr>
											)}
											</Fragment>
										);
									})}
								</tbody>
								<tfoot>
									<tr>
										<td>Total</td>
										<td />
										<td />
										<td className="num">{amount(total, 2)}</td>
									</tr>
								</tfoot>
							</table>
						</div>

						<p className="fold-note">
							{dap.cadenceMs > 0
								? `Drips are at least ${duration(dap.cadenceMs)} apart`
								: "The DAP drips every block"}
							, each minting for at most {duration(dap.maxElapsedMs)} of elapsed time, split by{" "}
							<code>Dap::BudgetAllocation</code>. The last drip was at {time(dap.lastDripMs)}. Staking pays
							out of the era pots, which are{" "}
							<code>RewardPot::Era(era % 200, kind)</code> accounts of the staking pots' pallet ID. The buffer
							deactivates what it receives to keep it out of governance votes: {amount(dap.inactiveIssuance)}{" "}
							of the {amount(dap.totalIssuance)} {symbol} issued is inactive.
						</p>
					</>
				)}
			</div>
		</details>
	);
}
