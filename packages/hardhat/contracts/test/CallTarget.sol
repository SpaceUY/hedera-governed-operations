// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Target used by the GovernedExecutor tests. Not part of the template's runtime.
contract CallTarget {
    uint256 public value;
    address public lastCaller;

    function setValue(uint256 newValue) external {
        value = newValue;
        lastCaller = msg.sender;
    }

    function boom() external pure {
        revert("target failed");
    }
}
