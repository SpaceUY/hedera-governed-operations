import { HASHSCAN_COPY } from "./copy";
import type { Proposal } from "@sh/core/governance/proposals";
import { type HederaNetworkName, getHashScanUrl } from "~~/utils/scaffold-hbar/networks";

export type HashScanLinksProps = {
  proposal: Pick<Proposal, "schedule" | "state" | "execution">;
  network: HederaNetworkName;
  /** Who created the schedule, named as the council rows name them. */
  creatorName: string;
  headingLevel: 2 | 3;
};

type HashScanLink = { label: string; href: string; tag?: string };

function linksOf({ proposal, network, creatorName }: Omit<HashScanLinksProps, "headingLevel">): HashScanLink[] {
  const { schedule, state, execution } = proposal;
  const links: HashScanLink[] = [
    {
      label: HASHSCAN_COPY.schedule(schedule.schedule_id),
      href: getHashScanUrl(network, "schedule", schedule.schedule_id),
      tag: HASHSCAN_COPY.scheduleTag[state.status],
    },
    {
      label: HASHSCAN_COPY.created(creatorName),
      href: getHashScanUrl(network, "transaction", schedule.consensus_timestamp),
    },
  ];
  if (execution.status === "succeeded" || execution.status === "failed") {
    links.push({
      label: HASHSCAN_COPY.executed(execution.transaction.result),
      href: getHashScanUrl(network, "transaction", execution.transaction.consensus_timestamp),
    });
  }
  return links;
}

/** The schedule, the transaction that created it and, once it ran, the scheduled transaction itself. */
export const HashScanLinks = ({ headingLevel, ...facts }: HashScanLinksProps) => {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-label={HASHSCAN_COPY.heading} className="flex flex-col gap-1">
      <Heading className="m-0 text-sm font-semibold">{HASHSCAN_COPY.heading}</Heading>
      <ul className="m-0 flex list-none flex-col p-0">
        {linksOf(facts).map(link => (
          <li key={link.href} className="border-t border-base-300 first:border-t-0">
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="link flex min-h-11 items-center gap-3 text-sm no-underline"
            >
              <span className="flex-1">{link.label}</span>
              {link.tag && <span className="font-mono text-xs text-base-content/60">{link.tag}</span>}
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="size-4 shrink-0 fill-none stroke-base-content/60"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5" />
              </svg>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
};
