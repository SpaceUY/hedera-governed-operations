import { TOTP_STEP_SECONDS, decodeBase32, matchingTotpStep, totpCode, totpStepAt } from "./totp";
import { describe, expect, it } from "vitest";

/** The secret RFC 6238's test vectors are generated from, as an authenticator app would take it. */
const RFC_SECRET_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const RFC_SECRET = decodeBase32(RFC_SECRET_BASE32);

/**
 * RFC 6238 appendix B, SHA-1 column. The table publishes eight digits and an authenticator shows
 * six, which are its last six: the truncation is the same and only the modulus differs.
 */
const RFC_VECTORS = [
  { unixSeconds: 59, code: "287082" },
  { unixSeconds: 1111111109, code: "081804" },
  { unixSeconds: 1111111111, code: "050471" },
  { unixSeconds: 1234567890, code: "005924" },
  { unixSeconds: 2000000000, code: "279037" },
];

const at = (unixSeconds: number): Date => new Date(unixSeconds * 1000);

describe("the secret an authenticator app is given", () => {
  it("decodes the base32 of RFC 6238's own secret back to its bytes", () => {
    expect(Buffer.from(RFC_SECRET).toString("utf8")).toBe("12345678901234567890");
  });

  it("takes the spaces and lower case a human copies along with it", () => {
    expect(decodeBase32("gezd gnbv gy3t qojq")).toEqual(decodeBase32("GEZDGNBVGY3TQOJQ"));
  });

  it("takes the padding some provisioning screens print", () => {
    expect(decodeBase32("GEZDGNBVGY3TQOJQ====")).toEqual(decodeBase32("GEZDGNBVGY3TQOJQ"));
  });

  it("refuses a character base32 has no value for, rather than decoding a typo into a secret", () => {
    expect(() => decodeBase32("GEZDGNBV1")).toThrow(/not base32/);
  });

  it("refuses an empty secret", () => {
    expect(() => decodeBase32("  ")).toThrow(/empty/);
  });
});

describe("the code for a moment", () => {
  it.each(RFC_VECTORS)("matches RFC 6238 at $unixSeconds", ({ unixSeconds, code }) => {
    expect(totpCode(RFC_SECRET, totpStepAt(at(unixSeconds)))).toBe(code);
  });

  it("is the same for every second of one step, which is what makes replay worth guarding", () => {
    // 1111111110 is where the step begins, so both moments fall inside it.
    const start = totpStepAt(at(1111111110));
    const nearlyOver = totpStepAt(at(1111111110 + TOTP_STEP_SECONDS - 1));

    expect(nearlyOver).toBe(start);
    expect(totpCode(RFC_SECRET, nearlyOver)).toBe(totpCode(RFC_SECRET, start));
  });
});

describe("matching a code against the clock", () => {
  const NOW = at(1111111111);
  const step = totpStepAt(NOW);

  it("names the step a current code belongs to", () => {
    expect(matchingTotpStep(totpCode(RFC_SECRET, step), RFC_SECRET, NOW)).toBe(step);
  });

  it("accepts the previous step, since a code typed at the end of one arrives in the next", () => {
    expect(matchingTotpStep(totpCode(RFC_SECRET, step - 1), RFC_SECRET, NOW)).toBe(step - 1);
  });

  it("accepts the next step, for a phone whose clock runs ahead", () => {
    expect(matchingTotpStep(totpCode(RFC_SECRET, step + 1), RFC_SECRET, NOW)).toBe(step + 1);
  });

  it("refuses a code two steps old, which is a minute of drift rather than a clock difference", () => {
    expect(matchingTotpStep(totpCode(RFC_SECRET, step - 2), RFC_SECRET, NOW)).toBeNull();
  });

  it("refuses a code generated from another secret", () => {
    expect(matchingTotpStep(totpCode(decodeBase32("MFRGGZDF"), step), RFC_SECRET, NOW)).toBeNull();
  });

  it("refuses anything that is not six digits, before comparing it against anything", () => {
    expect(matchingTotpStep("12345", RFC_SECRET, NOW)).toBeNull();
    expect(matchingTotpStep("0501234", RFC_SECRET, NOW)).toBeNull();
    expect(matchingTotpStep("05047a", RFC_SECRET, NOW)).toBeNull();
  });

  it("keeps a code whose digits start with a zero, which one in ten of them does", () => {
    const zeroLeading = totpCode(RFC_SECRET, totpStepAt(at(1234567890)));

    expect(zeroLeading.startsWith("0")).toBe(true);
    expect(matchingTotpStep(zeroLeading, RFC_SECRET, at(1234567890))).toBe(totpStepAt(at(1234567890)));
  });
});

describe("the step", () => {
  it("advances once every thirty seconds, which is the window a code lives for", () => {
    expect(totpStepAt(at(TOTP_STEP_SECONDS)) - totpStepAt(at(0))).toBe(1);
    expect(totpStepAt(at(TOTP_STEP_SECONDS - 1))).toBe(totpStepAt(at(0)));
  });
});
