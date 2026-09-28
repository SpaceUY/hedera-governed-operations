/**
 * Where a confirmation code arrives: `POST /approvals/{scheduleId}` with `{"code":"123456"}`.
 *
 * It is `node:http` and one route. An agent that holds a council seat and polls Mirror does not need
 * a framework to read six digits off a request, and adding one would put a router, a middleware
 * stack and a validation library into a template whose point is that every piece of it can be read.
 *
 * **It binds to loopback by default, and it is not meant to face the internet.** The code is the
 * only thing standing between a request and half a threshold signature, so the endpoint belongs
 * behind whatever already fronts this service — an SSH tunnel for an operator, an authenticated
 * internal route for a console. `AGENT_APPROVAL_HOST` is what opens it wider, deliberately.
 */
import type { ApprovalStore, ConfirmationOutcome } from "./approvals";
import { type Server, createServer } from "node:http";

const ROUTE = "/approvals/";

/** A confirmation is a schedule id and six digits; anything larger is not one. */
const MAX_BODY_BYTES = 1024;

export type ApprovalRequest = {
  method: string;
  /** Path only, without the query: a code never travels in one, where it would land in access logs. */
  path: string;
  body: string;
};

export type ApprovalResponse = {
  status: number;
  /** Absent on 204, which by definition carries none. */
  body?: string;
};

const answer = (status: number, error?: string): ApprovalResponse =>
  error === undefined ? { status } : { status, body: JSON.stringify({ error }) };

/**
 * What a code did, as a status.
 *
 * A code that was wrong and a code that was already used are both a 400 with one sentence, on
 * purpose: telling them apart would tell whoever is guessing that their six digits were right.
 */
function statusOf(outcome: ConfirmationOutcome, scheduleId: string): ApprovalResponse {
  if (outcome === "confirmed") return answer(204);
  if (outcome === "unknown") return answer(404, `no proposal ${scheduleId} is waiting for a confirmation`);
  if (outcome === "alreadyConfirmed") return answer(409, `${scheduleId} has already been confirmed`);
  return answer(400, "the code was not accepted");
}

function codeFrom(body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { code } = parsed as { code?: unknown };
  return typeof code === "string" ? code.trim() : null;
}

/** The whole endpoint as a function of its request, so the routing is testable without a socket. */
export function handleApproval(request: ApprovalRequest, approvals: ApprovalStore, now: Date): ApprovalResponse {
  if (!request.path.startsWith(ROUTE)) return answer(404, `no route ${request.path}`);
  if (request.method !== "POST") return answer(405, `${request.method} is not how a confirmation is sent`);

  const scheduleId = decodeURIComponent(request.path.slice(ROUTE.length));
  if (!scheduleId) return answer(404, "the path names no proposal");

  const code = codeFrom(request.body);
  if (code === null) return answer(400, 'the body has to be {"code":"123456"}');

  return statusOf(approvals.confirm(scheduleId, code, now), scheduleId);
}

/**
 * Reads the request body with a ceiling on it. An unbounded read on a socket anyone can open is how
 * a service with no other attack surface gets one.
 */
async function readBody(stream: AsyncIterable<Buffer>): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export type ApprovalEndpoint = { host: string; port: number };

/**
 * Starts listening, and rejects if it cannot. A confirmation endpoint that failed to bind would
 * leave every escalated proposal waiting on a code with nowhere to arrive, which from the outside
 * looks exactly like an agent that has stopped working.
 */
export function startApprovalServer(approvals: ApprovalStore, endpoint: ApprovalEndpoint): Promise<Server> {
  const server = createServer((request, response) => {
    void (async () => {
      const body = await readBody(request);
      const { status, body: payload } =
        body === null
          ? answer(413, `a confirmation is smaller than ${MAX_BODY_BYTES} bytes`)
          : handleApproval(
              // A query string is dropped rather than read: a code must never travel where an access
              // log would keep it.
              { method: request.method ?? "", path: (request.url ?? "").split("?")[0], body },
              approvals,
              new Date(),
            );

      response.writeHead(status, payload === undefined ? {} : { "content-type": "application/json" });
      response.end(payload);
    })();
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(endpoint.port, endpoint.host, () => resolve(server));
  });
}
