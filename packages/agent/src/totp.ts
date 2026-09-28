/**
 * The six digits an authenticator app shows: RFC 6238, over HMAC-SHA-1 with a 30-second step.
 *
 * Those parameters are not a preference. They are what Google Authenticator, 1Password, Authy and
 * every other app produce for an `otpauth://` secret, and a template that chose SHA-256 or a
 * 60-second step would be a template whose confirmation codes no phone can generate.
 *
 * Nothing here decides anything: it answers which time step a code belongs to, and the caller is
 * what refuses a step it has already accepted. That split is deliberate — a function returning
 * "valid" would make replay protection somebody else's problem, and the same code stays valid for
 * its whole window.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** The interval a code lives for, and the unit of the counter it is generated from. */
export const TOTP_STEP_SECONDS = 30;

/**
 * How many steps either side of now are accepted. One is what every authenticator implementation
 * allows: the phone's clock and this host's are both approximately right, and a code typed in the
 * last second of a step arrives in the next one.
 */
export const TOTP_DRIFT_STEPS = 1;

const DIGITS = 6;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * RFC 4648 base32, the encoding every authenticator app takes a secret in. Padding, spaces and
 * lower case are all things a human copying a secret out of a provisioning screen will include, so
 * they are accepted; anything else is a typo worth refusing rather than decoding into a secret that
 * silently generates the wrong codes.
 */
export function decodeBase32(secret: string): Uint8Array {
  const normalized = secret.replace(/[\s=]/g, "").toUpperCase();
  if (normalized.length === 0) throw new Error("the secret is empty");

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of normalized) {
    const value = BASE32_ALPHABET.indexOf(character);
    if (value < 0) throw new Error(`the secret is not base32: ${character} is not one of ${BASE32_ALPHABET}`);
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/** The time step a moment falls in: the counter both sides of a TOTP derive their code from. */
export function totpStepAt(now: Date): number {
  return Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);
}

/**
 * HOTP for one counter (RFC 4226 §5.3): HMAC the eight big-endian bytes of the step, take the four
 * bytes the last nibble points at, and read six digits off them.
 */
export function totpCode(secret: Uint8Array, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", secret).update(counter).digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const truncated = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(truncated % 10 ** DIGITS).padStart(DIGITS, "0");
}

const isCodeShaped = (code: string): boolean => new RegExp(`^\\d{${DIGITS}}$`).test(code);

/**
 * Which step the code belongs to, or null if it belongs to none within the accepted drift.
 *
 * The comparison is constant-time so the answer does not leak how many leading digits were right,
 * which for a six-digit secret typed over a socket is the difference between a million guesses and
 * sixty.
 */
export function matchingTotpStep(code: string, secret: Uint8Array, now: Date): number | null {
  if (!isCodeShaped(code)) return null;

  const supplied = Buffer.from(code, "utf8");
  const current = totpStepAt(now);
  for (let offset = -TOTP_DRIFT_STEPS; offset <= TOTP_DRIFT_STEPS; offset += 1) {
    const step = current + offset;
    if (timingSafeEqual(supplied, Buffer.from(totpCode(secret, step), "utf8"))) return step;
  }
  return null;
}
