// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IHederaTokenService } from "../interfaces/IHederaTokenService.sol";

/// @notice Stands in for the HTS system contract in the `TokenAdmin` tests: records the call it
/// received and answers with the response code the test asked for. The tests place its runtime code
/// at 0x167, so `TokenAdmin` reaches it the same way it reaches the real one. Not part of the
/// template's runtime.
contract MockHTS is IHederaTokenService {
    struct Call {
        bytes4 selector;
        address token;
        address account;
    }

    Call public lastCall;
    uint256 public callCount;

    int64 private _responseCode;

    /// @notice The code every operation answers with, SUCCESS (22) or a refusal such as
    /// TOKEN_NOT_ASSOCIATED_TO_ACCOUNT (184).
    function setResponseCode(int64 responseCode) external {
        _responseCode = responseCode;
    }

    function pauseToken(address token) external returns (int64) {
        return _record(token, address(0));
    }

    function unpauseToken(address token) external returns (int64) {
        return _record(token, address(0));
    }

    function freezeToken(address token, address account) external returns (int64) {
        return _record(token, account);
    }

    function unfreezeToken(address token, address account) external returns (int64) {
        return _record(token, account);
    }

    /// @dev `msg.sig` is this contract's own selector, so `lastCall` says which HTS operation was
    /// asked for — `pauseToken` and `unpauseToken` are otherwise indistinguishable from outside.
    function _record(address token, address account) private returns (int64) {
        lastCall = Call({ selector: msg.sig, token: token, account: account });
        callCount++;
        return _responseCode;
    }
}
