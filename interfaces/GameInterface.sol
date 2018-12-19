pragma solidity ^0.4.24;

interface Game {
    function getResult (
        bytes32 identifier,
        address participant1,
        address particiapant2
    )
        public
        returns (
            address participant1,
            uint256 amount1,
            address participant2,
            uint256 amount2
        );
}