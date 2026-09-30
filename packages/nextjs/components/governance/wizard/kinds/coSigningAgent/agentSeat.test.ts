// @vitest-environment node
import { agentSeatOf, draftAgentSeat } from "./agentSeat";
import { CO_SIGNING_AGENT_COPY } from "./copy";
import { PrivateKey, type PublicKey } from "@hiero-ledger/sdk";
import { type CouncilKey, memberKeyOfAccount } from "@sh/core/governance/council";
import type { MirrorAccount } from "@sh/core/mirror";
import { describe, expect, it } from "vitest";
import { ACCOUNT_LOOKUP_LABELS } from "~~/components/governance/wizard/copy";
import { previewDraft } from "~~/services/governance/drafts";

const TREASURY = "0.0.10746004";
const AGENT = "0.0.600";

const ecdsaKey = (publicKey: PublicKey) => ({ _type: "ECDSA_SECP256K1", key: publicKey.toStringRaw() });
const seatOf = (publicKey: PublicKey) => memberKeyOfAccount(ecdsaKey(publicKey)) ?? "";

const members = [PrivateKey.generateECDSA().publicKey, PrivateKey.generateECDSA().publicKey];
const COUNCIL: CouncilKey = { threshold: 2, memberKeys: [...members.map(seatOf)] };
const agentKey = PrivateKey.generateECDSA().publicKey;
const SEATING = { council: COUNCIL, configuredAgentId: null };

const found = (key: { _type: string; key: string } | null) => ({
  account: { account: AGENT, key } as MirrorAccount,
  error: null,
});

describe("agentSeatOf", () => {
  it("seats an existing ECDSA account that holds no seat yet", () => {
    const seat = agentSeatOf(AGENT, found(ecdsaKey(agentKey)), SEATING);
    if (seat.status !== "found") throw new Error("expected a seat");
    expect(seat.key.toStringRaw()).toBe(agentKey.toStringRaw());
  });

  it("refuses an account that is a council member already", () => {
    expect(agentSeatOf(AGENT, found(ecdsaKey(members[1])), SEATING)).toEqual({
      status: "invalid",
      message: CO_SIGNING_AGENT_COPY.alreadyMember(AGENT),
    });
  });

  it("says the configured agent is seated already rather than asking for another account", () => {
    const seating = { council: COUNCIL, configuredAgentId: AGENT };
    expect(agentSeatOf(AGENT, found(ecdsaKey(members[1])), seating)).toEqual({
      status: "invalid",
      message: CO_SIGNING_AGENT_COPY.agentSeated(AGENT),
    });
  });

  it("refuses an account whose key the agent could not sign with", () => {
    const ed25519 = { _type: "ED25519", key: PrivateKey.generateED25519().publicKey.toStringRaw() };
    expect(agentSeatOf(AGENT, found(ed25519), SEATING)).toEqual({
      status: "invalid",
      message: CO_SIGNING_AGENT_COPY.notEcdsa(AGENT, "ED25519"),
    });
    expect(agentSeatOf(AGENT, found({ _type: "ProtobufEncoded", key: "0a05" }), SEATING)).toEqual({
      status: "invalid",
      message: CO_SIGNING_AGENT_COPY.notSingleKey(AGENT, "ProtobufEncoded"),
    });
  });

  it("waits on an empty or unread account and says when the input is not one", () => {
    expect(agentSeatOf("", { account: undefined, error: null }, SEATING)).toEqual({ status: "empty" });
    expect(agentSeatOf(AGENT, { account: undefined, error: null }, SEATING)).toEqual({ status: "empty" });
    expect(agentSeatOf("agent", { account: undefined, error: null }, SEATING)).toEqual({
      status: "invalid",
      message: ACCOUNT_LOOKUP_LABELS.malformed("agent"),
    });
  });
});

describe("draftAgentSeat", () => {
  it("keeps every member and the threshold, and adds the agent's key last", () => {
    const result = draftAgentSeat(TREASURY, COUNCIL, agentKey);
    if (result.status !== "ready") throw new Error("expected a draft");

    const preview = previewDraft(result.draft);
    if (preview.path !== "native" || preview.scheduled.kind !== "councilRotation")
      throw new Error("expected a rotation");
    expect(preview.scheduled.accountId).toBe(TREASURY);
    expect(preview.scheduled.council).toEqual({
      threshold: 2,
      memberKeys: [...COUNCIL.memberKeys, seatOf(agentKey)],
    });
  });
});
