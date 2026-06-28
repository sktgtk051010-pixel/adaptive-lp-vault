// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AdaptiveIPVault} from "../src/AdaptiveIPVault.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";
import {UniswapV2Adapter} from "../src/adapters/UniswapV2Adapter.sol";
import {TWAPOracle} from "../src/TWAPOracle.sol";

interface IUniswapV3PoolLike {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );

    function tickSpacing() external view returns (int24);
}

contract LocalDeploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        address positionManager = vm.envOr("POSITION_MANAGER", address(0xC36442b4a4522E871399CD717aBDD847Ab11FE88));
        address pool = vm.envOr("POOL", address(0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8));
        address router = vm.envOr("ROUTER", address(0xE592427A0AEce92De3Edee1F18E0157C05861564));

        address v2Router = vm.envOr("V2_ROUTER", address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D));
        address v2Pair = vm.envOr("V2_PAIR", address(0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc));

        address token0 = vm.envOr("TOKEN0", address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48));
        address token1 = vm.envOr("TOKEN1", address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2));
        address vaultBaseToken = vm.envOr("VAULT_BASE_TOKEN", token0);

        string memory adapterType = vm.envOr("ADAPTER_TYPE", string("v3"));
        bool isV3Adapter = _isV3Adapter(adapterType);
        bool isV3Oracle = isV3Adapter;

        address oracleTarget = isV3Adapter
            ? vm.envOr("ORACLE_TARGET", pool)
            : vm.envOr("ORACLE_TARGET", v2Pair);

        uint32 twapPeriod = uint32(vm.envOr("TWAP_PERIOD", uint256(300)));
        uint32 fastTwapPeriod = uint32(vm.envOr("FAST_TWAP_PERIOD", uint256(60)));

        string memory vaultName = vm.envOr("VAULT_NAME", string("AdaptiveVault"));
        string memory vaultSymbol = vm.envOr("VAULT_SYMBOL", string("AVLT"));
        uint256 premiumMultiplierBps = vm.envOr("PREMIUM_MULTIPLIER_BPS", uint256(11000));
        uint256 maxRewardLimit = vm.envOr("MAX_REWARD_LIMIT", uint256(100e6));

        if (deployerPrivateKey != 0) {
            vm.startBroadcast(deployerPrivateKey);
        } else {
            vm.startBroadcast();
        }

        address adapterAddress;
        if (isV3Adapter) {
            UniswapV3Adapter adapter = new UniswapV3Adapter(positionManager, pool, router);
            _configureAdapterStrategy(adapter, pool);
            adapterAddress = address(adapter);
        } else {
            UniswapV2Adapter adapter = new UniswapV2Adapter(v2Router, v2Pair, token0, token1);
            adapterAddress = address(adapter);
        }

        TWAPOracle oracle = new TWAPOracle(oracleTarget, vaultBaseToken, isV3Oracle, twapPeriod, fastTwapPeriod);
        AdaptiveIPVault vault = new AdaptiveIPVault(
            vaultName,
            vaultSymbol,
            token0,
            token1,
            adapterAddress,
            address(oracle),
            vaultBaseToken,
            premiumMultiplierBps,
            maxRewardLimit
        );

        vm.stopBroadcast();

        console2.log("Local deploy adapter type:", adapterType);
        console2.log("Local deploy adapter:", adapterAddress);
        console2.log("Local deploy oracle:", address(oracle));
        console2.log("Local deploy vault:", address(vault));
    }

    function _configureAdapterStrategy(UniswapV3Adapter adapter, address poolAddress) internal {
        IUniswapV3PoolLike pool = IUniswapV3PoolLike(poolAddress);
        (, int24 currentTick, , , , , ) = pool.slot0();
        int24 tickSpacing = pool.tickSpacing();
        int24 baseTick = currentTick / tickSpacing * tickSpacing;
        int24 tickLower = baseTick - tickSpacing * 10;
        int24 tickUpper = baseTick + tickSpacing * 10;
        adapter.setStrategy(tickLower, tickUpper);
    }

    function _isV3Adapter(string memory adapterType) internal pure returns (bool) {
        return keccak256(bytes(adapterType)) == keccak256(bytes("v3"));
    }
}