import type { ComponentType, ReactNode } from "react";
import type { CouncilKey } from "@sh/core/governance/council";
import type { Chain } from "viem";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import type { DraftResult } from "~~/services/governance/drafts";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

/** What the wizard's host knows, from which a kind finds the contracts and ids it acts on. */
export type WizardHost = { config: GovernanceConfig; chain: Chain };

/** What the wizard gives every form, whatever its kind. */
export type SharedFormProps = {
  network: HederaNetworkName;
  chain: Chain;
  /** The current council once it is read, for a form that explains the threshold. */
  council: CouncilKey | undefined;
  onDraftChange: (result: DraftResult) => void;
};

/** A kind's form: the shared props plus the targets that kind resolved for itself. */
export type KindFormProps<Targets> = SharedFormProps & { targets: Targets };

/** What a kind acts on here, or why it cannot be proposed with this configuration. */
export type KindTargets<Targets> =
  | { status: "available"; targets: Targets }
  | { status: "unavailable"; notice: string };

export type KindIcon = ComponentType<{ className?: string }>;

/** The picker's hint read off the current council, for a kind whose hint is a number the ledger decides. */
export type KindHint = (council: CouncilKey) => string;

/** A kind as the wizard reads it: an icon, and either its form or the notice saying why there is none. */
export type WizardKindEntry = {
  icon: KindIcon;
  /** The picker's label, for a kind whose story is narrower than the proposal kind it opens. */
  title?: string;
  hint?: KindHint;
  open: (
    host: WizardHost,
  ) =>
    | { status: "unavailable"; notice: string }
    | { status: "available"; renderForm: (props: SharedFormProps) => ReactNode };
};

type KindDefinition<Targets> = {
  icon: KindIcon;
  /** The picker's label, for a kind whose story is narrower than the proposal kind it opens. */
  title?: string;
  hint?: KindHint;
  resolveTargets: (host: WizardHost) => KindTargets<Targets>;
  Form: ComponentType<KindFormProps<Targets>>;
};

/**
 * Pairs a kind's form with the targets it resolves from the host, keeping each kind's own targets
 * type inside its entry, so the registry is one record and the wizard renders a kind without knowing
 * which one it is.
 */
export function defineWizardKind<Targets>({
  icon,
  title,
  hint,
  resolveTargets,
  Form,
}: KindDefinition<Targets>): WizardKindEntry {
  return {
    icon,
    title,
    hint,
    open: host => {
      const resolved = resolveTargets(host);
      if (resolved.status === "unavailable") return resolved;
      return { status: "available", renderForm: props => <Form {...props} targets={resolved.targets} /> };
    },
  };
}
