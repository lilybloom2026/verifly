// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {FlyVerifier} from "../FlyVerifier.sol";
import {FlyGenome} from "../FlyGenome.sol";
import {FlyMarket} from "../FlyMarket.sol";

/// Basic lifecycle coverage for the verifiable-inference registry + market.
/// Run with:  forge test -vvv
contract FlyVerifierTest is Test {
    FlyVerifier v;
    FlyGenome g;
    FlyMarket m;

    address arbiter = address(0xA11CE);
    address alice = address(0xA);
    address bob = address(0xB);
    address carol = address(0xC);

    bytes32 constant GROOT = keccak256("genome-130");
    bytes32 constant EPI = keccak256("episode-food");
    bytes32 constant TROOT = keccak256("transcript-true");
    bytes32 constant FAKE = keccak256("transcript-forged");

    function setUp() public {
        v = new FlyVerifier(arbiter);
        g = new FlyGenome(arbiter);
        m = new FlyMarket(v, arbiter);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(carol, 10 ether);
    }

    function test_SubmitAndFinalizeUnchallenged() public {
        vm.prank(alice);
        uint256 id = v.submitRun{value: 0.001 ether}(GROOT, EPI, TROOT, true);

        // cannot finalize before the window closes
        vm.expectRevert(FlyVerifier.TooEarly.selector);
        v.finalize(id);

        vm.warp(block.timestamp + 1 hours + 1);
        uint256 balBefore = alice.balance;
        v.finalize(id);
        assertEq(uint256(v.getRun(id).status), uint256(FlyVerifier.Status.Finalized));
        assertEq(alice.balance, balBefore + 0.001 ether); // bond returned
    }

    function test_ChallengeResolvedByArbiterSlashesLiar() public {
        vm.prank(alice);
        uint256 id = v.submitRun{value: 0.001 ether}(GROOT, EPI, TROOT, true);

        vm.prank(bob);
        v.challenge{value: 0.001 ether}(id, FAKE);
        assertEq(uint256(v.getRun(id).status), uint256(FlyVerifier.Status.Challenged));

        // arbiter re-ran the engine: the claimer was lying
        uint256 bobBefore = bob.balance;
        vm.prank(arbiter);
        v.resolveByArbiter(id, false);
        assertEq(uint256(v.getRun(id).status), uint256(FlyVerifier.Status.Rejected));
        assertEq(bob.balance, bobBefore + 0.002 ether); // challenger takes the pot
    }

    function test_ParimutuelPaysWinners() public {
        vm.prank(alice);
        uint256 id = v.submitRun{value: 0.001 ether}(GROOT, EPI, TROOT, true);

        // bob bets YES 1 eth, carol bets NO 1 eth
        vm.prank(bob);
        m.bet{value: 1 ether}(id, true);
        vm.prank(carol);
        m.bet{value: 1 ether}(id, false);

        vm.warp(block.timestamp + 1 hours + 1);
        v.finalize(id); // reached == true
        m.settle(id);

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        m.claim(id);
        // pool 2 eth, bob had the only YES stake, minus 2% fee => ~1.96 eth
        assertApproxEqAbs(bob.balance, bobBefore + 1.96 ether, 1e12);

        vm.prank(carol);
        vm.expectRevert(FlyMarket.Nothing.selector); // losing side gets nothing
        m.claim(id);
    }

    function test_GenomeBreedIsDeterministic() public {
        vm.prank(alice);
        uint256 a = g.mint{value: 0.002 ether}(130);
        vm.prank(alice);
        uint256 b = g.mint{value: 0.002 ether}(162);

        uint32 expected = g.deriveChildSeed(130, 162, g.totalSupply());
        vm.prank(alice);
        uint256 child = g.breed{value: 0.002 ether}(a, b);
        assertEq(g.seedOf(child), expected);
        assertEq(g.ownerOf(child), alice);
    }
}
