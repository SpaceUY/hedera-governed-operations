"use client";

import { useEffect, useId, useState } from "react";
import { accountLookup } from "./accountLookup";
import { HederaAddressInput } from "@scaffold-hbar-ui/components";
import type { TokenAdminOperation } from "@sh/core/governance/proposalTypes";
import type { Chain } from "viem";
import {
  ACCOUNT_LOOKUP_LABELS,
  TOKEN_ADMIN_COPY,
  TOKEN_ADMIN_OPERATION_LABELS,
} from "~~/components/governance/wizard/copy";
import { useAccount } from "~~/hooks/mirror/useAccount";
import { useToken } from "~~/hooks/mirror/useToken";
import { useTokenRelationship } from "~~/hooks/mirror/useTokenRelationship";
import {
  type DraftResult,
  type TokenAdminTargets,
  draftTokenAdmin,
  tokenAdminNeedsAccount,
  tryDraft,
} from "~~/services/governance/drafts";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

const OPERATIONS = ["pause", "unpause", "freeze", "unfreeze"] as const satisfies readonly TokenAdminOperation[];

type TokenAdminFormProps = {
  targets: TokenAdminTargets;
  network: HederaNetworkName;
  chain: Chain;
  onDraftChange: (result: DraftResult) => void;
};

export const TokenAdminForm = ({
  targets: { tokenAdmin, tokenAdminContractId, tokenId },
  network,
  chain,
  onDraftChange,
}: TokenAdminFormProps) => {
  const name = useId();
  const [operation, setOperation] = useState<TokenAdminOperation>("pause");
  const [accountText, setAccountText] = useState("");
  const needsAccount = tokenAdminNeedsAccount(operation);
  const accountInput = needsAccount ? accountText.trim() : "";

  const token = useToken(tokenId, { network });
  const account = useAccount(accountInput, { network });
  const accountId = account.data?.account;
  const relationship = useTokenRelationship(accountId, tokenId, { network, enabled: needsAccount });
  const symbol = token.data?.token.symbol ?? tokenId;

  // Depends on the fields, not on `targets` or the queries: those are rebuilt on every render.
  useEffect(() => {
    const draft = (holder: string | null) =>
      tryDraft(() => draftTokenAdmin({ tokenAdmin, tokenAdminContractId, tokenId }, { operation, accountId: holder }));
    if (!needsAccount) {
      onDraftChange(draft(null));
      return;
    }
    const lookup = accountLookup(accountInput, { accountId, error: account.error });
    if (lookup.status !== "found") {
      onDraftChange(lookup);
      return;
    }
    if (relationship.error) {
      onDraftChange({ status: "invalid", message: TOKEN_ADMIN_COPY.relationshipUnreadable(lookup.accountId) });
      return;
    }
    if (relationship.data === undefined) {
      onDraftChange({ status: "empty" });
      return;
    }
    // An empty answer is a state, not a failed read: the account never associated the token.
    if (relationship.data === null) {
      onDraftChange({ status: "invalid", message: TOKEN_ADMIN_COPY.notAssociated(lookup.accountId, symbol) });
      return;
    }
    onDraftChange(draft(lookup.accountId));
  }, [
    operation,
    needsAccount,
    accountInput,
    accountId,
    account.error,
    relationship.data,
    relationship.error,
    symbol,
    tokenAdmin,
    tokenAdminContractId,
    tokenId,
    onDraftChange,
  ]);

  return (
    <div className="rounded-box border border-base-300 bg-base-200 p-4 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Token</span>
        <input className="input w-full bg-base-300 font-mono text-sm" value={`${symbol} · ${tokenId}`} readOnly />
        {token.data && (
          <span className="text-sm text-base-content/60">
            {TOKEN_ADMIN_COPY.pauseStatus(symbol, token.data.token.pause_status)}
          </span>
        )}
        {token.isError && <span className="text-sm text-warning">{TOKEN_ADMIN_COPY.tokenUnreadable(tokenId)}</span>}
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-semibold">Operation</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {OPERATIONS.map(option => (
            <label
              key={option}
              className="flex cursor-pointer items-center justify-center rounded-box border border-base-300 bg-base-100 px-3 py-2 text-sm font-semibold has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={operation === option}
                onChange={() => setOperation(option)}
                className="sr-only"
              />
              {TOKEN_ADMIN_OPERATION_LABELS[option]}
            </label>
          ))}
        </div>
      </fieldset>

      {needsAccount && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Account</span>
          <HederaAddressInput
            value={accountText}
            onChange={setAccountText}
            placeholder="0.0.x or 0x…"
            chainId={chain.id}
          />
          {account.isLoading && (
            <span role="status" className="text-sm text-base-content/60">
              {ACCOUNT_LOOKUP_LABELS.loading(accountInput)}
            </span>
          )}
          {accountId && relationship.data && (
            <span className="text-sm text-base-content/60">
              {TOKEN_ADMIN_COPY.freezeStatus(accountId, symbol, relationship.data.freeze_status)}
            </span>
          )}
        </label>
      )}

      <p className="m-0 text-sm text-base-content/60 leading-normal">{TOKEN_ADMIN_COPY.explainer}</p>
    </div>
  );
};
