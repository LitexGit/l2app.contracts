pragma solidity ^0.4.24;

interface RegistryChannel {
    function createERC20TokenNetwork (
        address erc20Token,
        address gameContract,
        uint256 settleWindowMin,
        uint256 settleWindowMax
    );

    function createETHNetwork (
        address gameContract,
        uint256 settleWindowMin,
        uint256 settleWindowMax
    );
}