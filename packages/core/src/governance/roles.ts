/**
 * Who holds the executor's roles, read from the contract. `PROPOSER_ROLE` decides who may register a
 * proposal and `EXECUTOR_ROLE` who may run one; each role's admin role decides who may grant it. The
 * constructor gives the admin role to the executor itself, so changing who may propose is itself a
 * proposal the council approves, which is why this is read from the chain rather than assumed.
 */
import { longZeroAddress } from "../identity";
import { createRelayClient } from "../relayClient";
import { type Address, type Hex, type PublicClient, keccak256, parseAbi, toHex } from "viem";

/** A role is identified by the hash of its name, the way the contract declares it. */
export const PROPOSER_ROLE = keccak256(toHex("PROPOSER_ROLE"));
export const EXECUTOR_ROLE = keccak256(toHex("EXECUTOR_ROLE"));

/** `AccessControlEnumerable` is what makes a role's holders listable; plain `AccessControl` only answers yes or no. */
const ROLES_ABI = parseAbi([
  "function getRoleMemberCount(bytes32 role) view returns (uint256)",
  "function getRoleMember(bytes32 role, uint256 index) view returns (address)",
  "function getRoleAdmin(bytes32 role) view returns (bytes32)",
]);

/** Every holder of `role` on the contract at `address`, as the addresses they were granted under. */
export async function readRoleMembers(relay: PublicClient, address: Address, role: Hex): Promise<Address[]> {
  const count = await relay.readContract({ address, abi: ROLES_ABI, functionName: "getRoleMemberCount", args: [role] });
  return Promise.all(
    Array.from({ length: Number(count) }, (_unused, index) =>
      relay.readContract({ address, abi: ROLES_ABI, functionName: "getRoleMember", args: [role, BigInt(index)] }),
    ),
  );
}

export type RegistryRoles = {
  /** Holders of `EXECUTOR_ROLE`: the governance account alone, as deployed. */
  executors: Address[];
  /** Holders of the role that administers `PROPOSER_ROLE`, and of the one that administers `EXECUTOR_ROLE`. */
  proposerAdmins: Address[];
  executorAdmins: Address[];
};

export type RoleLookup = {
  executorContractId: string;
  /** JSON-RPC relay endpoint; the browser holds no operator key, so a `ContractCallQuery` is not an option. */
  rpcUrl: string;
};

export async function fetchRegistryRoles({ executorContractId, rpcUrl }: RoleLookup): Promise<RegistryRoles> {
  const relay = createRelayClient(rpcUrl);
  const address = longZeroAddress(executorContractId);
  const adminOf = (role: Hex) =>
    relay.readContract({ address, abi: ROLES_ABI, functionName: "getRoleAdmin", args: [role] });

  const [executors, proposerAdminRole, executorAdminRole] = await Promise.all([
    readRoleMembers(relay, address, EXECUTOR_ROLE),
    adminOf(PROPOSER_ROLE),
    adminOf(EXECUTOR_ROLE),
  ]);
  const [proposerAdmins, executorAdmins] = await Promise.all([
    readRoleMembers(relay, address, proposerAdminRole),
    readRoleMembers(relay, address, executorAdminRole),
  ]);
  return { executors, proposerAdmins, executorAdmins };
}
