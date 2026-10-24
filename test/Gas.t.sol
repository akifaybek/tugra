// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test, console} from "forge-std/Test.sol";
import {TugraVault} from "../src/TugraVault.sol";

/// @notice Kanit akisindaki ALTI islemin gas tuketimini YERELDE olcer.
/// @dev    UYARI: Bu olcumler Foundry'nin varsayilan (Monad OLMAYAN) gas
///         modeliyle alinir. Monad ucreti gas LIMITINE gore keser ve MIP-8
///         depolama erisim muhasebesi farkli fiyatlayabilir. Buradaki sayilar
///         ALT SINIR kabul edilir; zincire gonderilecek gas limiti bunlarin
///         uzerine acik bir pay eklenerek belirlenir.
///         Olculen deger yalnizca yurutme gas'idir; islem toplamina intrinsic
///         21000 + calldata maliyeti ayrica eklenir.
contract GasTest is Test {
    address internal ownerAddr = makeAddr("owner");
    address internal agent = makeAddr("agent");
    address internal provider = makeAddr("provider");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant AMOUNT = 0.01 ether;
    uint256 internal constant FUNDING = 0.05 ether;

    TugraVault internal vault;
    uint256 internal mandateId;

    /// @dev Olcumler storage'da tutulur; stack derinligi asilmasin diye.
    uint256[6] public measured;
    string[6] public labels;

    function test_MeasureProofFlowGas() public {
        vm.warp(1_700_000_000);
        vm.deal(ownerAddr, 1 ether);

        _deploy();
        _deposit();
        _createMandate();
        _wrongPayee();
        _legitPayment();
        _repeatPayment();

        uint256 total;
        for (uint256 i = 0; i < 6; i++) {
            console.log(labels[i], measured[i]);
            total += measured[i];
        }
        console.log("TOPLAM yurutme gas (intrinsic haric)", total);
        console.log("TOPLAM + 6 x 21000 intrinsic        ", total + 6 * 21000);
    }

    /// @dev `new TugraVault()` kullanilmaz: Foundry 1.8 bunu `VM::deployCode`
    ///      cheatcode'una cevirir ve olculen deger gercek CREATE maliyeti
    ///      yerine cheatcode sarmalayicisini gosterir (~20k, hatali).
    ///      Bu yuzden initcode alinip ham CREATE ile deploy edilir.
    function _deploy() internal {
        bytes memory initcode = vm.getCode("TugraVault.sol:TugraVault");
        address addr;
        vm.startPrank(ownerAddr);
        uint256 g = gasleft();
        assembly {
            addr := create(0, add(initcode, 0x20), mload(initcode))
        }
        measured[0] = g - gasleft();
        vm.stopPrank();
        require(addr != address(0), "deploy basarisiz");
        vault = TugraVault(payable(addr));
        assertEq(vault.owner(), ownerAddr);
        labels[0] = "1 deploy             ";
    }

    function _deposit() internal {
        vm.prank(ownerAddr);
        uint256 g = gasleft();
        vault.deposit{value: FUNDING}();
        measured[1] = g - gasleft();
        labels[1] = "2 deposit            ";
    }

    function _createMandate() internal {
        vm.prank(ownerAddr);
        uint256 g = gasleft();
        mandateId = vault.createMandate(agent, provider, AMOUNT, uint64(block.timestamp + 1 hours));
        measured[2] = g - gasleft();
        labels[2] = "3 createMandate      ";
    }

    function _wrongPayee() internal {
        bytes memory data = abi.encodeWithSelector(TugraVault.execute.selector, mandateId, stranger, AMOUNT);
        vm.prank(agent);
        uint256 g = gasleft();
        (bool ok, bytes memory ret) = address(vault).call(data);
        measured[3] = g - gasleft();
        labels[3] = "4 revert PayeeMismatch";
        assertFalse(ok);
        assertEq(bytes4(ret), TugraVault.PayeeMismatch.selector);
    }

    function _legitPayment() internal {
        vm.prank(agent);
        uint256 g = gasleft();
        vault.execute(mandateId, provider, AMOUNT);
        measured[4] = g - gasleft();
        labels[4] = "5 execute (basarili) ";
    }

    function _repeatPayment() internal {
        bytes memory data = abi.encodeWithSelector(TugraVault.execute.selector, mandateId, provider, AMOUNT);
        vm.prank(agent);
        uint256 g = gasleft();
        (bool ok, bytes memory ret) = address(vault).call(data);
        measured[5] = g - gasleft();
        labels[5] = "6 revert AlreadyUsed ";
        assertFalse(ok);
        assertEq(bytes4(ret), TugraVault.AlreadyUsed.selector);
    }
}
