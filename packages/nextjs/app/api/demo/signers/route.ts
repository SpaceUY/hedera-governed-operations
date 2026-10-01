/**
 * Demo only: the demo co-signers this server can sign for, and a `ScheduleSign` signed with one of
 * their keys. See `services/demoSigners/demoSigners.ts` for the feature and the two steps that remove it.
 *
 * `GET` answers 200 with an empty list when the signers are unavailable, rather than an error, so a page
 * asking whether to show the buttons never logs a failed request; when the reason is the co-signing
 * agent (unknown or unreadable), it says so in `unavailableReason`. `POST` refuses: 403 for a request
 * not addressed to localhost, off testnet or for the agent's seat, 503 without demo keys, in a production build, without a deployment or without a
 * known agent, 415 for a body not sent as JSON, 400 for a malformed request, 404/409 for a schedule that
 * is not a proposal waiting on that member, 502 when the Mirror Node, the relay or the network could not
 * be reached. Responses carry only what the ledger already makes public; keys and internal errors never leave.
 */
import { NextResponse } from "next/server";
import { hederaTestnet } from "viem/chains";
import {
  GOVERNANCE_CONTRACTS,
  getCoSigningAgentAccountId,
  getDeployedContract,
  getGovernanceEntityIds,
} from "~~/config/governanceConfig";
import {
  type AgentExclusion,
  DEMO_SIGNER_REFUSALS,
  type DemoGovernanceIds,
  type DemoSigners,
  checkDemoSignable,
  demoSignerEnvironment,
  isAgentSeat,
  loadDemoSigners,
  networkRefusalOf,
  parseDemoSignRequest,
  readAgentExclusion,
  submitDemoSignature,
} from "~~/services/demoSigners/demoSignerServer";
import type { DemoSignErrorResponse, DemoSignResponse, DemoSignersResponse } from "~~/services/demoSigners/demoSigners";

/** Never prerendered: what it answers depends on the state file and the ledger at request time. */
export const dynamic = "force-dynamic";

/** The media type alone: `application/json; charset=utf-8` passes, `multipart/form-data; x=application/json` does not. */
const isJsonRequest = (req: Request): boolean =>
  req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Whether the request names this machine in its `Host`, port aside. A page on a rebound domain names
 * that domain, so this stops DNS rebinding. It is not a network boundary: `next dev` listens on every
 * interface and anyone on the network can send `Host: localhost` themselves.
 */
function isAddressedToLocalhost(req: Request): boolean {
  const hostname = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());
}

const failure = (status: number, error: string) => NextResponse.json<DemoSignErrorResponse>({ error }, { status });

/** The demo accounts only exist on testnet, so the executor is the one deployed there. */
function governanceIdsOrNull(): DemoGovernanceIds | null {
  try {
    return {
      governanceAccountId: getGovernanceEntityIds().governanceAccountId,
      executorContractId: getDeployedContract(hederaTestnet.id, GOVERNANCE_CONTRACTS.executor).hederaContractId,
    };
  } catch {
    return null;
  }
}

const agentExclusionOf = (demo: Extract<DemoSigners, { status: "available" }>): Promise<AgentExclusion> =>
  readAgentExclusion(getCoSigningAgentAccountId(), demo.recordedAgent);

const AGENT_REFUSAL = { unknown: DEMO_SIGNER_REFUSALS.agentUnknown, unreadable: DEMO_SIGNER_REFUSALS.agentUnreadable };

export async function GET() {
  const demo = loadDemoSigners(demoSignerEnvironment());
  if (demo.status !== "available" || !governanceIdsOrNull()) {
    return NextResponse.json<DemoSignersResponse>({ members: [] });
  }
  const agent = await agentExclusionOf(demo);
  if (agent.status !== "known") {
    return NextResponse.json<DemoSignersResponse>({ members: [], unavailableReason: AGENT_REFUSAL[agent.status] });
  }
  const members = demo.signers.map(({ member }) => member).filter(member => !isAgentSeat(member, agent.agents));
  return NextResponse.json<DemoSignersResponse>({ members });
}

export async function POST(req: Request) {
  if (!isAddressedToLocalhost(req)) return failure(403, "Demo signatures are only served on localhost.");
  const demo = loadDemoSigners(demoSignerEnvironment());
  if (demo.status === "wrongNetwork") return failure(403, "Demo signers only run on testnet (HEDERA_NETWORK=testnet).");
  const governanceIds = governanceIdsOrNull();
  if (demo.status === "unavailable" || !governanceIds) {
    return failure(503, "Demo signers are not available: run `yarn setup` and use the development server.");
  }

  // A page on any other origin can send a text/plain POST to localhost without a preflight; requiring
  // JSON forces one, which this route never answers, so only the app itself can ask for a signature.
  if (!isJsonRequest(req)) return failure(415, "Expected a JSON body.");
  const request = parseDemoSignRequest(await req.json().catch(() => null));
  if (!request) return failure(400, "Expected { scheduleId: 0.0.x, member: one of the demo members }.");
  const signer = demo.signers.find(({ member }) => member.name === request.member);
  if (!signer) return failure(503, `The demo member ${request.member} has no key on this server.`);

  const agent = await agentExclusionOf(demo);
  if (agent.status === "unknown") return failure(503, DEMO_SIGNER_REFUSALS.agentUnknown);
  if (agent.status === "unreadable") return failure(502, DEMO_SIGNER_REFUSALS.agentUnreadable);
  if (isAgentSeat(signer.member, agent.agents)) return failure(403, DEMO_SIGNER_REFUSALS.agentSeat);

  const check = await checkDemoSignable({ scheduleId: request.scheduleId, member: signer.member, ...governanceIds });
  if (!check.signable) return failure(check.status, check.error);

  try {
    const transactionId = await submitDemoSignature(signer, request.scheduleId);
    return NextResponse.json<DemoSignResponse>({ transactionId });
  } catch (error) {
    const refusal = networkRefusalOf(error);
    return refusal
      ? failure(409, `The network refused the signature: ${refusal}.`)
      : failure(502, "The signature could not be submitted to the network. Try again.");
  }
}
