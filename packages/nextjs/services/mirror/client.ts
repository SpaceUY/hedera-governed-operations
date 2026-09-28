/**
 * Mirror Node REST API client: base URL per network, consistent error type,
 * generic GET and `links.next` pagination. No Hedera SDK required — HTTP only.
 *
 * Mirror lags consensus by a few seconds: freshly submitted entities may 404
 * and state such as a schedule's `executed_timestamp` needs polling.
 */
import { isEvmAddress } from "~~/utils/scaffold-hbar/identity";

const MIRROR_BASE: Record<string, string> = {
  testnet: process.env.HEDERA_MIRROR_TESTNET_URL?.trim() || "https://testnet.mirrornode.hedera.com",
  mainnet: process.env.HEDERA_MIRROR_MAINNET_URL?.trim() || "https://mainnet.mirrornode.hedera.com",
  previewnet: process.env.HEDERA_MIRROR_PREVIEWNET_URL?.trim() || "https://previewnet.mirrornode.hedera.com",
};

const DEFAULT_NETWORK = "testnet";
const DEFAULT_MAX_PAGES = 10;
const NANOS_PER_MILLI = 1_000_000;
const MILLIS_PER_SECOND = 1_000;
const ENTITY_ID_REGEX = /^\d+\.\d+\.\d+$/;

export type MirrorNetwork = "testnet" | "mainnet" | "previewnet";

export function getMirrorBaseUrl(network: string = DEFAULT_NETWORK): string {
  const key = network.toLowerCase();
  return MIRROR_BASE[key] ?? MIRROR_BASE.testnet;
}

/** Thrown on any non-2xx Mirror response; `status` lets callers treat 404 as "not indexed yet". */
export class MirrorNodeError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: string;

  constructor(status: number, url: string, body: string) {
    super(`Mirror node error ${status}: ${body}`);
    this.name = "MirrorNodeError";
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export function isMirrorNotFound(error: unknown): boolean {
  return error instanceof MirrorNodeError && error.status === 404;
}

export type MirrorRequestOptions = {
  network?: string;
  /** Extra `fetch` init (e.g. Next.js `next: { revalidate }`, `cache`, headers). */
  fetchOptions?: RequestInit;
  /** Abort signal; merged into the fetch init and overrides `fetchOptions.signal` when set. */
  signal?: AbortSignal;
};

function buildMirrorUrl(path: string, network: string): string {
  const base = getMirrorBaseUrl(network).replace(/\/$/, "");
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

export async function mirrorRequest<T>(path: string, options: MirrorRequestOptions = {}): Promise<T> {
  const { network = DEFAULT_NETWORK, fetchOptions, signal } = options;
  const url = buildMirrorUrl(path, network);
  const res = await fetch(url, {
    ...fetchOptions,
    ...(signal !== undefined ? { signal } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new MirrorNodeError(res.status, url, text || res.statusText);
  }

  return res.json() as Promise<T>;
}

/**
 * Generic GET against the Mirror Node base URL (positional form kept for existing callers).
 * Pass Next.js cache options via `fetchOptions` when calling from a Route Handler.
 */
export function mirrorGet<T>(
  path: string,
  network: string = DEFAULT_NETWORK,
  fetchOptions?: RequestInit,
  signal?: AbortSignal,
): Promise<T> {
  return mirrorRequest<T>(path, { network, fetchOptions, signal });
}

export type MirrorPage = {
  links?: {
    next: string | null;
  };
};

export type MirrorPaginateOptions = MirrorRequestOptions & {
  /** Upper bound on pages fetched (default 10) so a large collection cannot run away. */
  maxPages?: number;
};

/** Follows `links.next` (a base-relative path) and concatenates the items picked from each page. */
export async function mirrorGetAllPages<TPage extends MirrorPage, TItem>(
  path: string,
  pickItems: (page: TPage) => TItem[],
  options: MirrorPaginateOptions = {},
): Promise<TItem[]> {
  const { maxPages = DEFAULT_MAX_PAGES, ...requestOptions } = options;
  const items: TItem[] = [];
  let nextPath: string | null = path;
  let pagesFetched = 0;

  while (nextPath && pagesFetched < maxPages) {
    const page: TPage = await mirrorRequest<TPage>(nextPath, requestOptions);
    items.push(...pickItems(page));
    nextPath = page.links?.next ?? null;
    pagesFetched += 1;
  }

  return items;
}

export function assertValidEntityId(entityId: string, label: string): void {
  if (!entityId || !ENTITY_ID_REGEX.test(entityId)) {
    throw new Error(`Invalid ${label}: expected format 0.0.xxxxx, got ${entityId}`);
  }
}

export function isValidEntityId(entityId: string): boolean {
  return ENTITY_ID_REGEX.test(entityId);
}

/**
 * Both forms an id reaches these endpoints in: a `0.0.x` id, or the EVM address a decoded proposal
 * carries. Mirror resolves either on the account, token and contract lookups, so this is the check a
 * read or a query gate uses — never `isValidEntityId` alone, which would leave a card that was handed
 * a perfectly good address loading forever.
 */
export function isMirrorEntityRef(value: string): boolean {
  return isValidEntityId(value) || isEvmAddress(value);
}

export function assertMirrorEntityRef(value: string, label: string): void {
  if (isMirrorEntityRef(value)) return;
  throw new Error(`Invalid ${label}: expected format 0.0.xxxxx or an EVM address, got ${value}`);
}

/** Mirror timestamps are `seconds.nanos` strings; precision below milliseconds is dropped. */
export function mirrorTimestampToDate(timestamp: string | null | undefined): Date | null {
  if (!timestamp) return null;
  const [seconds, nanos = "0"] = timestamp.split(".");
  const millis = Number(seconds) * MILLIS_PER_SECOND + Math.floor(Number(nanos.padEnd(9, "0")) / NANOS_PER_MILLI);
  return Number.isFinite(millis) ? new Date(millis) : null;
}

/**
 * Orders two `seconds.nanos` timestamps exactly, for `sort`. Reading one as a single `Number` rounds
 * away the last digits of the nanos, and consensus can order related transactions nanoseconds apart,
 * such as the signature that completed a schedule's threshold and the transaction it ran.
 */
export function compareMirrorTimestamps(left: string, right: string): number {
  const [leftSeconds, leftNanos = "0"] = left.split(".");
  const [rightSeconds, rightNanos = "0"] = right.split(".");
  return (
    Number(leftSeconds) - Number(rightSeconds) || Number(leftNanos.padEnd(9, "0")) - Number(rightNanos.padEnd(9, "0"))
  );
}
