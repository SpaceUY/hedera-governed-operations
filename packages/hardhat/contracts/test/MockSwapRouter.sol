// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ISwapRouter } from "../interfaces/ISwapRouter.sol";

/// @notice Stands in for SaucerSwap's router in the adapter tests: records the params it was
/// called with, keeps the HBAR it was paid, and returns or reverts on demand. Not part of the
/// template's runtime.
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
