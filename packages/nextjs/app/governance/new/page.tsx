"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Chain } from "viem";
import { ConnectWallet } from "~~/components/ConnectWallet";
import { SetupNotice } from "~~/components/SetupNotice";
import { MutationError } from "~~/components/governance/MutationError";
import { CouncilPreviewPanel } from "~~/components/governance/wizard/CouncilPreviewPanel";
import { OperationTypePicker, type WizardKind } from "~~/components/governance/wizard/OperationTypePicker";
import {
  type DraftResult,
  type VaultUpgradeTargets,
  isPreviewRecognized,
  previewDraft,
} from "~~/components/governance/wizard/drafts";
import { TransferForm } from "~~/components/governance/wizard/forms/TransferForm";
import { UpgradeVaultForm } from "~~/components/governance/wizard/forms/UpgradeVaultForm";
import {
  GOVERNANCE_CONTRACTS,
  GOVERNANCE_ROUTES,
  getDeployedContract,
  getGovernanceEntityIds,
} from "~~/config/governanceConfig";
import { useCouncil } from "~~/hooks/mirror/useCouncil";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { useSubmitProposalDraft } from "~~/hooks/useSubmitProposalDraft";
import { canOpenProposal } from "~~/services/governance/proposalActions";
import { openProposalCopy } from "~~/services/governance/proposalLabels";
import { isContractProposalKind } from "~~/services/governance/proposalTypes";
import { type HederaNetworkName, getHederaNetworkNameFromChainId } from "~~/utils/scaffold-hbar/networks";

type NewProposalProps = {
  chain: Chain;
  network: HederaNetworkName;
  governanceAccountId: string;
  executorContractId: string;
  upgradeTargets: VaultUpgradeTargets;
};

const EMPTY_DRAFT: DraftResult = { status: "empty" };

export default function NewProposalPage() {
  const { targetNetwork } = useTargetNetwork();
  let props: NewProposalProps;
  try {
    const vault = getDeployedContract(targetNetwork.id, GOVERNANCE_CONTRACTS.vault);
    const nextImplementation = getDeployedContract(targetNetwork.id, GOVERNANCE_CONTRACTS.vaultNextImplementation);
    props = {
      chain: targetNetwork,
      network: getHederaNetworkNameFromChainId(targetNetwork.id),
      governanceAccountId: getGovernanceEntityIds().governanceAccountId,
      executorContractId: getDeployedContract(targetNetwork.id, GOVERNANCE_CONTRACTS.executor).hederaContractId,
      upgradeTargets: {
        proxy: vault.address,
        proxyContractId: vault.hederaContractId,
        implementation: nextImplementation.address,
        implementationAbi: nextImplementation.abi,
      },
    };
  } catch (error) {
    return <SetupNotice error={error} />;
  }
  return <NewProposal {...props} />;
}

function NewProposal({ chain, network, governanceAccountId, executorContractId, upgradeTargets }: NewProposalProps) {
  const router = useRouter();
  const { accountId, isConnected } = useHederaSigner();
  const council = useCouncil({ governanceAccountId, executorContractId, network });
  const submit = useSubmitProposalDraft(executorContractId);

  const [kind, setKind] = useState<WizardKind>("upgrade");
  const [draftResult, setDraftResult] = useState<DraftResult>(EMPTY_DRAFT);
  const onDraftChange = useCallback((result: DraftResult) => setDraftResult(result), []);

  const preview = useMemo(
    () => (draftResult.status === "ready" ? previewDraft(draftResult.draft) : null),
    [draftResult],
  );

  const chooseKind = (next: WizardKind) => {
    setKind(next);
    setDraftResult(EMPTY_DRAFT);
    submit.reset();
  };

  const allowed = canOpenProposal(kind, accountId, council.data?.proposerAccountIds ?? []);
  const showRoleWarning = isConnected && council.data !== undefined && isContractProposalKind(kind) && !allowed;
  const showCouncilUnreadable = isConnected && council.isError && isContractProposalKind(kind);
  const copy = openProposalCopy(kind);

  const canSubmit =
    allowed &&
    draftResult.status === "ready" &&
    preview !== null &&
    isPreviewRecognized(preview) &&
    !submit.isPending &&
    !submit.isSuccess;

  const handleSubmit = () => {
    if (draftResult.status !== "ready") return;
    submit.mutate(draftResult.draft, {
      onSuccess: scheduleId => router.push(GOVERNANCE_ROUTES.proposal(scheduleId)),
    });
  };

  return (
    <div className="w-full max-w-[548px] mx-auto flex flex-col min-h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-base-300">
        <Link href={GOVERNANCE_ROUTES.home} className="btn btn-outline btn-sm" aria-label="Back to the governance home">
          ← Home
        </Link>
        <h1 className="m-0 text-base font-bold">New proposal</h1>
      </div>

      <div className="flex-1 flex flex-col gap-[18px] px-6 pt-[18px] pb-6">
        {!isConnected && (
          <div className="rounded-box bg-base-200 p-4 flex flex-col items-start gap-2">
            <p className="m-0 text-[13px]">
              Connect a wallet to propose. The proposal is opened and paid for by your account.
            </p>
            <ConnectWallet />
          </div>
        )}

        <OperationTypePicker value={kind} onChange={chooseKind} />

        {kind === "upgrade" && (
          <UpgradeVaultForm targets={upgradeTargets} chain={chain} onDraftChange={onDraftChange} />
        )}
        {kind === "treasuryTransfer" && (
          <TransferForm
            governanceAccountId={governanceAccountId}
            network={network}
            chain={chain}
            council={council.data?.key}
            onDraftChange={onDraftChange}
          />
        )}

        {draftResult.status === "invalid" && (
          <p role="alert" className="m-0 text-[13px] text-error">
            {draftResult.message}
          </p>
        )}

        {preview && <CouncilPreviewPanel preview={preview} council={council.data?.key} />}

        {showRoleWarning && (
          <p role="status" className="m-0 text-[13px] text-warning">
            {accountId} does not hold PROPOSER_ROLE on the registry, so registering this proposal would revert. A native
            proposal, such as paying a supplier, needs no role.
          </p>
        )}

        {showCouncilUnreadable && (
          <p role="status" className="m-0 text-[13px] text-warning">
            Could not read who holds PROPOSER_ROLE right now, so this proposal cannot be registered yet.
          </p>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2 px-6 pt-4 pb-5 border-t border-base-300 bg-base-100">
        <button className="btn btn-primary btn-block min-h-12" onClick={handleSubmit} disabled={!canSubmit}>
          {submit.isPending ? (
            <span className="loading loading-spinner loading-sm" aria-label="Waiting for the wallet" />
          ) : (
            copy.cta
          )}
        </button>
        <p className="m-0 text-[13px] text-base-content/60 leading-normal">{copy.note}</p>
        <MutationError error={submit.error} />
      </div>
    </div>
  );
}
