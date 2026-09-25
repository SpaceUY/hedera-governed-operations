/**
 * The five kinds of operation this template governs, and the shapes a decoded proposal comes back
 * as. Adding a sixth kind is an encoder, a branch of the decoder and an entry in `PROPOSAL_TYPES`.
 *
 * Two of the five never touch a contract. A treasury transfer is a `CryptoTransfer` and a council
 * rotation is a `CryptoUpdate` on the governance account itself, so both are readable straight from
 * the scheduled body. The other three are a call to `GovernedExecutor.execute(id)`, and what they
 * actually do lives in the registry entry that id points at — which is why a decoded proposal comes
 * in two layers, `ScheduledOperation` and `RegistryOperation`.
 */
import type { CouncilKey } from "./council";
import { Hbar } from "@hiero-ledger/sdk";

/** The three that go through `GovernedExecutor`, so they leave a registry entry and burn gas. */
export type ContractProposalKind = "upgrade" | "treasurySwap" | "tokenAdmin";

/** The two the network runs itself, with no contract and no registry entry behind them. */
export type NativeProposalKind = "treasuryTransfer" | "councilRotation";

export type ProposalKind = ContractProposalKind | NativeProposalKind;

/**
 * `executeGas` is the limit of the scheduled `execute(id)` that runs the operation, and only the
 * contract-backed kinds have one. A scheduled call that succeeds is charged its whole limit, so
 * these are not headroom to be generous with: the governance account pays for every unit left
 * unused. Each is measured consumption on testnet plus about a third, the margin the swap and the
 * token operations were already verified at.
 */
export const PROPOSAL_TYPES: Record<ContractProposalKind, { label: string; executeGas: number }> &
  Record<NativeProposalKind, { label: string; executeGas: null }> = {
  /** Measured: 65,410 with no initializer, 99,015 with one nested in the upgrade call. */
  upgrade: { label: "Contract upgrade", executeGas: 150_000 },
  /** Measured: 241k through the executor, the adapter and the router, on a single-hop pool. */
  treasurySwap: { label: "Treasury swap", executeGas: 320_000 },
  /** Measured: 65k–68k for all four operations, through the executor to the HTS system contract. */
  tokenAdmin: { label: "Token administration", executeGas: 90_000 },
  treasuryTransfer: { label: "Treasury transfer", executeGas: null },
  councilRotation: { label: "Council rotation", executeGas: null },
};

export type HbarTransfer = {
  accountId: string;
  /** Negative for the account being debited. */
  tinybars: bigint;
};

export type TokenTransfer = {
  tokenId: string;
  accountId: string;
  /** In the token's smallest unit; reading its decimals is a separate Mirror call. */
  amount: bigint;
};

/**
 * What the scheduled transaction body says, decoded without touching the network. For the three
 * kinds that go through a contract this only gets as far as "entry `proposalId` of the registry":
 * the operation itself needs `decodeRegistryOperation` on what the registry stores.
 */
export type ScheduledOperation =
  | {
      kind: "registryCall";
      executorContractId: string;
      proposalId: number;
      gas: number;
      /**
       * HBAR the governance account sends along with the call, in tinybars. It rides on the
       * scheduled transaction rather than in the calldata, so a decoder that only reads the
       * arguments reports a treasury swap as moving nothing.
       */
      payableTinybars: bigint;
    }
  | { kind: "treasuryTransfer"; hbar: HbarTransfer[]; tokens: TokenTransfer[] }
  | {
      kind: "councilRotation";
      accountId: string;
      /**
       * The council being proposed, in the same shape `fetchCouncilKey` returns for the current
       * one, so the two can be compared and counted with the same code.
       */
      council: CouncilKey;
    }
  | { kind: "unrecognized"; reason: string };

export type TokenAdminOperation = "pause" | "unpause" | "freeze" | "unfreeze";

/**
 * What a registry entry does, decoded from the call it stores. The kind is decided by the function
 * selector alone: a match names the operation, it does not prove the target is one of this
 * template's contracts, which is why `target` is always carried along. Gating on the target is the
 * co-signing agent's job, not the decoder's.
 */
export type RegistryOperation =
  | { kind: "upgrade"; target: string; implementation: string; initializerCalldata: string }
  | {
      kind: "treasurySwap";
      target: string;
      tokenOut: string;
      fee: number;
      recipient: string;
      amountInTinybars: bigint;
      amountOutMinimum: bigint;
      deadline: number;
    }
  | {
      kind: "tokenAdmin";
      target: string;
      operation: TokenAdminOperation;
      token: string;
      /** Only `freeze` and `unfreeze` name an account; the other two act on the token as a whole. */
      account: string | null;
    }
  | { kind: "unrecognized"; target: string; calldata: string; reason: string };

/**
 * A plain sentence for a decoded operation, so a log line or a test has something to read. It is a
 * default and not the screen's copy: the UI renders the fields above, which carry the same facts
 * typed. Addresses stay as they come out of the calldata — turning one back into a `0.0.x` id takes
 * a Mirror Node lookup, which belongs to whoever is rendering, not to a pure description.
 */
export function describeScheduledOperation(operation: ScheduledOperation): string {
  switch (operation.kind) {
    case "registryCall":
      return `Run entry ${operation.proposalId} of the registry at ${operation.executorContractId}`;
    case "treasuryTransfer": {
      const moves = [
        ...operation.hbar
          .filter(transfer => transfer.tinybars > 0n)
          .map(transfer => `${Hbar.fromTinybars(transfer.tinybars.toString()).toString()} to ${transfer.accountId}`),
        ...operation.tokens
          .filter(transfer => transfer.amount > 0n)
          .map(transfer => `${transfer.amount} of token ${transfer.tokenId} to ${transfer.accountId}`),
      ];
      return `Transfer ${moves.join(", ")}`;
    }
    case "councilRotation":
      return `Rotate the council of ${operation.accountId} to ${operation.council.threshold} of ${operation.council.memberKeys.length}`;
    case "unrecognized":
      return `Not a proposal this template recognises: ${operation.reason}`;
  }
}

export function describeRegistryOperation(operation: RegistryOperation): string {
  switch (operation.kind) {
    case "upgrade":
      return `Upgrade ${operation.target} to the implementation at ${operation.implementation}`;
    case "treasurySwap":
      return (
        `Swap ${Hbar.fromTinybars(operation.amountInTinybars.toString()).toString()} for at least ` +
        `${operation.amountOutMinimum} of ${operation.tokenOut}, paid out to ${operation.recipient}`
      );
    case "tokenAdmin":
      return operation.account
        ? `${operation.operation} ${operation.account} for token ${operation.token}`
        : `${operation.operation} token ${operation.token}`;
    case "unrecognized":
      return `A call to ${operation.target} this template cannot describe: ${operation.reason}`;
  }
}
