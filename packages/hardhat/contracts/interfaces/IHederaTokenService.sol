// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

/// Minimal interface for the HTS system contract at 0x167, holding the operations this template
/// governs. The full interface covers token creation, minting and transfers too; declaring only
/// what is called keeps the surface honest, and the official ABI is upward compatible with it.
interface IHederaTokenService {
    /// Suspends every operation on a token. Needs the token's pause key.
    /// @return responseCode SUCCESS is 22.
    function pauseToken(address token) external returns (int64 responseCode);

    /// Lifts a pause. Needs the token's pause key.
    /// @return responseCode SUCCESS is 22.
    function unpauseToken(address token) external returns (int64 responseCode);

    /// Stops one account from moving a token. Needs the token's freeze key, and the account has to
    /// be associated with the token already.
    /// @return responseCode SUCCESS is 22.
    function freezeToken(address token, address account) external returns (int64 responseCode);

    /// Lets a frozen account move the token again. Needs the token's freeze key.
    /// @return responseCode SUCCESS is 22.
    function unfreezeToken(address token, address account) external returns (int64 responseCode);
}
