// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test} from "forge-std/Test.sol";
import {TugraVault} from "../src/TugraVault.sol";
import {ToggleReceiver, NoReceiveReceiver, ReentrantAgentPayee} from "./mocks/Receivers.sol";

contract TugraVaultTest is Test {
    // Olaylar solc 0.8.20'de baska kontrattan nitelikli olarak emit edilemedigi
    // icin vm.expectEmit esleştirmesi amaciyla burada yeniden bildirildi.
    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event MandateCreated(
        uint256 indexed mandateId, address indexed agent, address indexed payee, uint256 amount, uint64 expiry
    );
    event MandateRevoked(uint256 indexed mandateId);
    event MandatePaid(uint256 indexed mandateId, address indexed agent, address indexed payee, uint256 amount);

    TugraVault internal vault;

    address internal ownerAddr = makeAddr("owner");
    address internal agent = makeAddr("agent");
    address internal provider = makeAddr("provider"); // guvenilir kayitli alici
    address internal stranger = makeAddr("stranger"); // "Bilinmeyen adres"

    uint256 internal constant AMOUNT = 1 ether;
    uint256 internal constant FUNDING = 10 ether;
    uint64 internal expiry;

    function setUp() public {
        vm.warp(1_700_000_000); // deterministik zaman tabani

        vm.prank(ownerAddr);
        vault = new TugraVault();

        vm.deal(ownerAddr, 100 ether);
        vm.prank(ownerAddr);
        vault.deposit{value: FUNDING}();

        expiry = uint64(block.timestamp + 1 hours);
    }

    function _createMandate() internal returns (uint256) {
        return _createMandate(agent, provider, AMOUNT, expiry);
    }

    function _createMandate(address agent_, address payee_, uint256 amount_, uint64 expiry_)
        internal
        returns (uint256)
    {
        vm.prank(ownerAddr);
        return vault.createMandate(agent_, payee_, amount_, expiry_);
    }

    // =====================================================================
    // Kurulum ve sahiplik
    // =====================================================================

    function test_OwnerIsDeployer() public view {
        assertEq(vault.owner(), ownerAddr);
    }

    function test_InitialMandateState() public view {
        assertEq(vault.mandateCount(), 0);
        assertEq(vault.nextMandateId(), 1);
    }

    // =====================================================================
    // Para yatirma
    // =====================================================================

    function test_DepositIncreasesVaultBalance() public {
        uint256 before = address(vault).balance;

        vm.deal(stranger, 5 ether);
        vm.expectEmit(true, false, false, true, address(vault));
        emit Deposited(stranger, 2 ether);

        vm.prank(stranger);
        vault.deposit{value: 2 ether}();

        assertEq(address(vault).balance, before + 2 ether);
    }

    function test_ReceiveIncreasesVaultBalance() public {
        uint256 before = address(vault).balance;

        vm.deal(stranger, 5 ether);
        vm.prank(stranger);
        (bool ok,) = address(vault).call{value: 3 ether}("");

        assertTrue(ok);
        assertEq(address(vault).balance, before + 3 ether);
    }

    // =====================================================================
    // Para cekme (yalnizca sahip)
    // =====================================================================

    function test_OwnerCanWithdraw() public {
        uint256 ownerBefore = ownerAddr.balance;

        vm.expectEmit(true, false, false, true, address(vault));
        emit Withdrawn(ownerAddr, 4 ether);

        vm.prank(ownerAddr);
        vault.withdraw(4 ether);

        assertEq(address(vault).balance, FUNDING - 4 ether);
        assertEq(ownerAddr.balance, ownerBefore + 4 ether);
    }

    function test_WithdrawRevertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(TugraVault.NotOwner.selector);
        vault.withdraw(1 ether);
    }

    function test_WithdrawRevertsForAgent() public {
        vm.prank(agent);
        vm.expectRevert(TugraVault.NotOwner.selector);
        vault.withdraw(1 ether);
    }

    function test_WithdrawRevertsOnInsufficientBalance() public {
        vm.prank(ownerAddr);
        vm.expectRevert(TugraVault.InsufficientBalance.selector);
        vault.withdraw(FUNDING + 1);
    }

    function test_WithdrawRevertsOnZeroAmount() public {
        vm.prank(ownerAddr);
        vm.expectRevert(TugraVault.ZeroAmount.selector);
        vault.withdraw(0);
    }

    // =====================================================================
    // Vekalet olusturma ve girdi dogrulamasi
    // =====================================================================

    function test_CreateMandateStoresFields() public {
        uint256 id = _createMandate();

        TugraVault.Mandate memory m = vault.getMandate(id);
        assertEq(m.agent, agent);
        assertEq(m.payee, provider);
        assertEq(m.amount, AMOUNT);
        assertEq(m.expiry, expiry);
        assertFalse(m.used);
        assertFalse(m.revoked);
        assertEq(vault.mandateCount(), 1);
    }

    function test_CreateMandateEmitsEvent() public {
        vm.expectEmit(true, true, true, true, address(vault));
        emit MandateCreated(1, agent, provider, AMOUNT, expiry);

        vm.prank(ownerAddr);
        vault.createMandate(agent, provider, AMOUNT, expiry);
    }

    function test_MandateIdsStartAtOneAndIncrement() public {
        assertEq(_createMandate(), 1);
        assertEq(_createMandate(), 2);
        assertEq(vault.mandateCount(), 2);
        assertEq(vault.nextMandateId(), 3);
    }

    function test_CreateMandateRevertsForNonOwner() public {
        vm.prank(agent);
        vm.expectRevert(TugraVault.NotOwner.selector);
        vault.createMandate(agent, provider, AMOUNT, expiry);
    }

    function test_CreateMandateRevertsOnZeroAgent() public {
        vm.prank(ownerAddr);
        vm.expectRevert(TugraVault.ZeroAgent.selector);
        vault.createMandate(address(0), provider, AMOUNT, expiry);
    }

    function test_CreateMandateRevertsOnZeroPayee() public {
        vm.prank(ownerAddr);
        vm.expectRevert(TugraVault.ZeroPayee.selector);
        vault.createMandate(agent, address(0), AMOUNT, expiry);
    }

    function test_CreateMandateRevertsOnZeroAmount() public {
        vm.prank(ownerAddr);
        vm.expectRevert(TugraVault.ZeroAmount.selector);
        vault.createMandate(agent, provider, 0, expiry);
    }

    function test_CreateMandateRevertsOnPastExpiry() public {
        vm.prank(ownerAddr);
        vm.expectRevert(TugraVault.InvalidExpiry.selector);
        vault.createMandate(agent, provider, AMOUNT, uint64(block.timestamp - 1));
    }

    /// @dev Sinir: expiry == block.timestamp olusturma aninda REDDEDILIR.
    function test_CreateMandateRevertsOnExpiryEqualToNow() public {
        vm.prank(ownerAddr);
        vm.expectRevert(TugraVault.InvalidExpiry.selector);
        vault.createMandate(agent, provider, AMOUNT, uint64(block.timestamp));
    }

    /// @dev Sinir: expiry == block.timestamp + 1 kabul edilir.
    function test_CreateMandateAcceptsExpiryOneSecondAhead() public {
        uint256 id = _createMandate(agent, provider, AMOUNT, uint64(block.timestamp + 1));
        assertEq(vault.getMandate(id).expiry, uint64(block.timestamp + 1));
    }

    function test_GetMandateRevertsOnUnknownId() public {
        _createMandate();
        vm.expectRevert(TugraVault.UnknownMandate.selector);
        vault.getMandate(0);
        vm.expectRevert(TugraVault.UnknownMandate.selector);
        vault.getMandate(2);
    }

    // =====================================================================
    // Iptal
    // =====================================================================

    function test_OwnerCanRevoke() public {
        uint256 id = _createMandate();

        vm.expectEmit(true, false, false, false, address(vault));
        emit MandateRevoked(id);

        vm.prank(ownerAddr);
        vault.revoke(id);

        assertTrue(vault.getMandate(id).revoked);
    }

    function test_RevokeRevertsForNonOwner() public {
        uint256 id = _createMandate();
        vm.prank(agent);
        vm.expectRevert(TugraVault.NotOwner.selector);
        vault.revoke(id);
    }

    function test_RevokeRevertsOnUnknownMandate() public {
        vm.prank(ownerAddr);
        vm.expectRevert(TugraVault.UnknownMandate.selector);
        vault.revoke(1);
    }

    function test_RevokeTwiceReverts() public {
        uint256 id = _createMandate();
        vm.prank(ownerAddr);
        vault.revoke(id);

        vm.prank(ownerAddr);
        vm.expectRevert(TugraVault.Revoked.selector);
        vault.revoke(id);
    }

    function test_RevokeAfterSuccessfulPaymentReverts() public {
        uint256 id = _createMandate();
        vm.prank(agent);
        vault.execute(id, provider, AMOUNT);

        vm.prank(ownerAddr);
        vm.expectRevert(TugraVault.AlreadyUsed.selector);
        vault.revoke(id);
    }

    // =====================================================================
    // Mesru odeme
    // =====================================================================

    function test_ExecutePaysPayeeAndConsumesMandate() public {
        uint256 id = _createMandate();
        uint256 vaultBefore = address(vault).balance;
        uint256 payeeBefore = provider.balance;

        vm.expectEmit(true, true, true, true, address(vault));
        emit MandatePaid(id, agent, provider, AMOUNT);

        vm.prank(agent);
        vault.execute(id, provider, AMOUNT);

        assertEq(address(vault).balance, vaultBefore - AMOUNT);
        assertEq(provider.balance, payeeBefore + AMOUNT);
        assertTrue(vault.getMandate(id).used);
    }

    // =====================================================================
    // Vekalet hata yollari
    // =====================================================================

    function test_ExecuteRevertsForNonAgent() public {
        uint256 id = _createMandate();
        vm.prank(stranger);
        vm.expectRevert(TugraVault.NotAgent.selector);
        vault.execute(id, provider, AMOUNT);
    }

    function test_ExecuteRevertsForOwnerBecauseOwnerIsNotAgent() public {
        uint256 id = _createMandate();
        vm.prank(ownerAddr);
        vm.expectRevert(TugraVault.NotAgent.selector);
        vault.execute(id, provider, AMOUNT);
    }

    function test_ExecuteRevertsOnUnknownMandate() public {
        vm.prank(agent);
        vm.expectRevert(TugraVault.UnknownMandate.selector);
        vault.execute(1, provider, AMOUNT);
    }

    function test_ExecuteRevertsOnPayeeMismatch() public {
        uint256 id = _createMandate();
        vm.prank(agent);
        vm.expectRevert(TugraVault.PayeeMismatch.selector);
        vault.execute(id, stranger, AMOUNT);
    }

    function test_ExecuteRevertsOnAmountTooHigh() public {
        uint256 id = _createMandate();
        vm.prank(agent);
        vm.expectRevert(TugraVault.AmountMismatch.selector);
        vault.execute(id, provider, AMOUNT + 1);
    }

    function test_ExecuteRevertsOnAmountTooLow() public {
        uint256 id = _createMandate();
        vm.prank(agent);
        vm.expectRevert(TugraVault.AmountMismatch.selector);
        vault.execute(id, provider, AMOUNT - 1);
    }

    function test_ExecuteRevertsOnZeroAmount() public {
        uint256 id = _createMandate();
        vm.prank(agent);
        vm.expectRevert(TugraVault.AmountMismatch.selector);
        vault.execute(id, provider, 0);
    }

    function test_ExecuteRevertsWhenRevoked() public {
        uint256 id = _createMandate();
        vm.prank(ownerAddr);
        vault.revoke(id);

        vm.prank(agent);
        vm.expectRevert(TugraVault.Revoked.selector);
        vault.execute(id, provider, AMOUNT);
    }

    /// @dev Sinir: block.timestamp == expiry aninda vekalet HALA GECERLIDIR.
    function test_ExecuteSucceedsAtExactExpiryBoundary() public {
        uint256 id = _createMandate();
        vm.warp(expiry);

        vm.prank(agent);
        vault.execute(id, provider, AMOUNT);

        assertTrue(vault.getMandate(id).used);
        assertEq(provider.balance, AMOUNT);
    }

    /// @dev Sinir: expiry + 1 saniyede sure dolmustur.
    function test_ExecuteRevertsOneSecondAfterExpiry() public {
        uint256 id = _createMandate();
        vm.warp(uint256(expiry) + 1);

        vm.prank(agent);
        vm.expectRevert(TugraVault.Expired.selector);
        vault.execute(id, provider, AMOUNT);
    }

    function test_ExecuteRevertsOnSecondUse() public {
        uint256 id = _createMandate();

        vm.prank(agent);
        vault.execute(id, provider, AMOUNT);

        vm.prank(agent);
        vm.expectRevert(TugraVault.AlreadyUsed.selector);
        vault.execute(id, provider, AMOUNT);

        assertEq(provider.balance, AMOUNT); // tek odeme
    }

    function test_ExecuteRevertsOnInsufficientVaultBalance() public {
        uint256 id = _createMandate();

        vm.prank(ownerAddr);
        vault.withdraw(FUNDING);
        assertEq(address(vault).balance, 0);

        vm.prank(agent);
        vm.expectRevert(TugraVault.InsufficientBalance.selector);
        vault.execute(id, provider, AMOUNT);
    }

    // =====================================================================
    // Basarisiz deneme vekaleti tuketmez; kosul duzelince ayni vekalet calisir
    // =====================================================================

    function test_PayeeMismatchDoesNotConsumeMandate() public {
        uint256 id = _createMandate();

        vm.prank(agent);
        vm.expectRevert(TugraVault.PayeeMismatch.selector);
        vault.execute(id, stranger, AMOUNT);

        assertFalse(vault.getMandate(id).used);

        vm.prank(agent);
        vault.execute(id, provider, AMOUNT);
        assertTrue(vault.getMandate(id).used);
        assertEq(provider.balance, AMOUNT);
    }

    function test_AmountMismatchDoesNotConsumeMandate() public {
        uint256 id = _createMandate();

        vm.prank(agent);
        vm.expectRevert(TugraVault.AmountMismatch.selector);
        vault.execute(id, provider, AMOUNT + 1);

        assertFalse(vault.getMandate(id).used);

        vm.prank(agent);
        vault.execute(id, provider, AMOUNT);
        assertTrue(vault.getMandate(id).used);
    }

    function test_NotAgentAttemptDoesNotConsumeMandate() public {
        uint256 id = _createMandate();

        vm.prank(stranger);
        vm.expectRevert(TugraVault.NotAgent.selector);
        vault.execute(id, provider, AMOUNT);

        assertFalse(vault.getMandate(id).used);

        vm.prank(agent);
        vault.execute(id, provider, AMOUNT);
        assertTrue(vault.getMandate(id).used);
    }

    function test_RejectedTransferRevertsEverythingAndDoesNotConsumeMandate() public {
        ToggleReceiver receiver = new ToggleReceiver(); // baslangicta reddeder
        uint256 id = _createMandate(agent, address(receiver), AMOUNT, expiry);
        uint256 vaultBefore = address(vault).balance;

        vm.prank(agent);
        vm.expectRevert(TugraVault.TransferFailed.selector);
        vault.execute(id, address(receiver), AMOUNT);

        assertEq(address(vault).balance, vaultBefore);
        assertEq(address(receiver).balance, 0);
        assertFalse(vault.getMandate(id).used);
    }

    function test_SameMandateWorksAfterReceiverStartsAccepting() public {
        ToggleReceiver receiver = new ToggleReceiver();
        uint256 id = _createMandate(agent, address(receiver), AMOUNT, expiry);

        vm.prank(agent);
        vm.expectRevert(TugraVault.TransferFailed.selector);
        vault.execute(id, address(receiver), AMOUNT);

        receiver.setAccepts(true);

        vm.prank(agent);
        vault.execute(id, address(receiver), AMOUNT);

        assertEq(address(receiver).balance, AMOUNT);
        assertTrue(vault.getMandate(id).used);
    }

    function test_SameMandateWorksAfterVaultIsRefunded() public {
        uint256 id = _createMandate();

        vm.prank(ownerAddr);
        vault.withdraw(FUNDING);

        vm.prank(agent);
        vm.expectRevert(TugraVault.InsufficientBalance.selector);
        vault.execute(id, provider, AMOUNT);
        assertFalse(vault.getMandate(id).used);

        vm.prank(ownerAddr);
        vault.deposit{value: AMOUNT}();

        vm.prank(agent);
        vault.execute(id, provider, AMOUNT);

        assertTrue(vault.getMandate(id).used);
        assertEq(provider.balance, AMOUNT);
    }

    function test_PaymentToContractWithoutReceiveFails() public {
        NoReceiveReceiver receiver = new NoReceiveReceiver();
        uint256 id = _createMandate(agent, address(receiver), AMOUNT, expiry);

        vm.prank(agent);
        vm.expectRevert(TugraVault.TransferFailed.selector);
        vault.execute(id, address(receiver), AMOUNT);

        assertFalse(vault.getMandate(id).used);
    }

    // =====================================================================
    // Yeniden giris (reentrancy)
    // =====================================================================

    /// @dev Ic cagrinin hatasi disari yayilirsa dis odeme de basarisiz olur ve
    ///      islem butunuyle geri alinir; hicbir vekalet tukenmez.
    function test_ReentrancyPropagating_RevertsEntireTransaction() public {
        ReentrantAgentPayee bad = new ReentrantAgentPayee(vault);
        uint256 id1 = _createMandate(address(bad), address(bad), AMOUNT, expiry);
        uint256 id2 = _createMandate(address(bad), address(bad), AMOUNT, expiry);

        bad.configure(id1, AMOUNT, id2, AMOUNT);
        bad.setPropagate(true);

        uint256 vaultBefore = address(vault).balance;

        vm.expectRevert(TugraVault.TransferFailed.selector);
        bad.attack();

        assertEq(address(vault).balance, vaultBefore);
        assertEq(address(bad).balance, 0);
        assertFalse(vault.getMandate(id1).used);
        assertFalse(vault.getMandate(id2).used);
    }

    /// @dev Ic cagrinin hatasi yakalanirsa dis odeme BASARILI olabilir; ancak
    ///      ikinci odeme gerceklesmez ve ikinci vekalet tukenmez.
    function test_ReentrancyCatching_OnlyFirstPaymentHappens() public {
        ReentrantAgentPayee bad = new ReentrantAgentPayee(vault);
        uint256 id1 = _createMandate(address(bad), address(bad), AMOUNT, expiry);
        uint256 id2 = _createMandate(address(bad), address(bad), AMOUNT, expiry);

        bad.configure(id1, AMOUNT, id2, AMOUNT);
        bad.setPropagate(false);

        uint256 vaultBefore = address(vault).balance;

        bad.attack();

        assertEq(address(bad).balance, AMOUNT);
        assertEq(address(vault).balance, vaultBefore - AMOUNT);
        assertTrue(bad.innerAttempted());
        assertFalse(bad.innerSucceeded());
        // Ikinci odemeyi engelleyen sey kilidin kendisidir: ikinci vekalet
        // taze oldugu icin AlreadyUsed degil, Reentrancy ile reddedilir.
        assertEq(bytes4(bad.innerRevertData()), TugraVault.Reentrancy.selector);
        assertTrue(vault.getMandate(id1).used);
        assertFalse(vault.getMandate(id2).used);
    }

    /// @dev Ayni vekaletle yeniden giris denemesi de tek odemeden fazlasini uretmez.
    function test_ReentrancyCatching_SameMandateCannotPayTwice() public {
        ReentrantAgentPayee bad = new ReentrantAgentPayee(vault);
        uint256 id = _createMandate(address(bad), address(bad), AMOUNT, expiry);

        bad.configure(id, AMOUNT, id, AMOUNT);
        bad.setPropagate(false);

        uint256 vaultBefore = address(vault).balance;

        bad.attack();

        assertEq(address(bad).balance, AMOUNT);
        assertEq(address(vault).balance, vaultBefore - AMOUNT);
        assertTrue(bad.innerAttempted());
        assertFalse(bad.innerSucceeded());
        // Ayni vekalette kilit AlreadyUsed kontrolunden once calisir.
        assertEq(bytes4(bad.innerRevertData()), TugraVault.Reentrancy.selector);
        assertTrue(vault.getMandate(id).used);
    }

    // =====================================================================
    // Ajanin baska para cikis yolu yok
    // =====================================================================

    function test_AgentCannotCreateMandate() public {
        vm.prank(agent);
        vm.expectRevert(TugraVault.NotOwner.selector);
        vault.createMandate(agent, provider, AMOUNT, expiry);
    }

    function test_AgentCannotRevoke() public {
        uint256 id = _createMandate();
        vm.prank(agent);
        vm.expectRevert(TugraVault.NotOwner.selector);
        vault.revoke(id);
    }

    function test_AgentCannotDrainWithArbitraryCall() public {
        // Kontratin ajana acik tek para cikis yolu execute'dir; bilinmeyen
        // selector'lu bir cagri receive/fallback'e dusmez ve basarisiz olur.
        vm.prank(agent);
        (bool ok,) = address(vault).call(abi.encodeWithSignature("sweep(address)", agent));
        assertFalse(ok);
        assertEq(address(vault).balance, FUNDING);
    }
}
