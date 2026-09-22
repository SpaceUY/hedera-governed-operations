// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AccessControlEnumerable } from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

/// @title Proposal registry for m-of-n governance on Hedera.
/// @notice Authority is split in two layers. Layer one, who may propose, lives here as
/// `PROPOSER_ROLE`. Layer two, who approves, lives on Hedera: `execute` is reachable only by
/// `EXECUTOR_ROLE`, held by an account whose key is a threshold key, so the call arrives only
/// after m of n council members have signed the scheduled transaction that wraps it.
contract GovernedExecutor is AccessControlEnumerable {
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    enum ProposalState {
        Pending,
        Executed,
        Cancelled
    }

    struct Proposal {
        address target;
        address proposer;
        ProposalState state;
        bytes data;
    }

    Proposal[] private _proposals;

    event ProposalCreated(uint256 indexed id, address indexed proposer, address indexed target, bytes data);
    event Executed(uint256 indexed id, address indexed sender);
    event Cancelled(uint256 indexed id, address indexed sender);

    error ProposalNotPending(uint256 id);
    error NotCancellable(uint256 id, address sender);

    /// @param governanceAccount Account holding the threshold key. It is the only `EXECUTOR_ROLE` member
    /// at deployment; granting that role to a single-signer account would bypass the m-of-n approval.
    /// @param initialProposers Accounts allowed to register proposals.
    constructor(address governanceAccount, address[] memory initialProposers) {
        // The contract administers its own roles: changing them requires a proposal that targets this
        // contract and clears the m-of-n threshold, which leaves a registry entry and an event behind.
        _grantRole(DEFAULT_ADMIN_ROLE, address(this));
        _grantRole(EXECUTOR_ROLE, governanceAccount);

        for (uint256 i = 0; i < initialProposers.length; i++) {
            _grantRole(PROPOSER_ROLE, initialProposers[i]);
        }
    }

    /// @notice Register a call for the council to approve. The proposal is only a record: what the
    /// council signs is the scheduled transaction wrapping `execute(id)`, and that schedule id is
    /// what identifies the proposal everywhere outside this contract.
    function createProposal(address target, bytes calldata data) external onlyRole(PROPOSER_ROLE) returns (uint256 id) {
        id = _proposals.length;
        _proposals.push(Proposal({ target: target, proposer: msg.sender, state: ProposalState.Pending, data: data }));
        emit ProposalCreated(id, msg.sender, target, data);
    }

    /// @notice Run a pending proposal. Reachable only through the m-of-n approval, and the call
    /// reaches the target as this contract, so targets gate on the executor's address.
    /// @dev A failing target bubbles its revert and rolls the whole call back, leaving the proposal
    /// pending. The scheduled transaction that carried this call is spent either way: retrying means
    /// scheduling `execute` again, not proposing again.
    function execute(uint256 id) external onlyRole(EXECUTOR_ROLE) {
        Proposal storage pending = _requirePending(id);
        pending.state = ProposalState.Executed;

        Address.functionCall(pending.target, pending.data);
        emit Executed(id, msg.sender);
    }

    /// @notice Withdraw a pending proposal, so the council can no longer approve it. Open to the
    /// proposer who registered it and to the governance account, which can clear anyone's.
    function cancel(uint256 id) external {
        Proposal storage pending = _requirePending(id);
        if (msg.sender != pending.proposer && !hasRole(EXECUTOR_ROLE, msg.sender)) {
            revert NotCancellable(id, msg.sender);
        }

        pending.state = ProposalState.Cancelled;
        emit Cancelled(id, msg.sender);
    }

    function proposal(uint256 id) external view returns (Proposal memory) {
        return _proposals[id];
    }

    function proposalCount() external view returns (uint256) {
        return _proposals.length;
    }

    function _requirePending(uint256 id) private view returns (Proposal storage pending) {
        pending = _proposals[id];
        if (pending.state != ProposalState.Pending) {
            revert ProposalNotPending(id);
        }
    }
}
