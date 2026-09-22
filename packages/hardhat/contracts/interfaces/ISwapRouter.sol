// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice The part of SaucerSwap V2's `SwapRouter` this template uses. SaucerSwap V2 is a Uniswap
/// V3 fork, so the struct matches `exactInputSingle` there; only the one function is declared,
/// rather than pulling in a dependency for a single call.
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        /// @dev Pool fee tier in hundredths of a basis point (3000 = 0.30%).
        uint24 fee;
        /// @dev The router settles `tokenOut` here, so the swap needs no intermediate holder.
        address recipient;
        /// @dev Unix seconds after which the router rejects the swap.
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Swaps `amountIn` of `tokenIn` for as much `tokenOut` as the pool gives.
    /// @dev Payable because HBAR is paid as value and wrapped into WHBAR by the router itself.
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}
