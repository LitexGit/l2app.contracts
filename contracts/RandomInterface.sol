pragma solidity ^0.4.24

interface RandomInterface {
    function getRandom (
        bytes32 identifier,
        address participant1,
        address participant2
    )
        external
        returns (
            uint8 status, 
            bytes32 random, 
            address acceptor
        );
}
