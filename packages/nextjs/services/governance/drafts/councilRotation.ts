import type { ProposalDraft } from "./draft";
import type { PublicKey } from "@hiero-ledger/sdk";
import { buildCouncilRotation } from "@sh/core/governance/encode";

/** A rotation rewrites the governance account's own key, so the account is all it needs to name. */
export type CouncilRotationTargets = { governanceAccountId: string };

/** The incoming members, each one account's single key, in the order they are listed. */
export type CouncilRotationValues = { memberKeys: PublicKey[]; threshold: number };

export function draftCouncilRotation(targets: CouncilRotationTargets, values: CouncilRotationValues): ProposalDraft {
  const build = () =>
    buildCouncilRotation({
      governanceAccountId: targets.governanceAccountId,
      memberKeys: values.memberKeys,
      threshold: values.threshold,
    });
  // Built once now so an unreachable threshold or a repeated key surfaces in the form, before anything is signed.
  build();

  return {
    path: "native",
    kind: "councilRotation",
    target: `Treasury account key · ${targets.governanceAccountId}`,
    buildInnerTransaction: build,
  };
}
