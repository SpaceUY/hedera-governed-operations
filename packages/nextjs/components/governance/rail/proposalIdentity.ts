/**
 * What a proposal is, as its card and its detail name it: a title, whether it goes through the
 * registry or is native, and the icon for its kind. A registry call is only as known as the entry
 * behind it — once that entry was read, the card names the operation the entry holds; before, it
 * says which entry it runs. A body nobody can describe is named by the reason, and flagged.
 */
import type { OperationIconKind } from "./OperationIcon";
import type { ProposalFamily } from "./copy";
import { describeRegistryOperation, describeScheduledOperation } from "@sh/core/governance/proposalTypes";
import type { Proposal } from "@sh/core/governance/proposals";
import { PROPOSAL_KIND_COPY } from "~~/components/governance/wizard/copy";
import { councilChangeTitle } from "~~/services/governance/proposalLabels";

export type ProposalIdentity = {
  title: string;
  /** The decoder could not describe it: the title is the reason, and the screen shows it as a warning. */
  unrecognized: boolean;
  family: ProposalFamily | null;
  iconKind: OperationIconKind;
};

export function proposalIdentityOf({
  operation,
  registry,
}: Pick<Proposal, "operation" | "registry">): ProposalIdentity {
  if (operation.kind === "unrecognized") {
    return { title: describeScheduledOperation(operation), unrecognized: true, family: null, iconKind: "unrecognized" };
  }
  if (operation.kind !== "registryCall") {
    return {
      title:
        operation.kind === "councilRotation"
          ? councilChangeTitle(operation.council)
          : PROPOSAL_KIND_COPY[operation.kind].title,
      unrecognized: false,
      family: "native",
      iconKind: operation.kind,
    };
  }
  if (registry.status !== "read") {
    return {
      title: describeScheduledOperation(operation),
      unrecognized: false,
      family: "contract",
      iconKind: "registryCall",
    };
  }
  const entry = registry.entry.operation;
  if (entry.kind === "unrecognized") {
    return {
      title: describeRegistryOperation(entry),
      unrecognized: true,
      family: "contract",
      iconKind: "unrecognized",
    };
  }
  return { title: PROPOSAL_KIND_COPY[entry.kind].title, unrecognized: false, family: "contract", iconKind: entry.kind };
}

/** The operation in full, as the decoder read it: the registry entry's for a registry call once it was read. */
export function operationSummaryOf({ operation, registry }: Pick<Proposal, "operation" | "registry">): string {
  if (operation.kind === "registryCall" && registry.status === "read") {
    return describeRegistryOperation(registry.entry.operation);
  }
  return describeScheduledOperation(operation);
}
