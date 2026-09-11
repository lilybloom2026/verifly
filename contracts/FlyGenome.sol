// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FlyGenome
/// @notice Each token is a CIPHERFLY genome — a 32-bit seed from which the full
///         deterministic connectome is derived (see lib/engine.ts `buildConnectome`).
///         The seed IS the fly: anyone holding it can reproduce the exact brain,
///         run it on any task, and generate a verifiable proof (see FlyVerifier).
///
///         Genomes breed. `breed(a,b)` mints a child whose seed is derived
///         on-chain and deterministically from its parents, so lineage is
///         public and reproducible. Run the children, find the ones that solve
///         the task, breed the winners — evolutionary pressure with a market.
///
/// @dev    Minimal self-contained ERC-721 (no external deps) — the subset needed
///         to own, transfer, and enumerate genomes.
contract FlyGenome {
    string public constant name = "CIPHERFLY Genome";
    string public constant symbol = "GENOME";

    struct Fly {
        uint32 seed;
        uint32 parentA; // token id of parent A (0 for genesis)
        uint32 parentB;
        uint64 bornAt;
    }

    uint256 public totalSupply;
    mapping(uint256 => Fly) public flies;
    mapping(uint256 => address) private _owner;
    mapping(address => uint256) private _balance;
    mapping(uint256 => address) private _approved;
    mapping(address => mapping(address => bool)) private _operator;

    uint256 public mintFee = 0.002 ether;
    address public immutable treasury;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event Hatched(uint256 indexed tokenId, uint32 seed, uint32 parentA, uint32 parentB);

    error NotOwner();
    error BadToken();
    error BadFee();
    error NotAuthorized();

    constructor(address _treasury) {
        treasury = _treasury;
    }

    /// @notice Mint a genesis genome from a chosen seed.
    function mint(uint32 seed) external payable returns (uint256 id) {
        if (msg.value < mintFee) revert BadFee();
        id = _mint(msg.sender, seed, 0, 0);
        _forward(msg.value);
    }

    /// @notice Breed two genomes you can operate into a new child. The child's
    ///         seed is derived deterministically from the parents and the
    ///         current supply, so it is unique and fully reproducible off-chain.
    function breed(uint256 aId, uint256 bId) external payable returns (uint256 id) {
        if (msg.value < mintFee) revert BadFee();
        if (_owner[aId] == address(0) || _owner[bId] == address(0)) revert BadToken();
        uint32 childSeed = deriveChildSeed(flies[aId].seed, flies[bId].seed, totalSupply);
        id = _mint(msg.sender, childSeed, uint32(aId), uint32(bId));
        _forward(msg.value);
    }

    /// @notice Pure, public breeding rule — mirror this off-chain to preview a
    ///         child before paying to mint it.
    function deriveChildSeed(uint32 aSeed, uint32 bSeed, uint256 salt)
        public
        pure
        returns (uint32)
    {
        return uint32(uint256(keccak256(abi.encodePacked(aSeed, bSeed, salt))));
    }

    function seedOf(uint256 id) external view returns (uint32) {
        if (_owner[id] == address(0)) revert BadToken();
        return flies[id].seed;
    }

    // ---- minimal ERC-721 surface ----
    function ownerOf(uint256 id) public view returns (address o) {
        o = _owner[id];
        if (o == address(0)) revert BadToken();
    }

    function balanceOf(address a) external view returns (uint256) {
        return _balance[a];
    }

    function approve(address to, uint256 id) external {
        address o = ownerOf(id);
        if (msg.sender != o && !_operator[o][msg.sender]) revert NotAuthorized();
        _approved[id] = to;
        emit Approval(o, to, id);
    }

    function setApprovalForAll(address op, bool ok) external {
        _operator[msg.sender][op] = ok;
        emit ApprovalForAll(msg.sender, op, ok);
    }

    function getApproved(uint256 id) external view returns (address) {
        return _approved[id];
    }

    function isApprovedForAll(address o, address op) external view returns (bool) {
        return _operator[o][op];
    }

    function transferFrom(address from, address to, uint256 id) public {
        if (ownerOf(id) != from) revert NotOwner();
        if (
            msg.sender != from &&
            msg.sender != _approved[id] &&
            !_operator[from][msg.sender]
        ) revert NotAuthorized();
        require(to != address(0), "zero to");
        _approved[id] = address(0);
        _balance[from] -= 1;
        _balance[to] += 1;
        _owner[id] = to;
        emit Transfer(from, to, id);
    }

    function _mint(address to, uint32 seed, uint32 pa, uint32 pb) private returns (uint256 id) {
        id = ++totalSupply; // ids start at 1
        _owner[id] = to;
        _balance[to] += 1;
        flies[id] = Fly({seed: seed, parentA: pa, parentB: pb, bornAt: uint64(block.timestamp)});
        emit Transfer(address(0), to, id);
        emit Hatched(id, seed, pa, pb);
    }

    function _forward(uint256 amount) private {
        (bool ok, ) = treasury.call{value: amount}("");
        require(ok, "forward failed");
    }
}
