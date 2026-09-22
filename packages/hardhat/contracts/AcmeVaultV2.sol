// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AcmeVault } from "./AcmeVault.sol";

/// @title Second version of the vault, reached through an approved upgrade.
/// @notice What the upgrade buys: v1 takes deposits but has no way out, so withdrawals are the
/// feature the council unlocks by approving the upgrade. That is the story the template tells.
/// @dev Inherits `AcmeVault` so v1's slots keep their positions and `withdrawalLimit` is appended
/// after them. Adding state means a v3 that inherits this contract, not an edit to either of these.
contract AcmeVaultV2 is AcmeVault {
    uint256 public withdrawalLimit;

    event Withdrawn(address indexed account, uint256 amount);

    error WithdrawalTooLarge(uint256 amount, uint256 limit);
    error InsufficientBalance(uint256 amount, uint256 balance);
    error TransferFailed();

    /// @notice Set the per-withdrawal cap. Runs as part of the upgrade call, in the same transaction
    /// the council approved, so the proxy is never live on v2 code with the cap still at zero.
    function initV2(uint256 limit) external reinitializer(2) {
        withdrawalLimit = limit;
    }

    /// @notice Take part of your own balance out, up to the cap set at the upgrade.
    /// @dev Balances drop before the transfer, so a recipient that calls back in finds nothing left
    /// to withdraw twice.
    function withdraw(uint256 amount) external {
        if (amount > withdrawalLimit) {
            revert WithdrawalTooLarge(amount, withdrawalLimit);
        }

        uint256 balance = balanceOf[msg.sender];
        if (amount > balance) {
            revert InsufficientBalance(amount, balance);
        }

        balanceOf[msg.sender] = balance - amount;
        totalDeposits -= amount;
        emit Withdrawn(msg.sender, amount);

        (bool sent, ) = msg.sender.call{ value: amount }("");
        if (!sent) {
            revert TransferFailed();
        }
    }
}
