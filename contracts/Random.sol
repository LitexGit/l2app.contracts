pragma solidity ^0.4.24

contract Randoms {
    /**
        States
     */

    struct Random {
        // 0 = non-exist 
        // 1 = waiting for initiator reveal
        // 2 = finality
        uint8 status;

        uint256 lastRevealBlock;

        address acceptor;

        bytes32 acceptorRandom;

        bytes32 random;
    }

    mapping (bytes32 => Random) public identifier_to_random;

    uint256 public revealWindow; 

    /**
        Constructor
     */

    constructor(uint256 _revealWindow) public {
        require(_revealWindow > 0, "invalid reveal window");

        revealWindow = _revealWindow;
    }

    /**
        Public Methods
     */    

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