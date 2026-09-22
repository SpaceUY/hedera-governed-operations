// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IHederaTokenService } from "./interfaces/IHederaTokenService.sol";

/// @title Administration of an HTS token, reachable only through governance.
/// @notice This contract *is* the token's pause and freeze key. Hedera lets a token key be a
/// contract id, and then the network grants the key to whoever is executing that contract's code —
/// so putting these keys on this address and gating it on the executor makes "pause the token" a
/// proposal the council approves rather than a transaction someone signs.
/// @dev The detour through a contract is not a design preference, it is the only path that works.
/// A native `TokenPause` cannot be scheduled at all (`SCHEDULED_TRANSACTION_NOT_IN_WHITELIST`), and
/// a scheduled contract call cannot present the governance account's key to the system contract
/// either (`INVALID_FULL_PREFIX_SIGNATURE_FOR_PRECOMPILE`): the signatures a schedule collects are
/// not in the form 0x167 verifies. What it does accept is the contract id of its immediate caller,
/// which is this contract — and that holds however deep the call arrives, so the council's
/// approval can travel through the executor on its way here. See docs/ARCHITECTURE.md.
contract TokenAdmin {
    /// @notice HTS, the system contract every Hedera network exposes at this address.
    IHederaTokenService private constant HTS = IHederaTokenService(address(0x167));

    /// @notice The response code HTS answers with when it performed the operation.
    int64 private constant SUCCESS = 22;

    /// @notice The only account this contract accepts operations from: the proposal registry whose
    /// `execute` is reachable only after m of n council members sign.
    address public immutable executor;

    event TokenPaused(address indexed token);
    event TokenUnpaused(address indexed token);
    event AccountFrozen(address indexed token, address indexed account);
    event AccountUnfrozen(address indexed token, address indexed account);

    error NotExecutor(address sender);
    error HtsRejected(int64 responseCode);

    constructor(address executor_) {
        executor = executor_;
    }

    modifier onlyExecutor() {
        if (msg.sender != executor) {
            revert NotExecutor(msg.sender);
        }
        _;
    }

    /// @notice Suspend every transfer, mint and burn of `token` until it is unpaused.
    function pause(address token) external onlyExecutor {
        _requireSuccess(HTS.pauseToken(token));
        emit TokenPaused(token);
    }

    function unpause(address token) external onlyExecutor {
        _requireSuccess(HTS.unpauseToken(token));
        emit TokenUnpaused(token);
    }

    /// @notice Stop one account from moving `token`, leaving every other holder untouched.
    /// @param account Must already be associated with the token: freezing acts on the relationship
    /// between the two, and HTS answers `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` (184) when there is none.
    function freeze(address token, address account) external onlyExecutor {
        _requireSuccess(HTS.freezeToken(token, account));
        emit AccountFrozen(token, account);
    }

    function unfreeze(address token, address account) external onlyExecutor {
        _requireSuccess(HTS.unfreezeToken(token, account));
        emit AccountUnfrozen(token, account);
    }

    /// @dev HTS reports a refusal by returning a code, not by reverting. Passing that code on as a
    /// revert is what keeps a refused operation from counting as a done one: the proposal stays
    /// pending instead of being marked executed, so the council can reschedule it once whatever HTS
    /// objected to is fixed, and the code itself reaches the Mirror Node for the UI to explain.
    function _requireSuccess(int64 responseCode) private pure {
        if (responseCode != SUCCESS) {
            revert HtsRejected(responseCode);
        }
    }
}
