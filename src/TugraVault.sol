// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @title TugraVault
/// @notice Sahibin native MON tuttugu kasa. Sahip, bir ajana tek bir satin alma
///         icin "vekalet" verir: sabit alici, tam tutar, son gecerlilik zamani,
///         tek kullanim. Ajanin kasadan para cikarabilecegi tek yol
///         `execute(mandateId, payee, amount)` cagrisidir.
/// @dev    Approval, keyfi cagri, upgrade veya baska bir para cikis yolu yoktur.
///         Yalnizca native MON ile calisir.
contract TugraVault {
    // ---------------------------------------------------------------------
    // Veri yapisi
    // ---------------------------------------------------------------------

    /// @param agent   Vekaleti kullanmaya yetkili tek adres.
    /// @param expiry  Son gecerlilik zamani (unix saniye). Gecerlilik kurali:
    ///                `block.timestamp <= expiry` ise vekalet kullanilabilir.
    ///                `block.timestamp > expiry` ise Expired.
    ///                Yani tam sinir anini (block.timestamp == expiry) vekalet
    ///                HALA GECERLIDIR; sure bir saniye sonra dolar.
    /// @param used    Basarili odeme ile tuketildi mi.
    /// @param revoked Sahip tarafindan iptal edildi mi.
    /// @param payee   Odemenin gidecegi sabit alici.
    /// @param amount  Tam odeme tutari (wei). Kismi veya fazla odeme yok.
    struct Mandate {
        address agent; // slot 0 (20 bayt)
        uint64 expiry; // slot 0 (8 bayt)
        bool used; // slot 0 (1 bayt)
        bool revoked; // slot 0 (1 bayt)
        address payee; // slot 1
        uint256 amount; // slot 2
    }

    // ---------------------------------------------------------------------
    // Durum
    // ---------------------------------------------------------------------

    /// @notice Kasanin sahibi. Deploy eden adres, degistirilemez.
    address public immutable owner;

    /// @notice Bir sonraki vekalet kimligi. Kimlikler 1'den baslar; 0 gecersizdir.
    uint256 public nextMandateId = 1;

    mapping(uint256 => Mandate) private _mandates;

    /// @dev Yeniden giris kilidi. 1 = acik, 2 = kilitli.
    uint256 private _lock = 1;

    // ---------------------------------------------------------------------
    // Hatalar
    // ---------------------------------------------------------------------

    // Vekalet kullanimi
    error NotAgent();
    error PayeeMismatch();
    error AmountMismatch();
    error Expired();
    error Revoked();
    error AlreadyUsed();

    // Yonetim ve transfer
    error NotOwner();
    error TransferFailed();
    error InsufficientBalance();

    // Girdi dogrulamasi
    error ZeroAgent();
    error ZeroPayee();
    error ZeroAmount();
    error InvalidExpiry();
    error UnknownMandate();

    // Yeniden giris
    error Reentrancy();

    // ---------------------------------------------------------------------
    // Olaylar
    // ---------------------------------------------------------------------

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event MandateCreated(
        uint256 indexed mandateId, address indexed agent, address indexed payee, uint256 amount, uint64 expiry
    );
    event MandateRevoked(uint256 indexed mandateId);
    event MandatePaid(uint256 indexed mandateId, address indexed agent, address indexed payee, uint256 amount);

    // ---------------------------------------------------------------------
    // Degistiriciler
    // ---------------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor() {
        owner = msg.sender;
    }

    // ---------------------------------------------------------------------
    // Para yatirma / cekme
    // ---------------------------------------------------------------------

    /// @notice Kasaya native MON yatirir. Herkes yatirabilir.
    function deposit() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Dogrudan gonderilen native MON'u kabul eder.
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Sahip kasadan para ceker. Ajanin bu fonksiyona yetkisi yoktur.
    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (address(this).balance < amount) revert InsufficientBalance();

        emit Withdrawn(owner, amount);

        (bool ok,) = owner.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ---------------------------------------------------------------------
    // Vekalet yonetimi (yalnizca sahip)
    // ---------------------------------------------------------------------

    /// @notice Tek kullanimlik vekalet olusturur.
    /// @param expiry Son gecerlilik zamani. Olusturma aninda gelecekte olmalidir
    ///               (`expiry > block.timestamp`); esit veya gecmis deger reddedilir.
    function createMandate(address agent, address payee, uint256 amount, uint64 expiry)
        external
        onlyOwner
        returns (uint256 mandateId)
    {
        if (agent == address(0)) revert ZeroAgent();
        if (payee == address(0)) revert ZeroPayee();
        if (amount == 0) revert ZeroAmount();
        if (expiry <= block.timestamp) revert InvalidExpiry();

        mandateId = nextMandateId;
        nextMandateId = mandateId + 1;

        _mandates[mandateId] =
            Mandate({agent: agent, expiry: expiry, used: false, revoked: false, payee: payee, amount: amount});

        emit MandateCreated(mandateId, agent, payee, amount, expiry);
    }

    /// @notice Sahip, kullanilmamis bir vekaleti iptal eder.
    function revoke(uint256 mandateId) external onlyOwner {
        Mandate storage m = _mandate(mandateId);
        if (m.used) revert AlreadyUsed();
        if (m.revoked) revert Revoked();

        m.revoked = true;
        emit MandateRevoked(mandateId);
    }

    // ---------------------------------------------------------------------
    // Ajanin tek yetkisi
    // ---------------------------------------------------------------------

    /// @notice Vekalete tam olarak uyan tek odemeyi yapar.
    /// @dev Kontrol sirasi: varlik -> yetki -> iptal -> kullanilmis -> sure ->
    ///      alici -> tutar -> bakiye. Etkiler (used = true) dis cagridan ONCE
    ///      islenir (checks-effects-interactions) ve nonReentrant ile korunur.
    ///      Dis odeme basarisizsa islem butunuyle geri alinir, vekalet tukenmez.
    function execute(uint256 mandateId, address payee, uint256 amount) external nonReentrant {
        Mandate storage m = _mandate(mandateId);

        if (msg.sender != m.agent) revert NotAgent();
        if (m.revoked) revert Revoked();
        if (m.used) revert AlreadyUsed();
        if (block.timestamp > m.expiry) revert Expired();
        if (payee != m.payee) revert PayeeMismatch();
        if (amount != m.amount) revert AmountMismatch();
        if (address(this).balance < amount) revert InsufficientBalance();

        // Effects
        m.used = true;
        emit MandatePaid(mandateId, msg.sender, payee, amount);

        // Interaction
        (bool ok,) = payee.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ---------------------------------------------------------------------
    // Gorunumler
    // ---------------------------------------------------------------------

    function getMandate(uint256 mandateId) external view returns (Mandate memory) {
        return _mandate(mandateId);
    }

    /// @notice Olusturulmus vekalet sayisi.
    function mandateCount() external view returns (uint256) {
        return nextMandateId - 1;
    }

    function _mandate(uint256 mandateId) private view returns (Mandate storage) {
        if (mandateId == 0 || mandateId >= nextMandateId) revert UnknownMandate();
        return _mandates[mandateId];
    }
}
