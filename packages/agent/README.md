# The co-signing agent

A service that holds **one seat on the council** and signs the proposals its policy allows.

It is not a bot with the keys to the treasury. The governance account's key is m-of-n, the agent is
one of the n, and anything it approves still needs the rest of the threshold from humans. What it
removes is the waiting: a routine proposal inside written limits gets its second signature in
seconds instead of whenever somebody opens their wallet, and a proposal outside them gets a refusal
with a reason attached.

## What it does, once every poll

1. Reads the council's inbox from the Mirror Node — the same `fetchProposalInbox` the app's screens
   use, from `@sh/core`. There is one implementation of what a proposal means, not two.
2. Flattens each proposal into the operation it actually performs. For the three kinds that go
   through `GovernedExecutor` that means reading the registry entry behind `execute(id)` as well as
   the scheduled body: the body alone only says "entry 7".
3. Runs the policy for that kind of operation.
4. Asks a person, when the policy says that kind needs one — see [Human in the loop](#human-in-the-loop).
5. Signs what passed, with `ScheduleSign`. Reaching the threshold is what makes the network execute.
6. Publishes the decision to an HCS topic — see [The decision log](#the-decision-log).

Every decision is also one JSON line on stdout. These two are from an earlier deployment of the same
contracts:

```json
{"at":"…","event":"decision","scheduleId":"0.0.10720313","outcome":"approved","kind":"treasuryTransfer","reason":"within policy","proposal":"Transfer 0.05 ℏ to 0.0.10671142 out of 0.0.10671146","confirmation":"notRequired"}
{"at":"…","event":"decision","scheduleId":"0.0.10720281","outcome":"refused","kind":"treasuryTransfer","reason":"0.0.8192684 is not a recipient this agent pays","proposal":"Transfer 0.05 ℏ to 0.0.8192684 out of 0.0.10671146","confirmation":"notRequired"}
```

A decision has four outcomes. `approved` and `refused` are the policy's answer; `skipped` is a
proposal that needs nothing, already settled or already carrying this agent's signature; `pending` is
one the policy allows and a person has not released yet.

## Nothing is signed without a seat

The council grants and revokes the seat by rotation, so whether it still holds this agent's key is
read from the ledger on **every pass** rather than once at boot. The agent starts signing when a
rotation adds it and stops when one takes it away, and nobody restarts the service for either.

Without a seat it still reads the inbox, decides and logs — an approval comes out as
`approved-not-signed` — and one `seat-missing` line says why, on the pass the state changes rather
than on every poll. The approval is held back from the decision topic: "approved" next to a schedule
this agent never signed is a record that reads as a lie. A refusal goes to the topic either way,
because the policy's answer does not depend on a seat.

This is a check rather than a comment because of what a seatless signature actually does. Measured on
testnet with a throwaway account ([tx](https://hashscan.io/testnet/transaction/1790689829.352430104)): `ScheduleSign` from a key the council does not hold answers `NO_NEW_VALID_SIGNATURES`, is
**charged the same fee as a signature that counted, and leaves no row on the schedule**. No row means
nothing remembers the attempt — `isSignedByKey` reads false again — so the next pass repeats it,
every poll, for as long as the proposal stays open. Not a wasted fee: a drain.

It is not silent either, and that is worse than it sounds. Every attempt logs `signature-failed` with
`NO_NEW_VALID_SIGNATURES`, which is the symptom and not the cause — it reads like the Mirror-lag race
the agent already guards against — under a decision line that still says `approved` for a schedule
nothing signed.

### Seeing it

This is where a fresh `yarn setup` leaves it. The agent's account is created **outside** the council,
with a decision topic of its own, so the first `yarn agent:start` reads the real inbox, decides under
the real policy and logs `seat-missing`. Seating it is a proposal like any other: "Add the co-signing
agent" in the app rotates the council from 2-of-3 to 2-of-4, two human members approve it, and the
running process says `seat-held` on its next pass and starts signing. A rotation that drops its key
takes it back to `seat-missing` the same way.

## The policy

A JSON file, mounted rather than baked in, because it is a document somebody reviews rather than
configuration somebody tweaks. `policy.example.json` is the shape; every field is validated at boot
and the agent refuses to start on anything it does not fully understand — including a key no rule
reads, since a limit its author believes is in force and nothing enforces is the worst kind.

```json
{
  "treasuryTransfer": { "maxTinybars": "5000000000", "recipients": ["0.0.1234"] },
  "tokenAdmin": { "operations": ["pause", "unpause"], "tokens": ["0x…"] }
}
```

| Rule               | Limits                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `upgrade`          | `targets`, then `implementations` or `manifestTopicId` (one is required), and `allowInitializer` (off by default) |
| `treasurySwap`     | `maxAmountInTinybars`, `tokensOut`, `recipients`                                                                  |
| `tokenAdmin`       | `operations` (`pause`, `unpause`, `freeze`, `unfreeze`), `tokens`                                                 |
| `treasuryTransfer` | `maxTinybars`, `recipients`, and `tokens` for HTS transfers                                                       |

Every rule also takes `requireConfirmation`, which is not a limit but an escalation: see below.

Three properties are worth more than the individual limits:

- **It fails closed.** A kind with no rule is refused. Writing a policy for swaps does not silently
  authorise upgrades, and a kind added to the template later is refused by every policy written
  before it existed.
- **A council rotation is never signed**, and no rule can change that. It is the operation that
  decides who governs — including whether this agent keeps its seat.
- **Amounts are tinybars in a string.** JSON numbers are doubles and would round a real balance
  above 2^53 without saying so.

### Which implementation an upgrade may point at

An upgrade proposal says "point the proxy at 0xabc…", and there are two ways for a policy to answer
whether that address is trustworthy. `implementations` is a list of addresses. `manifestTopicId`
names an HCS topic carrying release manifests, and the agent then checks that the code **deployed at**
the proposed address hashes to what a release published for it. One of the two is required; a rule
with neither would approve any implementation at all for a listed proxy, and `parsePolicy` refuses to
start on it.

The manifest is the stronger of the two, because an allowlist answers "is this address blessed" and
cannot answer "is the code at it the build we blessed". Verified on testnet, all three outcomes
([schedule 0.0.10720729](https://hashscan.io/testnet/schedule/0.0.10720729) approved and [schedule 0.0.10720730](https://hashscan.io/testnet/schedule/0.0.10720730) refused against [topic 0.0.10720712](https://hashscan.io/testnet/topic/0.0.10720712); the mismatch
against a deliberately tampered manifest on [topic 0.0.10720804](https://hashscan.io/testnet/topic/0.0.10720804)):

|                                             |                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| the deployed code matches a release         | `approved` — the reason names the version                                     |
| no release names the address                | `refused` — "no release on topic 0.0.… names the implementation 0x…"          |
| a release names it, the code does not match | `refused` — "the code at 0x… does not match the release published for v2.0.0" |

**The topic needs a submit key, and the agent checks for one before it starts.** HCS lets any account
write to a topic created without one, so manifests on an open topic say that somebody published those
bytes — not that this team did, which is the only thing worth checking against. `yarn setup` creates
the release topic with the operator as its submit key; a policy pointing at a topic without one makes
the agent refuse to start rather than run a check that cannot fail closed. Reading is public either
way, so anyone can still repeat the comparison.

A check that could not be run is a refusal too. Not run is not passed. So is a search that ran out of
pages before it ran out of topic: the refusal then says it read the N most recent releases rather than
claiming the topic holds none.

Publishing is `yarn release:publish --contract AcmeVault --version v2.0.0`, which reads the
implementation address `yarn hardhat:deploy` recorded, hashes the runtime bytecode the Mirror Node
reports for it, and submits the manifest to the topic `yarn setup` created. Anyone can repeat the
check from HashScan: read the topic, take the `bytecodeHash`, and compare it against
`GET /contracts/{id}` for the address.

The agent also refuses anything it cannot fully read: a body that did not decode, a registry entry
that is missing, cancelled, or could not be fetched, or a call to some other executor. An approver
that cannot tell what it is approving has one safe answer.

## Human in the loop

Once seated, the agent holds one of the council's keys — one of four in the demo, which still needs
two — so every signature it sends is **half a threshold delivered on a policy nobody watched it
apply**. For most of what it signs that is the point: a transfer is bounded by an amount and a list
of recipients, and waiting for somebody to open a wallet adds nothing. For the operations whose limits cannot bound their impact it is not enough — an upgrade
replaces the code behind the proxy, and no list of addresses says what that code does.

So a rule can ask for a person as well:

```json
{
  "upgrade": { "targets": ["0x…"], "manifestTopicId": "0.0.…", "requireConfirmation": true },
  "treasuryTransfer": { "maxTinybars": "5000000000", "recipients": ["0.0.…"] }
}
```

A proposal under that upgrade rule is decided as usual and then waits, as `pending`, until a
confirmation code arrives. The transfer is signed on its own, seconds after it appears. **The policy
is what draws that line**, and a policy that demanded a code for everything would be a policy with no
agent in it.

It is off by default. `parsePolicy` refuses a key no rule reads, so a misspelled
`requireConfirmations` stops the agent at boot rather than quietly leaving an upgrade unguarded; the
only way to lose the escalation is to leave it out, the same as any other limit.

### The code

RFC 6238 TOTP over HMAC-SHA-1, six digits, a 30-second step, one step of drift accepted either side.
Those are not preferences — they are what every authenticator app generates, so the secret goes into
1Password, Google Authenticator or `oathtool` and the codes match. The secret is base32 in
`AGENT_TOTP_SECRET`, is never logged, and never leaves the process. **Generate it; do not type one.**
RFC 4226 §4 R6 asks for at least 128 bits and the agent refuses to start under sixteen bytes — base32
decodes a short string to very few, and `A` to no key at all, which is an HMAC key everybody has:

```bash
# 20 random bytes as base32, which is what an authenticator takes
node -e "const b=require('node:crypto').randomBytes(20),A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let s='',x=0,n=0;for(const v of b){x=(x<<8)|v;n+=8;while(n>=5)s+=A[(x>>(n-=5))&31]}console.log(s)"
```

**A code cannot be used twice.** The agent remembers the last time step it accepted one from and
refuses anything at or below it, so a code read over somebody's shoulder or out of a proxy log is
already spent. That memory is deliberately one counter for the whole agent rather than one per
proposal: a code is generated from the clock and the secret and says nothing about which proposal it
is for, so a counter per proposal would let a code captured for one release another inside the same
window. The cost is that confirming two proposals means waiting for the next 30-second step.

**And it cannot be guessed at.** Six digits is a million and the drift window makes three of them
valid at once, so a step stops being answered after five wrong codes — the throttling RFC 6238 §5.2
asks for, which turns the search from hours into decades. It resets with the next code rather than
locking the endpoint, because an endpoint that can be locked shut from outside denies the very
approval it guards.

### Sending one

```bash
curl -i -XPOST 127.0.0.1:8787/approvals/0.0.10720313 -d '{"code":"123456"}'
```

The address is `127.0.0.1` rather than `localhost` on purpose: on a dual-stack host `localhost`
resolves to `::1` first, and a server bound to the IPv4 loopback is not there.

| Status |                                                              |
| ------ | ------------------------------------------------------------ |
| `204`  | accepted; the agent signs on its next pass                   |
| `400`  | the body is not `{"code":"…"}`, or the code was not accepted |
| `404`  | no proposal by that id is waiting for a confirmation         |
| `405`  | a method other than POST                                     |
| `409`  | that proposal has already been confirmed                     |
| `413`  | a body too large to be a confirmation                        |

A wrong code and a replayed one answer the same 400 with the same sentence. Telling them apart would
tell whoever is guessing that their six digits were right.

**It binds to `127.0.0.1` and is not meant to face the internet.** The code is the only thing between
a request and half a threshold signature, so the endpoint belongs behind whatever already fronts this
service — an SSH tunnel for an operator, an authenticated internal route for a console.
`AGENT_APPROVAL_HOST` is what opens it wider, and doing so is a decision, not a default. The server
only listens at all when a secret is configured: a policy that escalates nothing has nothing to
confirm.

### What is deliberately not here

**Notifying the person.** There is no mail, no chat webhook, no queue. A proposal entering `pending`
is a line on stdout and a message on the decision topic, and either is enough to drive a notifier
that already exists. In code the hook is `ApprovalStore.awaitConfirmation`, which is called on the
transition into waiting and nowhere else. Bringing a transport in would add a dependency, a set of
credentials and a retry policy to a service whose whole argument is that it can be read end to end.

**Surviving a restart.** Pending approvals are process memory, like the signatures a pass remembers
sending. Restarting the agent means asking for a code again — which is the right failure: a
confirmation nobody watched being made, still standing after the process that asked for it is gone,
is worse than one more code. A confirmation also lapses on its own after fifteen minutes and the
proposal goes back to waiting, which only matters when signing keeps failing: a code somebody typed a
quarter of an hour ago should not still be authorising a transaction.

## The decision log

Every decision — the checks it ran, the outcome, and whether a person released it — goes to an HCS
topic as one JSON message. This one is message 1 on the demo instance's decision topic
([topic 0.0.10794625](https://hashscan.io/testnet/topic/0.0.10794625)), posted by the agent's own
account:

```json
{
  "schema": "governed-operations/agent-decision/1",
  "scheduleId": "0.0.10797084",
  "outcome": "approved",
  "reason": "within policy",
  "kind": "treasuryTransfer",
  "proposal": "Transfer 0.5 ℏ to 0.0.10794946 out of 0.0.10794626",
  "confirmed": false,
  "agentAccountId": "0.0.10794623",
  "decidedAt": "2026-09-30T19:59:46.782Z"
}
```

The `reason` is where the checks show: `within policy` is the limits alone, `within policy, release
v2.0.0` is the limits and the manifest check, and a refusal names the limit it failed. `confirmed`
says whether a person was in the loop. Consensus timestamps the message, so the log is ordered by
something other than the agent's own clock.

**The topic's submit key is the agent's own, not the operator's.** That is the whole difference from
the release topic: a manifest claims "this team published this build", so the publisher is the team;
a decision claims "this agent approved this proposal", so the publisher is the agent. A log the
operator could also write to would be a log of what somebody said the agent did. `yarn setup` creates
it with the key of the agent's own account and keeps the admin key on the operator, so the submit key
can be rotated when the agent's key changes; in a real deployment the key belongs to whatever
identity runs the service. The agent refuses to start on a topic anyone can publish to, and on one
whose single submit key is not its own — every message it sent there would come back
`INVALID_SIGNATURE`.

Publishing never blocks a decision. It happens after deciding and signing, and a failure is logged
and stepped over: a fee that failed is not a reason to stop holding a council seat, and the next pass
retries it. Two records are deliberately never written — a skip, which says nothing about the policy,
and an approval whose `ScheduleSign` failed, which would put "approved" on the topic next to a
schedule the agent never signed. Each message costs a fee, so a verdict is published once and again
only when it changes — across restarts too: at boot the agent reads its own newest message per
proposal back off the topic (`decisions-recalled` in the log) and publishes only what differs. If
the Mirror Node cannot be read then, it starts with nothing recalled and logs
`decisions-not-recalled`: at worst a verdict already on the topic is paid for once more. Agents
before this recall republished on every restart, so a topic can hold the same verdict more than
once; a reader takes the newest message per `scheduleId`.

## Running it

```bash
cp packages/agent/.env.example packages/agent/.env   # then fill it in
yarn agent:start
```

Filling it in includes generating `AGENT_TOTP_SECRET`: `policy.example.json` asks for a confirmation
on upgrades, and a policy that escalates with no secret refuses to start rather than leaving those
proposals waiting on a code nobody can produce.

On testnet the agent's account is the one `yarn setup` creates for it: take `demoAccounts.agent` out
of `packages/nextjs/setup-state.json`. It is not a council member until the council seats it (see
"Nothing is signed without a seat"), and its key is the one `yarn setup` gives the decision topic, so
a different account means a different topic — re-running `yarn setup` replaces a decision topic whose
submit key is not the agent's. Set `AGENT_DRY_RUN=true` to watch it
decide against a real inbox without signing anything and without publishing anything — the way to try
a new policy. It still checks the decision topic at boot, because a dry run is for trying a policy
and not for finding out later that the log it would have written to belongs to somebody else.

The agent pays for what it does out of its own account: a fee per `ScheduleSign` and a fee per
decision published. A seat with no HBAR decides and then fails at both.

In Docker, built from the repository root:

```bash
docker build -f packages/agent/Dockerfile -t governed-operations-agent .
docker run --rm --env-file packages/agent/.env \
  -v "$PWD/packages/agent/policy.example.json:/policy.json:ro" \
  -e AGENT_POLICY_FILE=/policy.json \
  -p 127.0.0.1:8787:8787 -e AGENT_APPROVAL_HOST=0.0.0.0 \
  governed-operations-agent
```

The key reaches the container through `--env-file` and never through the image: `.dockerignore` at the
repository root keeps every `.env` out of the build context, and it has to live there rather than next
to the Dockerfile because Docker reads the one at the root of the context. The endpoint has to bind
`0.0.0.0` **inside** the container to be reachable at all, which is why the published port is pinned
back to `127.0.0.1` on the host: the loopback default only means something where the process runs.

## Custody

The demo reads a private key from the environment, which is the right amount of ceremony for a
testnet fixture and the wrong amount for anything else. A production seat belongs behind a signing
service that never releases the key — an HSM or a custody provider with Hedera support — with this
service calling out to it for a signature. The shape of the code is ready for that: signing is a
single injected function, `SignSchedule`, and everything above it is a decision rather than a
secret. Nothing else in the agent touches the key.

The seat is also revocable without touching this service. The council can rotate its threshold key
to drop the agent's member key, which is itself a proposal the humans approve — and one the agent
will not sign for them.

## Layout

| File                                  |                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/policy.ts`                       | the limits, one typed check per kind — a map, not a rule engine                                |
| `src/operation.ts`                    | proposal → the flat operation a policy is written against, and every reason one cannot be read |
| `src/review.ts`                       | one pass over the inbox: decide, then sign what passed                                         |
| `src/totp.ts`                         | RFC 6238, and only that: which step a code belongs to, never whether it may be used            |
| `src/approvals.ts`                    | the proposals waiting on a person, the replay guard, and where a notification would hook       |
| `src/approvalServer.ts`               | `POST /approvals/{scheduleId}` on `node:http`, one route                                       |
| `src/publish.ts`                      | which decisions reach the topic, and what a record must never claim                            |
| `src/config.ts`                       | environment and policy file, validated at boot                                                 |
| `@sh/core/governance/releaseManifest` | the manifest itself: what a release publishes, and the check against the deployed code         |
| `@sh/core/governance/decisionLog`     | the decision record: what is published, and the topic's submit key                             |
| `src/index.ts`                        | the loop, the Hedera client, and the log                                                       |
