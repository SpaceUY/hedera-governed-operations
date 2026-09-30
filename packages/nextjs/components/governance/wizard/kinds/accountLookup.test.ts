import { accountLookup } from "./accountLookup";
import { MirrorNodeError } from "@sh/core/mirror";
import { describe, expect, it } from "vitest";
import { ACCOUNT_LOOKUP_LABELS } from "~~/components/governance/wizard/copy";

const mirrorError = (status: number) => new MirrorNodeError(status, "https://mirror/api/v1/accounts/x", "{}");

describe("accountLookup", () => {
  it("is empty before anything is typed and while the Mirror Node is still answering", () => {
    expect(accountLookup("", { accountId: undefined, error: null })).toEqual({ status: "empty" });
    expect(accountLookup("0.0.500", { accountId: undefined, error: null })).toEqual({ status: "empty" });
  });

  it("names the account the Mirror Node resolved, whichever form was typed", () => {
    expect(accountLookup("0x3353E89f1f9feF7A0881E5E92f8A0A7fd3A13097", { accountId: "0.0.500", error: null })).toEqual({
      status: "found",
      accountId: "0.0.500",
    });
  });

  it("says a malformed input is not an account instead of waiting on a lookup that never starts", () => {
    expect(accountLookup("alice", { accountId: undefined, error: null })).toEqual({
      status: "invalid",
      message: ACCOUNT_LOOKUP_LABELS.malformed("alice"),
    });
  });

  it("tells a missing account apart from a lookup that failed", () => {
    expect(accountLookup("0.0.404", { accountId: undefined, error: mirrorError(404) })).toEqual({
      status: "invalid",
      message: ACCOUNT_LOOKUP_LABELS.notFound("0.0.404"),
    });
    expect(accountLookup("0.0.500", { accountId: undefined, error: mirrorError(503) })).toEqual({
      status: "invalid",
      message: ACCOUNT_LOOKUP_LABELS.unreachable("0.0.500"),
    });
  });
});
