# Glossary

Hedera terms as used in this template. Not a general Hedera reference — see [docs.hedera.com](https://docs.hedera.com) for that.

| Term                | Meaning                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Account**         | A Hedera entity (`0.0.x`) that holds HBAR/tokens and pays for or authorizes transactions. An ECDSA account also has an EVM alias (`0x…`).                                       |
| **Key**              | The credential that authorizes an account, token, or contract permission. Can be a single Ed25519/ECDSA key, a **threshold key**, or a contract id — see [Governing an HTS token](ARCHITECTURE.md#governing-an-hts-token-the-contract-as-the-tokens-key). |
| **Threshold Key**   | A key made of *n* keys, satisfied when any *m* of them sign (m-of-n). This template's governance account is one, over the council.                                              |
| **Schedule**        | A transaction submitted once and held pending until it collects enough signatures (or a start time), then executes on its own. How a threshold key approves an operation without any single signer holding it. |
| **HCS**             | Hedera Consensus Service — ordered, timestamped messages published to a **topic**. Used here for the Proof Wall feed.                                                           |
| **HTS**             | Hedera Token Service — native fungible/NFT tokens with keys (admin, pause, freeze, …) instead of contract logic. Used here for the badge token.                                 |
| **Mirror Node**     | The REST API serving indexed, historical network state (accounts, tokens, topic messages, schedules). Every read in this app goes through it; expect a few seconds of lag after consensus. |
| **HashScan**        | The public Hedera block explorer ([hashscan.io](https://hashscan.io)), backed by the Mirror Node. Used to inspect transactions, accounts, tokens and contracts by id.           |
| **Testnet**         | Hedera's public test network. This template targets it exclusively — `yarn setup` refuses `HEDERA_NETWORK=mainnet`.                                                             |
| **Hashgraph**       | The aBFT consensus algorithm (gossip-about-gossip, virtual voting) that orders and finalizes transactions across Hedera's consensus nodes.                                      |
