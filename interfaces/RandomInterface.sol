pragma solidity ^0.4.24

interface Randoms {
    function initiatorCommit (
        bytes32 identifier,
        address initiator,
        address acceptor,
        bytes32 initiatorHashRandom,
        bytes initiatorSignature,
        bytes32 acceptorRandom,
        bytes acceptorSignature,
        bytes32 initiatorRandom
    )
        public
    {
        emit InitiatorCommitted (
            identifier, 
            initiator, 
            acceptor, 
            random
        );
    }

    function acceptorCommit (
        bytes32 identifier,
        address initiator,
        address acceptor,
        bytes32 initiatorHashRandom,
        bytes initiatorSignature,
        bytes32 acceptorRandom
    )
        public
    {
        emit AcceptorCommitted (
            identifier,
            initiator,
            acceptor,
            initiatorHashRandom
        )
    }

    function initiatorReveal (
        bytes32 identifier,
        bytes32 initiatorRandom
    )
        public
    {
        emit InitiatorRevealed (
            identifier,
            initiatorRandom,
            random
        )
    }

    function getRandom (
        bytes32 identifier,
        address participant1,
        address participant2,
    )
        public
        view
        returns (uint8 status, bytes32 random, address acceptor)
    {
        
    }

    /**
        Events
     */

    event InitiatorCommitted (
        bytes32 indexed identifier,
        address indexed initiator,
        address indexed acceptor,
        bytes32 random
    );

    event AcceptorSettled (
        bytes32 indexed identifier,
        address indexed initiator,
        address indexed acceptor,
        bytes32 initiatorHashRandom,
    );

    event InitiatorRevealed (
        bytes32 indexed identifier,
        address indexed initiator,
        address indexed acceptor,
        bytes32 random
    );

}
