/**
 * The mutation keys of the governance writes, so a screen can ask the query cache what this session
 * has submitted (`useMutationState`) without holding any state of its own. Opening a proposal has two
 * paths that share a prefix.
 */
export const GOVERNANCE_MUTATION_KEYS = {
  sign: ["governance", "signProposal"],
  open: ["governance", "openProposal"],
  openRegistry: ["governance", "openProposal", "registry"],
  openNative: ["governance", "openProposal", "native"],
} as const;
