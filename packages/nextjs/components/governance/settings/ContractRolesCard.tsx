import { type ReactNode, useId } from "react";
import { SETTINGS_COPY } from "./copy";
import { administersItself, executorHoldersOf, proposerNamesOf } from "./registryRoles";
import type { RegistryRoles } from "@sh/core/governance/roles";
import type { SeatNaming } from "~~/components/governance/rail/councilSeats";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import type { CouncilQueryData } from "~~/hooks/mirror/useCouncil";

export type ContractRolesCardProps = {
  roles: RegistryRoles | undefined;
  rolesUnreadable: boolean;
  council: CouncilQueryData | undefined;
  councilUnreadable: boolean;
  config: Pick<GovernanceConfig, "governanceAccountId" | "executor">;
  naming: SeatNaming;
};

const RoleRow = ({ term, children }: { term: string; children: ReactNode }) => (
  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
    <dt className="w-32 shrink-0 font-mono text-xs font-semibold">{term}</dt>
    <dd className="m-0">{children}</dd>
  </div>
);

const Unreadable = ({ children }: { children: string }) => <span className="text-warning-ink">{children}</span>;

/** The proposers come from the council read, so a council read that failed with nothing cached leaves them unread. */
function proposerLine({ council, councilUnreadable, naming }: ContractRolesCardProps): ReactNode {
  if (council) return SETTINGS_COPY.roles.holders(proposerNamesOf(council.proposers, naming));
  if (councilUnreadable) return <Unreadable>{SETTINGS_COPY.roles.proposersUnreadable}</Unreadable>;
  return SETTINGS_COPY.roles.loading;
}

function executorLine({ roles, rolesUnreadable, config }: ContractRolesCardProps): ReactNode {
  if (rolesUnreadable) return <Unreadable>{SETTINGS_COPY.roles.unreadable}</Unreadable>;
  if (!roles) return SETTINGS_COPY.roles.loading;
  const holders = executorHoldersOf(roles.executors, config.governanceAccountId);
  if (holders.status === "treasuryOnly") return SETTINGS_COPY.roles.onlyTreasury(config.governanceAccountId);
  return SETTINGS_COPY.roles.holders(holders.holders);
}

function adminLine({ roles, rolesUnreadable, config }: ContractRolesCardProps): ReactNode {
  if (rolesUnreadable) return <Unreadable>{SETTINGS_COPY.roles.unreadable}</Unreadable>;
  if (!roles) return SETTINGS_COPY.roles.loading;
  const admins = [...new Set([...roles.proposerAdmins, ...roles.executorAdmins])];
  if (administersItself(admins, config.executor)) return SETTINGS_COPY.roles.registryItself;
  return SETTINGS_COPY.roles.holders(admins);
}

/**
 * Who may propose and who administers the roles, described as read from the registry: the proposers
 * come from the council read, the other two from the executor through the relay. Read-only — changing
 * a role is a proposal, so the card only says so.
 */
export const ContractRolesCard = (props: ContractRolesCardProps) => {
  const headingId = useId();
  const { council } = props;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-box border border-base-300 p-4">
      <h2 id={headingId} className="m-0 text-xs font-semibold text-primary">
        {SETTINGS_COPY.roles.heading}
      </h2>
      <dl className="m-0 flex flex-col gap-2 text-sm">
        <RoleRow term={SETTINGS_COPY.roles.proposer}>{proposerLine(props)}</RoleRow>
        <RoleRow term={SETTINGS_COPY.roles.executor}>{executorLine(props)}</RoleRow>
        <RoleRow term={SETTINGS_COPY.roles.admin}>{adminLine(props)}</RoleRow>
      </dl>
      {council && council.unresolvableProposers.length > 0 && (
        <p role="status" className="m-0 text-sm text-warning-ink">
          {SETTINGS_COPY.roles.unresolvable(council.unresolvableProposers)}
        </p>
      )}
      <p className="m-0 text-sm text-base-content/70">{SETTINGS_COPY.roles.note}</p>
    </section>
  );
};
