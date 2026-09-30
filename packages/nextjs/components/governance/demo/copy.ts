/**
 * Demo only: the words of "Sign as Alice / Bob". See `services/demoSigners/demoSigners.ts` for the
 * feature and the two steps that remove it.
 */
const listed = (names: readonly string[]): string =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export const DEMO_SIGNER_COPY = {
  /** On a demo member's row, in place of the map's caption. */
  badge: "demo key",
  signAs: (name: string) => `Sign as ${name}`,
  signingAs: (name: string) => `Signing as ${name}…`,
  /** The network took the signature; Mirror lists it a few seconds later, and the row then shows it. */
  sentAs: (name: string) => `Sent as ${name}`,
  /** Under the council, naming the demo members it seats. */
  note: (names: readonly string[]) =>
    names.length === 1
      ? `${names[0]} is a demo co-signer: the key lives server-side, testnet only.`
      : `${listed(names)} are demo co-signers: their keys live server-side, testnet only.`,
} as const;
