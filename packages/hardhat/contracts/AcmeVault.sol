// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/// @title Upgradeable vault whose upgrades need the council's approval.
/// @notice The demonstration object of this template: a contract that holds HBAR and whose code can
/// only be replaced through the governance path. `_authorizeUpgrade` gates on the `GovernedExecutor`
/// address, and that contract's `execute` is reachable only after m of n council members sign the
/// scheduled transaction wrapping it, so replacing this code takes the same approval as any other
/// governed operation.
/// @dev Deployed behind an ERC1967 proxy. The proxy owns the storage, so the slot order below is
/// fixed from the first deployment on: append new variables in a subclass, never insert or reorder
/// here. `AcmeVaultV2` inherits this contract for exactly that reason.
contract AcmeVault is Initializable, UUPSUpgradeable {
    address public executor;
    mapping(address => uint256) public balanceOf;
    uint256 public totalDeposits;

    event Deposited(address indexed account, uint256 amount);

    error NotExecutor(address caller);
    error ZeroDeposit();

    /// @dev Only the proxy is meant to hold state. Locking the implementation keeps anyone from
    /// initializing it directly and calling `upgradeToAndCall` on it as its own owner.
    constructor() {
        _disableInitializers();
    }

    /// @param newExecutor Address of the `GovernedExecutor`. It is fixed here and has no setter: the
    /// vault trusts one executor for life, and moving to another one means upgrading to a version
    /// that knows how to change it.
    function initialize(address newExecutor) external initializer {
        executor = newExecutor;
    }

    /// @notice Fund the vault. The contract has no `receive`, so this is the only way in and a plain
    /// transfer reverts instead of landing as an uncredited balance.
    /// @dev `msg.value` arrives in tinybars on Hedera and in wei on a local chain. Nothing here
    /// interprets the unit, so both behave the same; the conversion belongs at the UI boundary.
    function deposit() external payable {
        if (msg.value == 0) {
            revert ZeroDeposit();
        }

        balanceOf[msg.sender] += msg.value;
        totalDeposits += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @dev The executor reaches targets as itself, not as the governance account, so this compares
    /// against the contract address rather than against any council member.
    function _authorizeUpgrade(address) internal view override {
        if (msg.sender != executor) {
            revert NotExecutor(msg.sender);
        }
    }
}
