// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {TugraVault} from "../../src/TugraVault.sol";

/// @notice Odemeyi kabul edip etmemesi acilip kapatilabilen alici.
///         Baslangicta REDDEDER.
contract ToggleReceiver {
    bool public accepts;

    function setAccepts(bool value) external {
        accepts = value;
    }

    receive() external payable {
        require(accepts, "ToggleReceiver: reddedildi");
    }
}

/// @notice receive/fallback'i olmayan kontrat: native transfer her zaman basarisiz olur.
contract NoReceiveReceiver {
    uint256 public dummy;
}

/// @notice Hem yetkili ajan hem alici olan saldirgan kontrat.
///         Odemeyi aldigi anda kasaya yeniden girip ikinci bir odeme dener.
/// @dev `propagate = true`  -> ic cagrinin hatasi disari yayilir (receive revert eder).
///      `propagate = false` -> ic cagrinin hatasi yakalanir (receive basariyla doner).
contract ReentrantAgentPayee {
    TugraVault public immutable vault;

    uint256 public outerMandateId;
    uint256 public outerAmount;
    uint256 public innerMandateId;
    uint256 public innerAmount;
    bool public propagate;

    bool public entered;
    bool public innerAttempted;
    bool public innerSucceeded;

    /// @notice Yakalanan ic cagrinin ham revert verisi. Hangi kontrolun
    ///         yeniden girisi engelledigini (Reentrancy mi, AlreadyUsed mi)
    ///         testte dogrulamak icin saklanir.
    bytes public innerRevertData;

    constructor(TugraVault vault_) {
        vault = vault_;
    }

    function configure(uint256 outerMandateId_, uint256 outerAmount_, uint256 innerMandateId_, uint256 innerAmount_)
        external
    {
        outerMandateId = outerMandateId_;
        outerAmount = outerAmount_;
        innerMandateId = innerMandateId_;
        innerAmount = innerAmount_;
    }

    function setPropagate(bool value) external {
        propagate = value;
    }

    /// @notice Disaridan tetiklenen ilk (mesru gorunumlu) odeme cagrisi.
    function attack() external {
        vault.execute(outerMandateId, address(this), outerAmount);
    }

    receive() external payable {
        if (entered) return;
        entered = true;
        innerAttempted = true;

        if (propagate) {
            // Hata disari yayilir: receive revert eder, dis odeme de basarisiz olur.
            vault.execute(innerMandateId, address(this), innerAmount);
            innerSucceeded = true;
        } else {
            // Hata yakalanir: receive basariyla doner, dis odeme basarili olabilir.
            (bool ok, bytes memory data) = address(vault).call(
                abi.encodeWithSelector(TugraVault.execute.selector, innerMandateId, address(this), innerAmount)
            );
            innerSucceeded = ok;
            innerRevertData = data;
        }
    }
}
