// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ArcProofEscrow.sol";

/// @notice Deploys ArcProofEscrow to Arc Testnet.
contract DeployArcProof is Script {
    // Official Arc Testnet optional USDC ERC-20 interface (6 decimals).
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (ArcProofEscrow escrow) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address arbiter = vm.envOr("ARBITER", vm.addr(deployerPrivateKey));

        vm.startBroadcast(deployerPrivateKey);
        escrow = new ArcProofEscrow(ARC_USDC, arbiter);
        vm.stopBroadcast();
    }
}
