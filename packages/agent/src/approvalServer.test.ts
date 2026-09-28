import { handleApproval, startApprovalServer } from "./approvalServer";
import { createApprovalStore } from "./approvals";
import { decodeBase32, totpCode, totpStepAt } from "./totp";
import { type AddressInfo, connect } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

const SECRET = decodeBase32("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");

const UPGRADE = "0.0.9001";
const NOW = new Date("2026-09-28T10:00:00.000Z");

const codeAt = (at: Date): string => totpCode(SECRET, totpStepAt(at));

const waitingStore = () => {
  const store = createApprovalStore(SECRET);
  store.awaitConfirmation(UPGRADE);
  return store;
};

const post = (path: string, body: string) => ({ method: "POST", path, body });

describe("a confirmation that arrives", () => {
  it("answers 204 and releases the proposal", () => {
    const approvals = waitingStore();

    const response = handleApproval(
      post(`/approvals/${UPGRADE}`, JSON.stringify({ code: codeAt(NOW) })),
      approvals,
      NOW,
    );

    expect(response.status).toBe(204);
    expect(response.body).toBeUndefined();
    expect(approvals.confirmed(NOW).has(UPGRADE)).toBe(true);
  });

  it("answers 400 on a code the clock does not match, without saying how close it was", () => {
    const response = handleApproval(post(`/approvals/${UPGRADE}`, '{"code":"000000"}'), waitingStore(), NOW);

    expect(response.status).toBe(400);
    expect(response.body).toContain("not accepted");
  });

  it("answers 400 the same way on a replay, since saying which would confirm the digits were right", () => {
    const approvals = waitingStore();
    approvals.awaitConfirmation("0.0.9002");
    const code = codeAt(NOW);
    handleApproval(post(`/approvals/${UPGRADE}`, JSON.stringify({ code })), approvals, NOW);

    const replay = handleApproval(post("/approvals/0.0.9002", JSON.stringify({ code })), approvals, NOW);
    const wrong = handleApproval(post("/approvals/0.0.9002", '{"code":"000000"}'), approvals, NOW);

    expect(replay).toEqual(wrong);
    expect(replay.status).toBe(400);
  });

  it("answers 404 for a proposal the agent is not waiting on", () => {
    const response = handleApproval(post("/approvals/0.0.7777", '{"code":"000000"}'), waitingStore(), NOW);

    expect(response.status).toBe(404);
    expect(response.body).toContain("0.0.7777");
  });

  it("answers 409 for one that has already been confirmed", () => {
    const approvals = waitingStore();
    handleApproval(post(`/approvals/${UPGRADE}`, JSON.stringify({ code: codeAt(NOW) })), approvals, NOW);

    const again = handleApproval(post(`/approvals/${UPGRADE}`, JSON.stringify({ code: codeAt(NOW) })), approvals, NOW);

    expect(again.status).toBe(409);
  });
});

describe("a request that is not a confirmation", () => {
  it("answers 405 to a method other than POST, which a browser would send by accident", () => {
    const response = handleApproval({ method: "GET", path: `/approvals/${UPGRADE}`, body: "" }, waitingStore(), NOW);

    expect(response.status).toBe(405);
  });

  it("answers 404 to any other path", () => {
    expect(handleApproval(post("/", ""), waitingStore(), NOW).status).toBe(404);
    expect(handleApproval(post("/approvals", ""), waitingStore(), NOW).status).toBe(404);
  });

  it("answers 404 when the path names no proposal", () => {
    expect(handleApproval(post("/approvals/", '{"code":"000000"}'), waitingStore(), NOW).status).toBe(404);
  });

  it("answers 400 to a path that is not a proposal id, rather than throwing out of the handler", () => {
    // `decodeURIComponent("%")` throws, and the throw used to reach nothing above this.
    expect(handleApproval(post("/approvals/%", '{"code":"000000"}'), waitingStore(), NOW).status).toBe(400);
  });

  it("answers 400 to a body that is not the one object this takes", () => {
    expect(handleApproval(post(`/approvals/${UPGRADE}`, ""), waitingStore(), NOW).status).toBe(400);
    expect(handleApproval(post(`/approvals/${UPGRADE}`, "123456"), waitingStore(), NOW).status).toBe(400);
    expect(handleApproval(post(`/approvals/${UPGRADE}`, '{"code":123456}'), waitingStore(), NOW).status).toBe(400);
  });
});

describe("the endpoint on a socket", () => {
  const servers: { close(): void }[] = [];

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
  });

  const start = async (approvals: ReturnType<typeof waitingStore>) => {
    const server = await startApprovalServer(approvals, { host: "127.0.0.1", port: 0 });
    servers.push(server);
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };

  it("takes a code over HTTP and releases the proposal", async () => {
    const approvals = waitingStore();
    const base = await start(approvals);

    const response = await fetch(`${base}/approvals/${UPGRADE}`, {
      method: "POST",
      body: JSON.stringify({ code: codeAt(new Date()) }),
    });

    expect(response.status).toBe(204);
    expect(approvals.confirmed(new Date()).has(UPGRADE)).toBe(true);
  });

  it("refuses a body too large to be a confirmation rather than reading it", async () => {
    const base = await start(waitingStore());

    const response = await fetch(`${base}/approvals/${UPGRADE}`, { method: "POST", body: "x".repeat(2048) });

    expect(response.status).toBe(413);
  });

  it("survives a path that is not a proposal id, which used to end the process", async () => {
    const base = await start(waitingStore());

    const response = await fetch(`${base}/approvals/%`, { method: "POST", body: '{"code":"000000"}' });

    expect(response.status).toBe(400);
    await expect(fetch(`${base}/approvals/${UPGRADE}`, { method: "POST", body: "{}" })).resolves.toBeDefined();
  });

  it("survives a client that hangs up halfway through its body", async () => {
    // An interrupted curl is enough to produce this, and it used to kill the council seat.
    const approvals = waitingStore();
    const base = await start(approvals);
    const port = Number(new URL(base).port);

    await new Promise<void>(done => {
      const socket = connect(port, "127.0.0.1", () => {
        socket.write("POST /approvals/0.0.9001 HTTP/1.1\r\nHost: x\r\nContent-Length: 50\r\n\r\n12345");
        setTimeout(() => {
          socket.destroy();
          done();
        }, 50);
      });
      socket.on("error", () => undefined);
    });

    const after = await fetch(`${base}/approvals/${UPGRADE}`, {
      method: "POST",
      body: JSON.stringify({ code: codeAt(new Date()) }),
    });
    expect(after.status).toBe(204);
  });

  it("refuses to start twice on the same port, so a bound endpoint is never assumed", async () => {
    const server = await startApprovalServer(waitingStore(), { host: "127.0.0.1", port: 0 });
    servers.push(server);
    const { port } = server.address() as AddressInfo;

    await expect(startApprovalServer(waitingStore(), { host: "127.0.0.1", port })).rejects.toThrow(/EADDRINUSE/);
  });
});
