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
4. Signs what passed, with `ScheduleSign`. Reaching the threshold is what makes the network execute.

Every decision is one JSON line on stdout.

```json
{"at":"…","event":"decision","scheduleId":"0.0.10720313","outcome":"approved","kind":"treasuryTransfer","reason":"within policy","proposal":"Transfer 0.05 ℏ to 0.0.10671142 out of 0.0.10671146"}
{"at":"…","event":"decision","scheduleId":"0.0.10720281","outcome":"refused","kind":"treasuryTransfer","reason":"0.0.8192684 is not a recipient this agent pays","proposal":"Transfer 0.05 ℏ to 0.0.8192684 out of 0.0.10671146"}
```

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

| Rule | Limits |
| --- | --- |
| `upgrade` | `targets`, `implementations`, and `allowInitializer` (off by default) |
| `treasurySwap` | `maxAmountInTinybars`, `tokensOut`, `recipients` |
| `tokenAdmin` | `operations` (`pause`, `unpause`, `freeze`, `unfreeze`), `tokens` |
| `treasuryTransfer` | `maxTinybars`, `recipients`, and `tokens` for HTS transfers |

Three properties are worth more than the individual limits:

- **It fails closed.** A kind with no rule is refused. Writing a policy for swaps does not silently
  authorise upgrades, and a kind added to the template later is refused by every policy written
  before it existed.
- **A council rotation is never signed**, and no rule can change that. It is the operation that
  decides who governs — including whether this agent keeps its seat.
- **Amounts are tinybars in a string.** JSON numbers are doubles and would round a real balance
  above 2^53 without saying so.

The agent also refuses anything it cannot fully read: a body that did not decode, a registry entry
that is missing, cancelled, or could not be fetched, or a call to some other executor. An approver
that cannot tell what it is approving has one safe answer.

## Running it

```bash
cp packages/agent/.env.example packages/agent/.env   # then fill it in
yarn agent:start
```

On testnet the seat is one of the demo council members `yarn setup` creates: take
`demoAccounts.bob` out of `packages/nextjs/setup-state.json`. Set `AGENT_DRY_RUN=true` to watch it
decide against a real inbox without signing anything — the way to try a new policy.

In Docker, built from the repository root:

```bash
docker build -f packages/agent/Dockerfile -t governed-operations-agent .
docker run --rm --env-file packages/agent/.env \
  -v "$PWD/packages/agent/policy.example.json:/policy.json:ro" \
  -e AGENT_POLICY_FILE=/policy.json \
  governed-operations-agent
```

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

| File | |
| --- | --- |
| `src/policy.ts` | the limits, one typed check per kind — a map, not a rule engine |
| `src/operation.ts` | proposal → the flat operation a policy is written against, and every reason one cannot be read |
| `src/review.ts` | one pass over the inbox: decide, then sign what passed |
| `src/config.ts` | environment and policy file, validated at boot |
| `src/index.ts` | the loop, the Hedera client, and the log |
