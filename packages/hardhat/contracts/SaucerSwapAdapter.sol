// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ISwapRouter } from "./interfaces/ISwapRouter.sol";

/// @title Treasury swap of HBAR for an HTS token, reachable only through governance.
/// @notice Turns "sell HBAR for USDC" into something a council approves rather than something an
/// operator does. The swap is a proposal in `GovernedExecutor`, so it is gated by `PROPOSER_ROLE`
/// on the way in and by the m-of-n threshold on the way out, and it leaves a registry entry and an
/// event behind. Scheduling a call on the router directly would swap just as well and record none
/// of that.
/// @dev The adapter holds nothing: no HBAR, no tokens, no accounting. The HBAR arrives with the
/// call and leaves in the same transaction, and the router settles the output straight to
/// `recipient`. That is what keeps it free of HTS token associations — a contract that never
/// receives a token never needs one.
contract SaucerSwapAdapter {
    /// @notice The only account this adapter accepts swaps from: the proposal registry whose
    /// `execute` is reachable only after m of n council members sign.
    address public immutable executor;

    /// @notice SaucerSwap V2's `SwapRouter`.
    ISwapRouter public immutable router;

    /// @notice WHBAR, the token the pools quote HBAR as. The adapter never holds it: the router
    /// wraps the HBAR it is paid and unwrapping never enters this path.
    address public immutable whbar;

    /// @dev Zero disables the router's price limit. Slippage protection is `amountOutMinimum`
    /// alone, which the council sees and approves; a second, invisible bound would only add a way
    /// for an approved swap to fail.
    uint160 private constant NO_PRICE_LIMIT = 0;

    /// @notice A completed treasury swap. `amountOut` is what the router reported paying out.
    event TreasurySwap(address indexed tokenOut, address indexed recipient, uint256 amountIn, uint256 amountOut);

    error NotExecutor(address sender);
    error ValueMismatch(uint256 sent, uint256 expected);

    constructor(address executor_, address router_, address whbar_) {
        executor = executor_;
        router = ISwapRouter(router_);
        whbar = whbar_;
    }

    /// @notice Swap `amountIn` of HBAR for `tokenOut`, settled by the router straight to
    /// `recipient`.
    /// @dev `amountOutMinimum` is a floor, not a slippage tolerance. A council approves a proposal
    /// minutes or days after it is registered, so a tolerance computed against the price at
    /// registration would mean nothing by the time the swap runs. Read the proposal as a limit
    /// order: swap this much HBAR, and only if it yields at least this much of `tokenOut`.
    /// @param amountIn Must equal the HBAR paid to this call. The amount travels in the proposal's
    /// calldata while the HBAR travels as the scheduled transaction's payable amount, and this is
    /// the check that keeps the amount moved equal to the amount on record.
    /// @param deadline Unix seconds; set it from the proposal's expiry, not from the moment it is
    /// registered, or the router will reject the swap for being stale before the council reaches
    /// the threshold.
    function swapExactHbarForToken(
        address tokenOut,
        uint24 fee,
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint256 deadline
    ) external payable returns (uint256 amountOut) {
        if (msg.sender != executor) {
            revert NotExecutor(msg.sender);
        }
        if (msg.value != amountIn) {
            revert ValueMismatch(msg.value, amountIn);
        }

        amountOut = router.exactInputSingle{ value: amountIn }(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: whbar,
                tokenOut: tokenOut,
                fee: fee,
                recipient: recipient,
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: NO_PRICE_LIMIT
            })
        );

        emit TreasurySwap(tokenOut, recipient, amountIn, amountOut);
    }
}
