// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ISwapRouter } from "../interfaces/ISwapRouter.sol";

/// @notice Stands in for SaucerSwap's router in the adapter tests: records the params it was
/// called with, keeps the HBAR it was paid, and returns or reverts on demand. Not part of the
/// template's runtime.
/// @dev It models the router's interface and none of its behaviour. There is no WHBAR to wrap into,
/// no pool, and above all no HTS: the real swap settles its output through the system contract at
/// `0x167`, which charges an automatic token association as gas and is where this path actually
/// broke. Do not read a passing test against this contract, or any gas figure from one, as a
/// statement about SaucerSwap.
contract MockSwapRouter is ISwapRouter {
    ExactInputSingleParams public lastParams;
    uint256 public lastValue;
    uint256 public callCount;

    uint256 private _amountOut;
    string private _revertReason;

    function setAmountOut(uint256 amountOut) external {
        _amountOut = amountOut;
    }

    /// @notice A non-empty reason makes the next swap revert with it, the way the real router
    /// reverts with "Too little received" on slippage and "Transaction too old" past the deadline.
    function setRevertReason(string calldata reason) external {
        _revertReason = reason;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        require(bytes(_revertReason).length == 0, _revertReason);

        lastParams = params;
        lastValue = msg.value;
        callCount++;
        amountOut = _amountOut;
    }
}
