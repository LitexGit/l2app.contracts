pragma solidity ^0.4.24;

interface GameInterface {
    function getResult (
        bytes32 identifier,
        address participant1,
        address particiapant2
    )
        external
        returns (
            bool isCommitted,
            uint256 amount1,
            uint256 amount2
        );
}
