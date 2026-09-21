"use client";

import { useCreateToken as useCreateTokenFromScaffoldHbarUi } from "@scaffold-hbar-ui/hooks";
import { useHederaSigner } from "~~/hooks/useHederaSigner";

export function useCreateToken() {
  const { requireAccountId } = useHederaSigner();
  return useCreateTokenFromScaffoldHbarUi({
    getTreasuryAccountId: requireAccountId,
  });
}
