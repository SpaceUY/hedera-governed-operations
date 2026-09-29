# Runbook

Step-by-step reproduction on Hedera **testnet**, from a fresh account to a transaction you can verify on the Mirror Node and HashScan. Every command is copy-pasteable; replace the `0.0.xxxxx` placeholders with your own ids.

<!-- TODO(product): add the product-specific journey (e.g. governed operation or merchant payment) once the feature set is decided. -->

_Product-specific journeys: coming with the first release._

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
- `HEDERA_COUNCIL_ACCOUNT_ID` is **your own account** — the one you will connect with HashPack in step 5. It becomes one of the three keys on the governance account and is granted `PROPOSER_ROLE`, so without it you could watch the demo but not take part in it. It can be the operator account if you have no other, but then no human signature is involved in an approval. Changing it after step 3 means a new governance account and a fresh deployment, so pick it now.

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

This creates the agent's release and decision topics, two funded demo accounts (`alice` and `bob`, associated with testnet USDC) and the **governance account**: a 2-of-3 threshold key over your own account plus those two. It associates USDC on the governance account too — the treasury swap pays its output there, and a token that arrives from inside a contract call cannot be associated on the way in. It then writes `GOVERNANCE_ACCOUNT_ADDRESS` and `INITIAL_PROPOSERS` into `packages/hardhat/.env` — the two values the deploy refuses to run without — and stops, telling you what is not deployed yet.

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

The second run finds the contracts and finishes the fixtures: the HTS token whose pause and freeze keys are the `TokenAdmin` contract, a balance for `bob` so the freeze in the demo has something to act on, and one **pending proposal** — an upgrade of `AcmeVault` to `AcmeVaultV2` — for the council to approve. Every id lands in `packages/nextjs/.env.local`.

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

## 5. Verify a transaction on the Mirror Node

To inspect a transaction the app sent (opening, signing or withdrawing a proposal), take its transaction id (`0.0.xxxxx@1700000000.000000000`) and query the Mirror Node with the `-` separated form:

```bash
curl -s "https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.xxxxx-1700000000-000000000" \
  | jq '.transactions[0] | {name, result, consensus_timestamp, entity_id}'
```

`result` must be `SUCCESS`, and `name` the transaction's type (`SCHEDULECREATE`, `SCHEDULESIGN`, …).

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
configured members plus this run's signer, signed by the two demo members — they meet the old key's
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

1. **The council is left at 2-of-4**, with the run's now-deleted signer still among its keys. The
   threshold is unchanged, so the demo keeps working, and the next run drops that key. To put it
   back to 2-of-3 by hand, run the same `AccountUpdate` with only the three configured members,
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
| `Connect a Hedera wallet first` when submitting                                            | No live WalletConnect session (page refreshed while the provider was initialising)                                                                | Wait for the spinner to clear, then connect again; if it loops, disconnect from the header and clear site data                                                                                         |
| Key stored in `burnerWallet.pk` but the header still says **Connect Wallet**               | The test signer is off on mainnet and in production builds without the opt-in flag, or the key is not a valid ECDSA hex                           | Target testnet; in a production build set `NEXT_PUBLIC_ENABLE_BURNER_SIGNER=true` before building; check the console for `Ignoring the test signer key` or `BurnerKeyError`                            |
| `validate-semantic` fails with `failed to provision ephemeral signer: … BUSY`              | Testnet nodes throttle the `AccountBalanceQuery` the harness uses to reuse the signer saved in `chain-signer.json`, while transactions still pass | Delete that account (`AccountDeleteTransaction` signed with the key in `chain-signer.json`, balance back to the operator), remove `chain-signer.json` and rerun: a fresh signer needs no balance query |
| Test signer account `0x…` not found on testnet                                             | The account was never created with that key, or the Mirror Node has not indexed it yet                                                            | Create it with `setECDSAKeyWithAlias` (step 7) and reload after ~20 s; the app retries the alias lookup for about 20 s                                                                                 |
| `validate-semantic` passes E1/E5/E6/E8 but fails E9 with "no Sign control"                 | The app is behind the setup guard: `yarn setup` or the deploy has not run in this workspace                                                       | Run steps 3.1–3.3, then rerun. The log line above the failure names the contract whose Hedera id is missing                                                                                            |
| The server log says `Could not seat the test signer on the council`                        | The seat could not be given — usually no `packages/nextjs/.env` (it holds `HEDERA_COUNCIL_ACCOUNT_ID`) or no `setup-state.json`                    | Put `.env` back before `validate-semantic` (that stage skips ASSERT, so the file is allowed) and make sure `yarn setup` has run. E9 fails without it; the other four still pass                        |
| The map reads `Council threshold 2-of-4` after a harness run                               | Expected: the run's test signer was seated and the run does not remove it                                                                        | Harmless — the threshold is unchanged and the next run drops the stale key. To restore 2-of-3 now, re-run the `AccountUpdate` with only the three configured members (see step 6)                      |
| `Dev server exited before reporting a Local URL` right after `Chain signer provisioned`    | The seat script died before `yarn next:dev` could start                                                                                          | Read the line above it: the script prints its reason and, as of this version, no longer exits non-zero. An older checkout will need the fix in `scripts/harnessCouncilSeat.ts`                         |
| `yarn setup` stops at `Not deployed yet: GovernedExecutor, …`                               | Expected on a first run: the contracts are deployed against the governance account this run just created                                          | Deploy them (`yarn hardhat:deploy --network hederaTestnet`) and run `yarn setup` again (step 3)                                                    |
| Deploy fails with `Set GOVERNANCE_ACCOUNT_ADDRESS to the EVM address…`                      | The deploy ran before `yarn setup` created the governance account, so `packages/hardhat/.env` has neither value                                    | Run `yarn setup` first; it writes both into that file                                                                                              |
| `HEDERA_COUNCIL_ACCOUNT_ID is required in packages/nextjs/.env`                             | The governance account needs an account of yours as one of its three keys and cannot guess which                                                   | Set it to the account you will connect with (step 2)                                                                                               |
| `The governance account 0.0.x holds a key built for council member 0.0.y`                   | `HEDERA_COUNCIL_ACCOUNT_ID` changed after the account was created; a threshold key cannot be re-keyed without the council it protects              | Put the original value back, or delete `packages/nextjs/setup-state.json` and redeploy everything against a new governance account                 |
| `Demo token 0.0.x has its pause key on 0.0.y, and the TokenAdmin deployed now is 0.0.z`     | `TokenAdmin` was redeployed; the token has no admin key, so its pause and freeze keys can never be pointed at the new contract                      | Remove `demoTokenId` from `packages/nextjs/setup-state.json` and rerun `yarn setup`; the old token stays on testnet, unusable                      |
| `The vault at 0x… accepts upgrades from 0x…, and the GovernedExecutor deployed now is 0x…`   | `GovernedExecutor` was redeployed; the vault fixes its executor in `initialize` and has no setter, so the proxy still trusts the old one             | Redeploy the vault against the current executor: delete `packages/hardhat/deployments/hederaTestnet/AcmeVault*.json` and run `yarn hardhat:deploy --network hederaTestnet` again |
| `INVALID_SIGNATURE` at precheck, or `HEDERA_OPERATOR_PRIVATE_KEY is an ED25519 key` | The operator key is not ECDSA: a 64-char hex key is always read as ECDSA, so a raw ED25519 key signs as an unrelated key; a DER ED25519 key is refused | Use an ECDSA operator account (step 1) and paste its DER-encoded or hex private key; ED25519 operators are not supported |
| `yarn setup` refuses to run                                                                | `HEDERA_NETWORK` is not `testnet` or the operator variables are empty                                                                             | Set `HEDERA_NETWORK=testnet` and both operator variables                                                                                                                                               |
| Wallet signing fails with a node-id or `INVALID_NODE_ACCOUNT` error                        | Transaction not frozen with a network `Client` before signing                                                                                     | Freeze with `Client.forTestnet()`; `freezeWithSigner` does not set node ids (see `docs/ARCHITECTURE.md`)                                                                                               |
