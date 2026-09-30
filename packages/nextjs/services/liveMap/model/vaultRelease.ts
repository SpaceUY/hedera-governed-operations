/** Which of the vault's two implementations this template deploys an address is. */
export type VaultRelease = "first" | "next";

/** The addresses of the vault's two implementations on this deployment, when it recorded them. */
export type VaultReleases = { first?: string; next?: string };

const sameAddress = (left: string, right: string | undefined): boolean =>
  right !== undefined && left.toLowerCase() === right.toLowerCase();

/** Which of the vault's two releases `implementation` is, or null for any other code. */
export function releaseOf(implementation: string, releases: VaultReleases): VaultRelease | null {
  if (sameAddress(implementation, releases.first)) return "first";
  if (sameAddress(implementation, releases.next)) return "next";
  return null;
}
