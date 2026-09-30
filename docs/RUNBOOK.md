# Runbook

Step-by-step reproduction on Hedera **testnet**, from a fresh account to a proposal the council approves and the network executes, verified on the Mirror Node and HashScan. Every command is copy-pasteable; replace the `0.0.xxxxx` placeholders with your own ids.

## 1. Get a testnet operator account

1. Sign in at [portal.hedera.com](https://portal.hedera.com) and create a **testnet** account. Choose an **ECDSA** key when offered; it also gives the account an EVM alias, which some tooling (including the harness chain validation) expects.
2. Note the **Account ID** (`0.0.xxxxx`) and the **DER-encoded private key**. The portal funds the account with test HBAR; you can top it up from the same page.

## 2. Configure the environment

```bash
cp packages/nextjs/.env.example packages/nextjs/.env
```

Fill in:

```dotenv
HEDERA_OPERATOR_ID=0.0.xxxxx
HEDERA_OPERATOR_PRIVATE_KEY=...
HEDERA_COUNCIL_ACCOUNT_ID=0.0.xxxxx
HEDERA_NETWORK=testnet
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=...
```

- `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` comes from [cloud.reown.com](https://cloud.reown.com) (create a project, copy its id).
- The operator key is only read by the scripts (`yarn setup`, `yarn release:publish`, `yarn harness:council-seat`), never by the app. Never prefix it with `NEXT_PUBLIC_`.
- `HEDERA_COUNCIL_ACCOUNT_ID` is **your own account** — the one you will connect with HashPack in step 4. It becomes one of the governance account's keys (one of three after `yarn setup`, one of four once the council seats the co-signing agent) and is granted `PROPOSER_ROLE`, so without it you could watch the demo but not take part in it. It can be the operator account if you have no other, but then no human signature is involved in an approval. Changing it after step 3 means a new governance account and a fresh deployment, so pick it now.

## 3. Bootstrap testnet resources

Three commands, in this order: `yarn setup`, the deploy, and `yarn setup` again. The order is not a preference, it is forced by two dependencies that cross the workspace boundary:

1. `GovernedExecutor` is deployed **against** the governance account — that account's address is a constructor argument, and the proposer list is another — so the account has to exist before any contract does.
2. The demo token's pause and freeze keys are the `TokenAdmin` **contract id**, and a token created without an admin key can never have its keys changed — so the contract has to exist before the token does.

`yarn setup` therefore runs twice, on either side of the deploy. It is idempotent: every run verifies what it already knows against the network and creates only what is missing, and it refuses to run against anything but testnet.

### 3.1 Governance account and demo accounts

```bash
yarn install
yarn setup
```

This creates the agent's release and decision topics, three funded demo accounts associated with testnet USDC (`alice` and `bob`, and `agent`, the co-signing agent's own account) and the **governance account**: a 2-of-3 threshold key over your own account, `alice` and `bob`. The agent is not a member: the council seats it later by approving "Add the co-signing agent". It associates USDC on the governance account too — the treasury swap pays its output there, and a token that arrives from inside a contract call cannot be associated on the way in. It then writes `GOVERNANCE_ACCOUNT_ADDRESS` and `INITIAL_PROPOSERS` into `packages/hardhat/.env` — the two values the deploy refuses to run without — and stops, telling you what is not deployed yet. On a fresh scaffold `deployedContracts.ts` already lists the template's demo contracts; the setup checks that their executor answers to your governance account, sees it does not, and stops the same way.

Nothing else can be created at this point, and the run says so:

```
  Not deployed yet: GovernedExecutor, AcmeVault, AcmeVaultV2, SaucerSwapAdapter, TokenAdmin. …
```

### 3.2 Deploy the contracts

The deploy signs with its own account, separate from the operator and encrypted on disk. Create it and fund it with test HBAR (the [portal](https://portal.hedera.com) faucet, or a transfer to the address it prints):

```bash
yarn hardhat:account:generate     # prints the deployer address; asks for a password
yarn hardhat:account              # shows its balance once you have funded it
```

Then deploy all five contracts, in the order their dependencies impose:

```bash
yarn hardhat:deploy --network hederaTestnet
```

This rewrites `packages/nextjs/contracts/deployedContracts.ts` with every address, ABI and native `0.0.x` contract id. Optionally verify the sources on Sourcify:

```bash
yarn hardhat:verify:testnet
```

### 3.3 Demo token and the first proposal

```bash
yarn setup
```

The second run finds the contracts and finishes the fixtures: the HTS token whose pause and freeze keys are the `TokenAdmin` contract, a balance for `bob` so the freeze in the demo has something to act on, and one **pending proposal** — an upgrade of `AcmeVault` to `AcmeVaultV2` — registered in `GovernedExecutor`. It is an entry, not a schedule yet: nobody can sign it until someone schedules `execute(id)` for the council, and the app has no page for an entry without a schedule. Step 5 walks a proposal that is scheduled from the start. Every id lands in `packages/nextjs/.env.local`.

A third run creates nothing. That is the check that the bootstrap is complete:

```
  = Governance account 0.0.xxxxx (2-of-3) (reused)
  = Demo token 0.0.xxxxx (reused)
  = Seed proposal #0 (upgrade AcmeVault to AcmeVaultV2) (reused)
```

Verify the release topic (`NEXT_PUBLIC_RELEASE_TOPIC_ID` in `.env.local`) exists on the Mirror Node:

```bash
curl -s "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.xxxxx" | jq '{topic_id, memo, created_timestamp}'
```

## 4. Run the app and connect HashPack

```bash
yarn next:dev
```

1. Open http://localhost:3000. The live map shows the treasury figures, the council's threshold and the pending proposals (or the **Governance is not set up yet** notice until step 3 has run).
2. Click **Connect**, choose HashPack and approve the WalletConnect pairing in the extension (the wallet must be on **testnet**).
3. The header shows your account as `0.0.xxxxx` once the session is live.

## 5. Take a proposal from open to executed

This is the journey the template exists for: you propose an operation, the council signs it from its own wallets, and the network runs it the moment the threshold is met. It uses a treasury transfer because that is the shortest path through it — a native `CryptoTransfer`, one wallet transaction to open, no contract, no registry entry and no `PROPOSER_ROLE` needed to schedule it. The role still decides where it shows up: Mirror cannot list schedules by payer, so the map's inbox and the agent's are the schedules created by `PROPOSER_ROLE` holders, and `yarn setup` granted the role to your council account, the operator, alice and bob. A native proposal from any other account runs just the same, but is reachable only by its schedule id. Every other kind reaches the council the same way; the contract-backed ones only add a registration in front (see "Opening a proposal" in `docs/GOVERNANCE_UI.md`).

The council is the 2-of-3 key `yarn setup` put on the governance account: your own account (`HEDERA_COUNCIL_ACCOUNT_ID`) and the two demo accounts, `alice` and `bob`. The co-signing agent has an account of its own, `agent`, outside the council; approving "Add the co-signing agent" seats it and makes the council 2-of-4 — your account, alice, bob and the agent (5.4). That is the state of the template's published demo instance, the one the app reads without a `.env`. The ids are in `packages/nextjs/.env.local` (`NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID`, `NEXT_PUBLIC_DEMO_ACCOUNT_ALICE_ID`, `NEXT_PUBLIC_DEMO_ACCOUNT_BOB_ID`, `NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID`); the demo accounts' keys are only in `packages/nextjs/setup-state.json`, which is gitignored. Start with the app running and HashPack connected as your council account (step 4).

### 5.1 Open the proposal

1. On the live map, click **New proposal** (or open http://localhost:3000/governance/new).
2. Under **Native · no contract, no registry entry**, pick **Pay a supplier**.
3. Fill in **Recipient account** (`0.0.xxxxx` or an EVM address — alice's id is a convenient one), leave **Asset** on **HBAR (ℏ)** and enter an **Amount (ℏ)**; `0.05` is plenty. The governance account starts with 20 ℏ and pays every approved operation out of it.
4. Read **What the council will see**: the target, **Gas limit** `n/a — native, network fee only`, **Expires** `7 days after scheduling. Unsigned, it simply lapses.` and **Who approves** `The 2-of-3 council.` (`2-of-4` here and below once the agent is seated). The preview is decoded from the very body about to be scheduled, so it is what the detail page will show the council.
5. Click **Schedule with your wallet** and approve the request in HashPack. While it waits, the footer reads `Step 1 of 1: schedule the call for the council. Approve it in HashPack — the request is valid for …`; after that window the network would refuse it.

That one `ScheduleCreate` is the whole proposal: the governance account is the payer of the transfer it schedules, and your key is its admin key, so you and only you can withdraw it (5.6). Once it lands, the app takes you to it at `/governance/0.0.xxxxx`.

### 5.2 Read it on the detail page and the map

The detail page is what a council member reads before signing. Top to bottom:

- `Proposal 0.0.xxxxx`, the title **Pay a supplier**, and `Native operation · no registry entry, no event`.
- The decoded operation in the ledger's own terms — `Transfer 0.05 ℏ to 0.0.xxxxx out of 0.0.xxxxx` — with the debited account spelled out rather than assumed to be the treasury.
- Three steps, **Create**, **Sign** and **Executed**. The last reads `Runs by itself at the 2nd signature. No execute button.`
- The approvals, said once: `1 more signature needed · 2-of-3 council · 1 signed`, next to the time left (`6d 23h left`).
- **Council**, one row per seat: yours, badged **your wallet**, then **Alice** and **Bob**, each `Signed` or `Not yet`. While the agent holds no seat, a last dashed row reads **Co-signing agent** `not a member`, with `not seated` and `Approve “Change to a 2-of-4 council” to seat it.`; once seated it is a seat like the others, named **Co-signing agent**.
- `There is no reject button. On Hedera you sign or you don't. If nobody signs, this schedule expires on its own — … from now, and nothing runs.`
- **On HashScan**: `Schedule 0.0.xxxxx`, tagged `active`, and `Scheduled by …`, the transaction that created it.
- Folded under **Raw ids, function and calldata**: the schedule id, `None — native, the network runs it directly` as the registry entry, and the scheduled body in base64.

Back on the map (**← Map**), the card sits under **Pending operations** with `1 more needed` and its time left, and the map draws the payment the proposal would make as a dashed violet line — the legend's "would happen".

### 5.3 Your signature is already in

It reads `1 signed` because you opened it from a council seat. The network counts the signatures on a `ScheduleCreate` towards the transaction it schedules, so the proposer's approval arrives with the proposal and your row already says `Signed`. That is also why your row has no Sign button: the button only sits on the connected account's own row while that seat has not signed.

**Sign with HashPack** is for a proposal somebody else opened. Open one as alice from the second wallet of 5.4 — the same **Pay a supplier**, say — and look at it from your own session: it reads `1 signed`, alice's row `Signed`, and your row `Not yet` with the button. Pressing it sends a `ScheduleSign` from your wallet, and yours is the second signature. The demo instance's transfer in 5.5 ran exactly that way, with bob as the second signature. A signature approves; it only makes anything run when it is the one that meets the threshold.

### 5.4 Get the second signature

One more seat has to sign. On a fresh setup the other two are alice and bob, demo accounts whose keys sit in `setup-state.json`; the co-signing agent can be a third, once the council has seated it. There are two ways to get the signature.

**Default: sign as alice from a second wallet.** Import alice's key into a wallet and sign the way any council member would (bob's works the same way). The key is a testnet demo key `yarn setup` generated and keeps in a gitignored file: treat it as throwaway, and never move a key that holds real funds this way. Use this one first: it works for every kind of proposal, it is what the template is about — a person approving from their own device — and it is the only option for a council rotation, which the agent never signs, including the one that seats it. Print her account id and key (a testnet key, but still a key: keep it out of screenshots and shared terminals):

```bash
cd packages/nextjs && node --input-type=module -e '
import { readFileSync } from "node:fs";
import { PrivateKey } from "@hiero-ledger/sdk";
const { accountId, privateKey } = JSON.parse(readFileSync("setup-state.json", "utf8")).demoAccounts.alice;
console.log(`account ${accountId}\nECDSA key (hex) ${PrivateKey.fromStringDer(privateKey).toStringRaw()}`);
'
```

1. Import the account into a second wallet with that ECDSA key, on **testnet**: Kabila, or another account in HashPack. Kabila is the more useful second wallet, since it is also the one that can sign a withdrawal (5.6).
2. Connect the app with it: **Disconnect** from the header menu and **Connect** again choosing that wallet, or open http://localhost:3000 in a second browser profile so your own session stays connected.
3. Open the proposal — its card on the map, or `/governance/0.0.xxxxx`. Alice's row now carries the Sign button; press it and approve the `ScheduleSign` in the wallet. The button reads **Sign with HashPack** whichever WalletConnect wallet answers it.

**Alternative: let the co-signing agent sign from its own seat.** The agent in `packages/agent` signs whatever its policy allows, seconds after it appears, with the account `yarn setup` created for it (`demoAccounts.agent`). It shows the routine path — a transfer inside written limits approved without anybody opening a wallet — rather than the general one: it refuses anything its policy does not cover, never signs a rotation, and pays a fee per signature and per published decision out of its own account (5 ℏ at setup). It signs nothing until the council holds its key, so this path starts by seating it, once.

*Run it.* Give it a policy that allows this transfer and nothing else, in a file the repository ignores (`*.local.json`):

```bash
cat > packages/agent/policy.local.json <<'JSON'
{ "treasuryTransfer": { "maxTinybars": "10000000", "recipients": ["0.0.xxxxx"] } }
JSON
cp packages/agent/.env.example packages/agent/.env
```

`recipients` names the account you are paying and `maxTinybars` the ceiling (10,000,000 tinybars is 0.1 ℏ). Then fill in `packages/agent/.env`:

| Variable | Where it comes from |
| --- | --- |
| `AGENT_ACCOUNT_ID`, `AGENT_PRIVATE_KEY` | `demoAccounts.agent` in `packages/nextjs/setup-state.json` (`accountId`, `privateKey`) |
| `GOVERNANCE_ACCOUNT_ID` | `NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID` in `packages/nextjs/.env.local` |
| `EXECUTOR_CONTRACT_ID` | `jq -r .hederaContractId packages/hardhat/deployments/hederaTestnet/GovernedExecutor.json` |
| `AGENT_DECISION_TOPIC_ID` | `AGENT_DECISION_TOPIC_ID` in `packages/nextjs/.env.local` (`yarn setup` created it with the agent's key as its submit key) |
| `AGENT_POLICY_FILE` | `./policy.local.json` |

A policy that asks for no confirmation needs no `AGENT_TOTP_SECRET`. Start it:

```bash
yarn agent:start
```

Until it is seated it logs one `seat-missing` line and keeps deciding without signing: your transfer comes out `"outcome":"approved-not-signed"`, which is the check that the policy covers it.

*Seat it.* Seating the agent is a council rotation like any other, proposed from your seat and approved by the humans. On `/governance/new` pick **Add the co-signing agent** (under the native group, hinted `→ 2-of-4 council`) — **Agent account** starts with the agent's account, `NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID` in `.env.local`. **Settings** in the header offers the same change: the council card lists the agent as `Not seated. Tick it below to propose a 2-of-4 council.` Either way the preview's **Who approves** reads `The current 2-of-3 council and the proposed 2-of-4 council, each to its own threshold.`, and **Schedule with your wallet** opens it. The detail calls it `Change to a 2-of-4 council` and lists both councils. Your create already counts in both, and alice sits in both, so her one signature from the second wallet completes both thresholds and the network rewrites the governance account's key. On the demo instance this is [schedule `0.0.10794960`](https://hashscan.io/testnet/schedule/0.0.10794960): opened by alice, signed by alice and bob — there the two human seats were alice's and bob's rather than yours and alice's — its scheduled `CRYPTOUPDATEACCOUNT` `SUCCESS`, leaving the 2-of-4 key over the council account, alice, bob and the agent.

On its next pass the running agent logs `seat-held`. From then on, within one poll (15 s by default) of your proposal appearing it prints a decision line — `"outcome":"approved","kind":"treasuryTransfer","reason":"within policy"` — and signs. A proposal outside the policy comes out `refused`, with the limit it failed as the reason. The app names its seat **Co-signing agent** on its own, since `yarn setup` wrote the agent's id to `.env.local`. The rest — confirmation codes for upgrades, the decision log, Docker — is in `packages/agent/README.md`.

### 5.5 Watch the network execute it, and verify

There is nothing to press. The signature that meets the threshold makes the network run the scheduled transfer straight after it, paid by the governance account. The app sees it on its next Mirror Node poll, a few seconds later:

- When that signature did not come from this browser — alice's from another wallet or profile, or the agent's — a banner at the top of the rail says so, naming the seat as the map does: `Alice signed “Transfer 0.05 ℏ to 0.0.xxxxx out of 0.0.xxxxx” from their own device. Nobody on this screen pressed anything — the poll saw it.`
- The card moves from **Pending operations** to **Recent** and reads `Executed`.
- The detail shows a result — **Executed**, `Executed by the network at …. Status SUCCESS, fee paid by the treasury.`, `It ran by itself the moment the last signature landed. Nobody pressed execute.` — and **On HashScan** gains `Scheduled transaction · SUCCESS`.

**Executed is not succeeded.** A schedule executes once its threshold is met, and the transaction inside it can still fail: a transfer the treasury can no longer cover, a token the recipient cannot hold. The app reads the scheduled transaction's own result, and a failure reads `Failed when it ran`, with the response code: `The network ran it and answered …: nothing changed, and the governance account still paid its fee. To try again, schedule the same operation again.` For a few seconds in between it can read `Executed, confirming the result`, while the Mirror Node has the schedule but not yet its outcome.

To check it without the app, ask the Mirror Node for the schedule:

```bash
curl -s "https://testnet.mirrornode.hedera.com/api/v1/schedules/0.0.xxxxx" \
  | jq '{schedule_id, creator_account_id, payer_account_id, executed_timestamp, deleted, signatures: [.signatures[] | {consensus_timestamp, public_key_prefix}]}'
```

`executed_timestamp` is set once it ran and `null` while it is pending; `signatures` lists every key that signed, and when. (There are more rows than approvals — whoever paid for the create and for each sign adds one — so count seats, not rows.) That says the schedule executed and nothing more. The result is on the scheduled transaction, whose consensus timestamp is the schedule's `executed_timestamp`:

```bash
curl -s "https://testnet.mirrornode.hedera.com/api/v1/transactions?timestamp=<executed_timestamp>" \
  | jq '.transactions[] | {name, result, scheduled, transfers}'
```

`scheduled` is `true`, `name` is `CRYPTOTRANSFER` and `result` must be `SUCCESS`; `transfers` shows the amount leaving the governance account and reaching the recipient. Until the row is indexed the list comes back empty, not as a 404.

What it looks like on testnet, on the demo instance: schedule [`0.0.10794949`](https://hashscan.io/testnet/schedule/0.0.10794949), memo `Pay a supplier`, paid 2.5 ℏ out of the governance account `0.0.10794626` to `0.0.10794946`. It was opened from a seat, alice's (`0.0.10794621`), exactly as in 5.1: her key signed the create, and bob's (`0.0.10794622`) was the second signature and the one that executed it. Its `executed_timestamp` is `1790786178.714452105`, and the one row at that timestamp is a scheduled `CRYPTOTRANSFER` with result `SUCCESS`. The agent's signature looks no different on the schedule: on the same deployment, [schedule `0.0.10797084`](https://hashscan.io/testnet/schedule/0.0.10797084), also `Pay a supplier`, was opened by alice and its second signature was the co-signing agent's (`0.0.10794623`, in its own seat since the council rotation), which executed it the same way.

The same lookup works for any single transaction the app sends — opening, signing or withdrawing. Take its transaction id (`0.0.xxxxx@1700000000.000000000`) and query the Mirror Node with the `-` separated form:

```bash
curl -s "https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.xxxxx-1700000000-000000000" \
  | jq '.transactions[0] | {name, result, consensus_timestamp, entity_id}'
```

`result` must be `SUCCESS`, and `name` the transaction's type (`SCHEDULECREATE`, `SCHEDULESIGN`, `SCHEDULEDELETE`).

### 5.6 Withdraw it instead (optional)

A proposal nobody signs expires after seven days and nothing runs. To end it sooner the proposer deletes the schedule: while it is pending, the detail offers the proposer — and nobody else, since the admin key is the proposer's and the network would refuse anyone else's `ScheduleDelete` — **Withdraw my approval round**, with `Deletes the schedule. A native operation has no registry entry, so this ends it.`

**HashPack cannot send it.** Both the extension and the mobile app answer a `ScheduleDelete` with "Unsupported Transaction Type" and offer only Reject; Kabila signs it. The app knows this from the wallet's name in the WalletConnect session, so with HashPack connected the button opens **HashPack cannot sign this step** instead of a wallet request, with **Use another wallet**, which disconnects and opens the wallet chooser. So to withdraw, import your council account into Kabila (as with alice in 5.4), connect the app with it and press the button there. The detail then reads `Withdrawn: the schedule was deleted, and a native operation has nothing else to end.`, and the Mirror Node reports the schedule with `"deleted": true`.

A contract-backed proposal also has a registry entry, and withdrawing its schedule leaves that entry pending: anyone can schedule it again. **Cancel this proposal** ends the entry for good, deleting the live schedule first when there is one; the rules are under "What a proposal offers" in `docs/GOVERNANCE_UI.md`.

## 6. Validate with Hedera Harness

### What each stage needs

The stages differ sharply in what they require, and running the wrong one first is the usual reason a
run fails for reasons that have nothing to do with the app.

| Command | Stages | Needs |
| --- | --- | --- |
| `npx hedera-harness doctor --recipe-only` | — | Nothing. Parses `.harness/spec.yaml` against the schema |
| `npx hedera-harness doctor` | — | The two operator variables exported, or it reports them missing |
| `npx hedera-harness validate` | ASSERT + SMOKE | **No credentials.** But no `.env` file may sit inside the tree: the static validator lists it as forbidden |
| `npx hedera-harness validate-semantic` | EVALUATE + CHAIN | The operator exported, the `claude` CLI authenticated, Chrome (or Playwright Chromium), **and a workspace that has already run `yarn setup` and the deploy** (steps 3.1–3.3) |
| `yarn harness:run` | GENERATE + everything above | The same as `validate-semantic` |

The harness never reads `.env` — it only reads the shell — and it refuses to run with one in the
tree, so export the values and move the file aside:

```bash
# bare values only: an inline comment copied from .env makes the harness reject (and echo) the key
export HEDERA_OPERATOR_ID=0.0.xxxxx
export HEDERA_OPERATOR_PRIVATE_KEY=<ECDSA private key, DER or raw hex>
mv packages/nextjs/.env /tmp/scaffold-hbar.env      # keep it outside the repo
npx hedera-harness doctor
npx hedera-harness validate
mv /tmp/scaffold-hbar.env packages/nextjs/.env
```

`validate-semantic` does not run ASSERT, so it leaves `.env` alone — and the council seat below
needs it. Run that one with the file in place:

```bash
export HEDERA_OPERATOR_ID=0.0.xxxxx
export HEDERA_OPERATOR_PRIVATE_KEY=<ECDSA private key>
npx hedera-harness validate-semantic
```

### What it grades

`.harness/eval.json` holds five assertions. Four are read-only and pass without a wallet; the fifth
is the one this template exists for.

| Id | Journey | Needs a signer |
| --- | --- | --- |
| `E1` | The live map renders with no wallet and no `.env` | no |
| `E6` | One fold, no page scroll, only unsettled proposals in the rail | no |
| `E5` | `/governance/new` offers the kinds and explains the wallet is needed | no |
| `E8` | A proposal's decoded operation, approvals and expiry, read from Mirror | no |
| `E9` | The test signer approves a pending proposal, and the signature lands on the Mirror Node | **yes** |

### The council seat, and why it is where it is

CHAIN provisions a fresh funded ECDSA account per run and hands its key to the app as
`localStorage["burnerWallet.pk"]`. That is enough to **pay** for a transaction and not enough to
**approve** one: a `ScheduleSign` only counts towards the threshold if the key sits in the
governance account's threshold key, and the network answers `INVALID_SIGNATURE` otherwise. So E9
would fail on a template whose whole subject is the approval.

`yarn harness:council-seat` closes that gap. It rebuilds the governance account's key as the three
configured members, plus the co-signing agent when the council has already seated it, plus this
run's signer, signed by the two demo members — they meet the old key's
threshold and, being members of the new one too, its threshold as well, so the incoming signer never
has to sign its own way in. Rebuilding rather than appending is what keeps seats from accumulating:
a previous run's key is dropped rather than kept.

**It runs from the dev server command in `.harness/validators/playwright-smoke.yaml`, not from
`chainValidation.deploy.commands`.** The latter is the obvious home and the wrong one: those
commands are reached from `runValidationStages`, which `validate-semantic` never calls — that path
goes straight from provisioning the signer to booting the server. A seat declared there happens
under `harness:run` and nowhere else. The server command is the only hook both entry points share.

The script finds the signer from `HARNESS_SIGNER_ACCOUNT_ID` when a deploy command exports it, and
otherwise from the `chain-signer.json` the harness writes to the workspace root before the server
starts. With neither it prints a line and returns before reading any credentials, which is what
keeps `validate` credential-free. A seat it cannot give is loud rather than fatal: it runs in front
of the server, so exiting non-zero would cost every assertion instead of the one that needs an
approval.

It reads the demo members' keys from `packages/nextjs/setup-state.json`, which is gitignored — hence
the "a workspace that has already run `yarn setup`" requirement above.

### What a run leaves behind

Two things, both on testnet, neither cleaned up by `validate-semantic` (only `harness:run` sweeps):

1. **The council is left with one key more than before**, the run's now-deleted signer: 2-of-4,
   or 2-of-5 with the agent seated. The threshold is unchanged, so the demo keeps working, and the
   next run drops that key. To undo it by hand, run the same `AccountUpdate` with the members the
   council had before the run — the three configured members, and the agent if it was seated —
   signed by the two demo seats.
2. **The ephemeral account and its key** stay in `chain-signer.json` at the repo root (gitignored)
   for reuse. Delete the account with an `AccountDeleteTransaction` signed with that key, balance
   back to the operator, and **remove the file only after the receipt confirms** — losing the key
   first strands the balance.

Results land under `.harness/runs/` and `.harness-semantic/` (both gitignored).

## 7. Try the test signer by hand

This reproduces what CHAIN does, with your own disposable account. Create and fund it from the operator (values from step 2 exported as above):

```bash
cd packages/nextjs && node --input-type=module -e '
import { AccountCreateTransaction, Client, Hbar, PrivateKey } from "@hiero-ledger/sdk";
const client = Client.forTestnet().setOperator(process.env.HEDERA_OPERATOR_ID, process.env.HEDERA_OPERATOR_PRIVATE_KEY);
const key = PrivateKey.generateECDSA();
const { accountId } = await (await new AccountCreateTransaction().setECDSAKeyWithAlias(key).setInitialBalance(new Hbar(5)).execute(client)).getReceipt(client);
console.log(`account ${accountId}\nlocalStorage.setItem("burnerWallet.pk", "${key.toStringRaw()}")`);
client.close();
'
```

1. With `yarn next:dev` running, open http://localhost:3000. The header shows **Connect Wallet** (no key stored).
2. Paste the printed `localStorage.setItem(...)` line in the browser console and reload.
3. The header now shows the new account as `0.0.xxxxx` with a **test signer** badge, without any wallet modal (allow a few seconds: the id is resolved from the key's EVM alias on the Mirror Node).
4. **Disconnect** from the header menu removes the key; reload and the app is back to HashPack.

The test signer only activates on testnet. In a production build (`yarn next:build && yarn next:start`) it stays off unless `NEXT_PUBLIC_ENABLE_BURNER_SIGNER=true` is set at build time. Delete the disposable account when you are done (an `AccountDeleteTransaction` signed with its key, transferring the balance back to the operator) or just let the few HBAR sit on testnet.

## Troubleshooting

| Symptom                                                                                    | Cause                                                                                                                                             | Fix                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wallet modal opens but never lists HashPack, or pairing fails with `Invalid project id`    | `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` missing or wrong                                                                                          | Create a project at [cloud.reown.com](https://cloud.reown.com), set the id in `packages/nextjs/.env`, restart `yarn next:dev` (`NEXT_PUBLIC_*` values are read at build time)                          |
| Transaction succeeded, but the rail or `curl` does not show it yet                         | Mirror Node lag (a few seconds, up to ~20 s under load)                                                                                           | Wait and retry; the rail polls the Mirror Node while a proposal is open. Confirm on HashScan by transaction id if in doubt                                                                             |
| `Error: listen EADDRINUSE: address already in use :::3000`                                 | Another dev server on port 3000                                                                                                                   | Stop it or run `yarn workspace @sh/nextjs dev -p 3001`                                                                                                                                                 |
| `npx hedera-harness validate` fails in ASSERT with a forbidden file `packages/nextjs/.env` | The static validator lists `.env` as forbidden and the secret scan flags operator keys                                                            | Move `.env` outside the repo while validating (see step 6); never commit it                                                                                                                            |
| No Sign button on a proposal you just opened                                               | Expected: you opened it from a council seat, and the `ScheduleCreate` already carries your signature (`1 signed`)                                  | The second signature has to come from another seat: alice in a second wallet, or the co-signing agent once the council has seated it (step 5.4)                                                         |
| **Withdraw my approval round** opens **HashPack cannot sign this step** (or HashPack itself shows "Unsupported Transaction Type", only Reject) | HashPack, extension and mobile, does not sign a `ScheduleDelete`                                                                                   | Import the proposer's account into Kabila, connect the app with it (**Use another wallet**) and withdraw from there (step 5.6)                                                                         |
| The agent logs `seat-missing` and your transfer comes out `approved-not-signed`            | Expected until the council seats it: the agent has its own account, outside the council, and never signs without a seat                           | Approve "Add the co-signing agent" from your seat and alice's (step 5.4); the running agent logs `seat-held` on its next pass                                                                        |
| The agent logs `"outcome":"refused"` for your transfer                                     | The policy does not cover it: the recipient is not in `recipients`, or the amount is over `maxTinybars`; the `reason` field names which             | Add the recipient or raise the ceiling in the policy file and restart `yarn agent:start`, or sign as alice instead (step 5.4)                                                                           |
| `Connect a Hedera wallet first` when submitting                                            | No live WalletConnect session (page refreshed while the provider was initialising)                                                                | Wait for the spinner to clear, then connect again; if it loops, disconnect from the header and clear site data                                                                                         |
| Key stored in `burnerWallet.pk` but the header still says **Connect Wallet**               | The test signer is off on mainnet and in production builds without the opt-in flag, or the key is not a valid ECDSA hex                           | Target testnet; in a production build set `NEXT_PUBLIC_ENABLE_BURNER_SIGNER=true` before building; check the console for `Ignoring the test signer key` or `BurnerKeyError`                            |
| `validate-semantic` fails with `failed to provision ephemeral signer: … BUSY`              | Testnet nodes throttle the `AccountBalanceQuery` the harness uses to reuse the signer saved in `chain-signer.json`, while transactions still pass | Delete that account (`AccountDeleteTransaction` signed with the key in `chain-signer.json`, balance back to the operator), remove `chain-signer.json` and rerun: a fresh signer needs no balance query |
| Test signer account `0x…` not found on testnet                                             | The account was never created with that key, or the Mirror Node has not indexed it yet                                                            | Create it with `setECDSAKeyWithAlias` (step 7) and reload after ~20 s; the app retries the alias lookup for about 20 s                                                                                 |
| `validate-semantic` passes E1/E5/E6/E8 but fails E9 with "no Sign control"                 | The app is behind the setup guard: `yarn setup` stopped halfway or the deploy has not run in this workspace                                       | Run steps 3.1–3.3, then rerun. The log line above the failure names the contract whose Hedera id is missing                                                                                            |
| The server log says `Could not seat the test signer on the council`                        | The seat could not be given — usually no `packages/nextjs/.env` (it holds `HEDERA_COUNCIL_ACCOUNT_ID`) or no `setup-state.json`                    | Put `.env` back before `validate-semantic` (that stage skips ASSERT, so the file is allowed) and make sure `yarn setup` has run. E9 fails without it; the other four still pass — with no `.env` at all they grade the demo instance, which is why this stage runs after `yarn setup` |
| The map's **Council threshold** shows one key more than expected after a harness run      | Expected: the run's test signer was seated and the run does not remove it                                                                        | Harmless — the threshold is unchanged and the next run drops the stale key. To restore it now, re-run the `AccountUpdate` with the members the council had before the run (see step 6)                |
| `Dev server exited before reporting a Local URL` right after `Chain signer provisioned`    | The seat script died before `yarn next:dev` could start                                                                                          | Read the line above it: the script prints its reason and, as of this version, no longer exits non-zero. An older checkout will need the fix in `scripts/harnessCouncilSeat.ts`                         |
| `yarn setup` stops at `Not deployed yet: GovernedExecutor, …`                               | Expected on a first run: the contracts are deployed against the governance account this run just created                                          | Deploy them (`yarn hardhat:deploy --network hederaTestnet`) and run `yarn setup` again (step 3)                                                    |
| Deploy fails with `Set GOVERNANCE_ACCOUNT_ADDRESS to the EVM address…`                      | The deploy ran before `yarn setup` created the governance account, so `packages/hardhat/.env` has neither value                                    | Run `yarn setup` first; it writes both into that file                                                                                              |
| `HEDERA_COUNCIL_ACCOUNT_ID is required in packages/nextjs/.env`                             | The governance account needs an account of yours as one of its keys and cannot guess which                                                         | Set it to the account you will connect with (step 2)                                                                                               |
| `The governance account 0.0.x holds a key built for council member 0.0.y`                   | `HEDERA_COUNCIL_ACCOUNT_ID` changed after the account was created; a threshold key cannot be re-keyed without the council it protects              | Put the original value back, or delete `packages/nextjs/setup-state.json` and redeploy everything against a new governance account                 |
| `Demo token 0.0.x has its pause key on 0.0.y, and the TokenAdmin deployed now is 0.0.z`     | `TokenAdmin` was redeployed; the token has no admin key, so its pause and freeze keys can never be pointed at the new contract                      | Remove `demoTokenId` from `packages/nextjs/setup-state.json` and rerun `yarn setup`; the old token stays on testnet, unusable                      |
| `The vault at 0x… accepts upgrades from 0x…, and the GovernedExecutor deployed now is 0x…`   | `GovernedExecutor` was redeployed; the vault fixes its executor in `initialize` and has no setter, so the proxy still trusts the old one             | Redeploy the vault against the current executor: delete `packages/hardhat/deployments/hederaTestnet/AcmeVault*.json` and run `yarn hardhat:deploy --network hederaTestnet` again |
| `INVALID_SIGNATURE` at precheck, or `HEDERA_OPERATOR_PRIVATE_KEY is an ED25519 key` | The operator key is not ECDSA: a 64-char hex key is always read as ECDSA, so a raw ED25519 key signs as an unrelated key; a DER ED25519 key is refused | Use an ECDSA operator account (step 1) and paste its DER-encoded or hex private key; ED25519 operators are not supported |
| `yarn setup` refuses to run                                                                | `HEDERA_NETWORK` is not `testnet` or the operator variables are empty                                                                             | Set `HEDERA_NETWORK=testnet` and both operator variables                                                                                                                                               |
| Wallet signing fails with a node-id or `INVALID_NODE_ACCOUNT` error                        | Transaction not frozen with a network `Client` before signing                                                                                     | Freeze with `Client.forTestnet()`; `freezeWithSigner` does not set node ids (see `docs/ARCHITECTURE.md`)                                                                                               |
