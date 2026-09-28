"use client";

import { useMemo } from "react";
import { type SeatName, councilSeatNames } from "./mapModel";
import { useMapDecorator } from "~~/components/governance/GovernanceProvider";
import { type CouncilOptions, useCouncil } from "~~/hooks/mirror/useCouncil";
import { useHederaSigner } from "~~/hooks/useHederaSigner";

/**
 * The current council's seats by the names the map beside the rail draws them with — its demo names
 * when the governance layout passes a decorator, the account ids otherwise, and the connected
 * account's seat marked. Undefined until the council is read.
 */
export function useCouncilSeatNames(options: CouncilOptions): SeatName[] | undefined {
  const council = useCouncil(options);
  const { accountId } = useHederaSigner();
  const decorate = useMapDecorator();
  return useMemo(
    () =>
      council.data &&
      councilSeatNames(council.data.key, council.data.proposers, { decorate, viewerAccountId: accountId }),
    [council.data, decorate, accountId],
  );
}
