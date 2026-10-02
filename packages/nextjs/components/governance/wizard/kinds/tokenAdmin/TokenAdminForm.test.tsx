import { TokenAdminForm } from "./TokenAdminForm";
import { TOKEN_ADMIN_COPY, TOKEN_ADMIN_OPERATION_LABELS } from "./copy";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Chain } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccount } from "~~/hooks/mirror/useAccount";
import { useToken } from "~~/hooks/mirror/useToken";
import { useTokenRelationship } from "~~/hooks/mirror/useTokenRelationship";
import { type DraftResult, previewDraft } from "~~/services/governance/drafts";

vi.mock("~~/hooks/mirror/useAccount", () => ({ useAccount: vi.fn() }));
vi.mock("~~/hooks/mirror/useToken", () => ({ useToken: vi.fn() }));
vi.mock("~~/hooks/mirror/useTokenRelationship", () => ({ useTokenRelationship: vi.fn() }));
vi.mock("@scaffold-hbar-ui/components", () => ({
  HederaAddressInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Account" value={value} onChange={event => onChange(event.target.value)} />
  ),
}));

const TARGETS = {
  tokenAdmin: "0x00000000000000000000000000000000000Ad000",
  tokenAdminContractId: "0.0.4300",
  tokenId: "0.0.9000",
} as const;
const CHAIN = { id: 296, name: "Hedera Testnet" } as Chain;
const HOLDER = "0.0.500";

beforeEach(() => {
  vi.mocked(useToken).mockReturnValue({
    data: { token: { symbol: "ACME", pause_status: "UNPAUSED" }, decimals: 0 },
    isError: false,
  } as never);
  vi.mocked(useAccount).mockReturnValue({ data: undefined, error: null } as never);
  vi.mocked(useTokenRelationship).mockReturnValue({ data: undefined, error: null } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderForm = () => {
  const onDraftChange = vi.fn<(result: DraftResult) => void>();
  render(
    <TokenAdminForm
      targets={TARGETS}
      network="testnet"
      chain={CHAIN}
      council={undefined}
      onDraftChange={onDraftChange}
    />,
  );
  return onDraftChange;
};

const lastResult = (onDraftChange: ReturnType<typeof renderForm>) => onDraftChange.mock.lastCall?.[0];

const pick = (operation: keyof typeof TOKEN_ADMIN_OPERATION_LABELS) =>
  fireEvent.click(screen.getByRole("radio", { name: TOKEN_ADMIN_OPERATION_LABELS[operation] }));

/** An ECDSA account: the Mirror Node reports its alias, which is what the token system contract accepts. */
const HOLDER_ALIAS = "0x5b38da6a701c568545dcfcb03fcb875f56beddc4";

const holderFound = () =>
  vi.mocked(useAccount).mockReturnValue({ data: { account: HOLDER, evm_address: HOLDER_ALIAS }, error: null } as never);

describe("TokenAdminForm", () => {
  it("drafts a pause of the token as soon as it opens, and says whether it is paused now", () => {
    const onDraftChange = renderForm();

    const result = lastResult(onDraftChange);
    expect(result?.status === "ready" && result.draft.kind).toBe("tokenAdmin");
    expect(screen.getByText(TOKEN_ADMIN_COPY.pauseStatus("ACME", "UNPAUSED"))).toBeTruthy();
    expect(screen.queryByLabelText("Account")).toBeNull();
  });

  it("refuses to pause a token that has no pause key, since the call could only revert", () => {
    vi.mocked(useToken).mockReturnValue({
      data: { token: { symbol: "ACME", pause_status: "NOT_APPLICABLE" }, decimals: 0 },
      isError: false,
    } as never);
    const onDraftChange = renderForm();

    expect(lastResult(onDraftChange)).toEqual({ status: "invalid", message: TOKEN_ADMIN_COPY.noPauseKey("ACME") });
    pick("unpause");
    expect(lastResult(onDraftChange)).toEqual({ status: "invalid", message: TOKEN_ADMIN_COPY.noPauseKey("ACME") });
  });

  it("refuses to pause a paused token or unpause an active one, and still offers the opposite", () => {
    const onDraftChange = renderForm();
    pick("unpause");
    expect(lastResult(onDraftChange)).toEqual({
      status: "invalid",
      message: TOKEN_ADMIN_COPY.pauseChangesNothing("ACME", "UNPAUSED"),
    });
    cleanup();

    vi.mocked(useToken).mockReturnValue({
      data: { token: { symbol: "ACME", pause_status: "PAUSED" }, decimals: 0 },
      isError: false,
    } as never);
    const paused = renderForm();
    expect(lastResult(paused)).toEqual({
      status: "invalid",
      message: TOKEN_ADMIN_COPY.pauseChangesNothing("ACME", "PAUSED"),
    });
    pick("unpause");
    const result = lastResult(paused);
    expect(result?.status === "ready" && result.draft.kind).toBe("tokenAdmin");
  });

  it("drafts no pause until the token is read, and refuses one it could not read", () => {
    vi.mocked(useToken).mockReturnValue({ data: undefined, isError: false } as never);
    const loading = renderForm();
    expect(lastResult(loading)).toEqual({ status: "empty" });
    cleanup();

    vi.mocked(useToken).mockReturnValue({ data: undefined, isError: true } as never);
    const unreadable = renderForm();
    expect(lastResult(unreadable)?.status).toBe("invalid");
  });

  it("asks for the holder on a freeze and drafts nothing until it has one", () => {
    const onDraftChange = renderForm();

    pick("freeze");

    expect(screen.getByLabelText("Account")).toBeTruthy();
    expect(lastResult(onDraftChange)).toEqual({ status: "empty" });
  });

  it("reads the holder's relationship with the token, and freezes it when it is associated", () => {
    holderFound();
    vi.mocked(useTokenRelationship).mockReturnValue({ data: { freeze_status: "UNFROZEN" }, error: null } as never);
    const onDraftChange = renderForm();

    pick("freeze");
    fireEvent.change(screen.getByLabelText("Account"), { target: { value: HOLDER } });

    expect(useTokenRelationship).toHaveBeenLastCalledWith(HOLDER, TARGETS.tokenId, {
      network: "testnet",
      enabled: true,
    });
    expect(screen.getByText(TOKEN_ADMIN_COPY.freezeStatus(HOLDER, "ACME", "UNFROZEN"))).toBeTruthy();
    const result = lastResult(onDraftChange);
    if (result?.status !== "ready") throw new Error("expected a ready draft");
    const preview = previewDraft(result.draft);
    expect(preview.path === "registry" && preview.operation).toMatchObject({
      account: "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4",
    });
  });

  it("refuses to freeze an account that never associated the token, saying why", () => {
    holderFound();
    vi.mocked(useTokenRelationship).mockReturnValue({ data: null, error: null } as never);
    const onDraftChange = renderForm();

    pick("unfreeze");
    fireEvent.change(screen.getByLabelText("Account"), { target: { value: HOLDER } });

    expect(lastResult(onDraftChange)).toEqual({
      status: "invalid",
      message: TOKEN_ADMIN_COPY.notAssociated(HOLDER, "ACME"),
    });
  });

  it("refuses to freeze or unfreeze a holder of a token that has no freeze key", () => {
    holderFound();
    vi.mocked(useTokenRelationship).mockReturnValue({
      data: { freeze_status: "NOT_APPLICABLE" },
      error: null,
    } as never);
    const onDraftChange = renderForm();

    pick("freeze");
    fireEvent.change(screen.getByLabelText("Account"), { target: { value: HOLDER } });

    expect(lastResult(onDraftChange)).toEqual({
      status: "invalid",
      message: TOKEN_ADMIN_COPY.noFreezeKey(HOLDER, "ACME"),
    });
  });

  it("says the relationship could not be read rather than calling the account unassociated", () => {
    holderFound();
    vi.mocked(useTokenRelationship).mockReturnValue({ data: undefined, error: new Error("503") } as never);
    const onDraftChange = renderForm();

    pick("freeze");
    fireEvent.change(screen.getByLabelText("Account"), { target: { value: HOLDER } });

    expect(lastResult(onDraftChange)).toEqual({
      status: "invalid",
      message: TOKEN_ADMIN_COPY.relationshipUnreadable(HOLDER),
    });
  });
});
