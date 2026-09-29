# Glossary

Hedera terms as used in this template. Not a general Hedera reference — see [docs.hedera.com](https://docs.hedera.com) for that.

| Term                | Meaning                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Account**         | A Hedera entity (`0.0.x`) that holds HBAR/tokens and pays for or authorizes transactions. An ECDSA account also has an EVM alias (`0x…`).                                       |
| **HBAR**            | Hedera's native currency, used to pay every transaction fee (uppercase, singular: "10 HBAR"). Its fractional unit is the **tinybar** (1 HBAR = 10⁸ tinybar) — the unit `msg.value` arrives in inside a contract call.                          |
| **Key**              | The credential that authorizes an account, token, or contract permission. Can be a single Ed25519/ECDSA key, a **threshold key**, or a contract id — see [Governing an HTS token](ARCHITECTURE.md#governing-an-hts-token-the-contract-as-the-tokens-key). |
| **Threshold Key**   | A key made of *n* keys, satisfied when any *m* of them sign (m-of-n). This template's governance account is one, over the council.                                              |
| **Transaction ID**  | `payerAccountId@validStartTime`, assigned when a transaction is built (e.g. `0.0.9401@1598924675.82525000`). Mirror Node paths use a dashed form instead (`0.0.9401-1598924675-82525000`); one id can return several Mirror rows. |
| **Schedule**        | A transaction submitted once and held pending until it collects enough signatures, then executes on its own; it expires unexecuted otherwise. How a threshold key approves an operation without any single signer holding it. |
| **Topic**           | The HCS container a message feed is published to; has its own id (`0.0.x`). The release log and the co-signing agent's decision log are one topic each. |
| **HCS**             | Hedera Consensus Service — ordered, timestamped messages published to a **topic**. Used here for the release manifests and the agent's decisions. |
| **HTS**             | Hedera Token Service — native fungible/NFT tokens with keys (admin, pause, freeze, …) instead of contract logic. Used here for the demo token the council pauses and freezes. |
| **Gas**             | The EVM execution cost of a contract call, paid in HBAR. On a **scheduled** contract call it's a price, not a ceiling: a call that succeeds is charged the whole gas limit, one that reverts only what it consumed. |
| **JSON-RPC Relay**  | The Ethereum-compatible endpoint contracts in `packages/hardhat` are deployed and called through, instead of the Hiero SDK's native transaction types.                          |
| **Mirror Node**     | The REST API serving indexed, historical network state (accounts, tokens, topic messages, schedules). Every read in this app goes through it; expect a few seconds of lag after consensus. |
| **Consensus Node**  | The network node type that receives, gossips and orders transactions to reach consensus — contrast with the read-only **Mirror Node**.                                          |
| **HashScan**        | The public Hedera block explorer ([hashscan.io](https://hashscan.io)), backed by the Mirror Node. Used to inspect transactions, accounts, tokens and contracts by id.           |
| **Testnet**         | Hedera's public test network. This template targets it exclusively — `yarn setup` refuses `HEDERA_NETWORK=mainnet`.                                                             |
| **Hashgraph**       | The aBFT consensus algorithm (gossip-about-gossip, virtual voting) that orders and finalizes transactions across Hedera's consensus nodes.                                      |
