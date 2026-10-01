"use client";

import { type PanelVariant, ProposalDetailPanel, type ProposalDetailPanelProps } from "./ProposalDetailPanel";
import { DETAIL_COPY } from "./copy";
import { useShownProposal } from "~~/components/governance/MapPlaybackProvider";
import { memberNamesOf, routeNamesOf } from "~~/components/governance/graph/mapModel";
import { useLatestComposedMap } from "~~/components/governance/graph/useComposedMap";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useProposalLookup } from "~~/hooks/mirror/useProposalLookup";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { decodedOperationOf } from "~~/services/liveMap/model/proposalRoutes";

export type ProposalDetailProps = {
  config: GovernanceConfig;
  scheduleId: string;
  variant?: PanelVariant;
};

/** Where the panel will be, in its shape, while the proposal is read — not a spinner in a corner. */
const DetailPlaceholder = () => (
  <div role="status" aria-label={DETAIL_COPY.loading} className="flex flex-col gap-4 px-4 py-4">
    <div className="skeleton h-3 w-2/5" />
    <div className="skeleton h-4 w-4/5" />
    <div className="grid grid-cols-3 gap-3">
      <div className="skeleton h-10" />
      <div className="skeleton h-10" />
      <div className="skeleton h-10" />
    </div>
    <div className="skeleton h-6 w-3/5" />
    <div className="skeleton h-24" />
  </div>
);

/**
 * One proposal by schedule id: owns the reads and hands the result to `ProposalDetailPanel`. The detail
 * route mounts it as the whole rail; the home page mounts it under the selected card as the `inline`
 * variant, so both show the same thing. It also reads the map as composed for this deployment
 * (`useLatestComposedMap`, from queries the map already keeps), so a council member and a route step are
 * called here exactly what the map calls them.
 */
export const ProposalDetail = ({ config, scheduleId, variant }: ProposalDetailProps) => {
  const { governanceAccountId, executor, network } = config;
  const executorContractId = executor.hederaContractId;
  const { proposal, isLoading, error, refresh, markRegistryEntryCancelled } = useProposalLookup({
    governanceAccountId,
    executorContractId,
    network,
    scheduleId,
  });
  const { accountId, signerKind, walletName } = useHederaSigner();
  const { composed } = useLatestComposedMap(config);

  if (isLoading) return <DetailPlaceholder />;
  if (error) return <p className="m-0 px-4 py-4 text-sm text-error">{error.message}</p>;
  if (!proposal) return <p className="m-0 px-4 py-4 text-sm">{DETAIL_COPY.notFound}</p>;

  return (
    <ShownProposalDetail
      proposal={proposal}
      accountId={accountId}
      signerKind={signerKind}
      walletName={walletName}
      governanceAccountId={governanceAccountId}
      executorContractId={executorContractId}
      network={network}
      memberNames={composed ? memberNamesOf(composed) : undefined}
      route={composed ? routeNamesOf(composed.graph, decodedOperationOf(proposal)) : null}
      refresh={refresh}
      markRegistryEntryCancelled={markRegistryEntryCancelled}
      variant={variant}
    />
  );
};

/**
 * The panel for the proposal as the map shows it: while the map still plays it, or this session's
 * signature on it is on its way, the copy the map draws rather than the one just read.
 */
const ShownProposalDetail = (props: Omit<ProposalDetailPanelProps, "isPlaying" | "councilShown">) => {
  const { proposal, isPlaying, council } = useShownProposal(props.proposal);
  return <ProposalDetailPanel {...props} proposal={proposal} isPlaying={isPlaying} councilShown={council} />;
};
