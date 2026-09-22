// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Target used by the GovernedExecutor tests. Not part of the template's runtime.
contract CallTarget {
    uint256 public value;
    address public lastCaller;
    uint256 public lastValue;

    function setValue(uint256 newValue) external {
        value = newValue;
        lastCaller = msg.sender;
    }

    /// @notice Keeps whatever HBAR it is paid, so a test can check the executor forwarded it.
    function keepValue() external payable {
        lastValue = msg.value;
        lastCaller = msg.sender;
    }

    function boom() external pure {
        revert("target failed");
    }

    function boomWithValue() external payable {
        revert("payable target failed");
    }
}
