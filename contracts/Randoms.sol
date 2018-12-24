pragma solidity ^0.4.24

contract Randoms {
    /**
        States
     */

    struct RandomState {
        // 0 = non-exist 
        // 1 = waiting for initiator reveal
        // 2 = finality
        uint8 status;

        uint256 lastRevealBlock;

        bytes32 initiatorHashRandom;

        bytes32 acceptorRandom;

        address acceptor;

        bytes32 random;
    }

    mapping (bytes32 => RandomState) public identifier_to_random;

    uint256 public revealWindow; 

    /**
        Constructor
     */

    constructor (uint256 _revealWindow) public {
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
        address recoveredInitiator = recoverInitiatorSignature(
            identifier,
            initiator,
            acceptor,
            initiatorHashRandom,
            initiatorSignature
        );

        require(recoveredInitiator == initiator, "invalid initiator signature");

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                address(this),
                identifier,
                initiator,
                acceptor,
                initiatorHashRandom,
                initiatorSignature,
                acceptorRandom
            )
        );

        require(ECDSA.recover(messageHash, acceptorSignature) == acceptor, "invalid acceptor signature");

        require(initiatorHashRandom == keccak256(abi.encodePacked(initiatorRandom)), "invalid initiatorRandom");

        bytes32 randomIdentifier = getRandomIdentifier(
            identifier,
            initiator,
            acceptor
        );

        RandomState storage random = identifier_to_random[randomIdentifier];

        require(random.status == 0, "already committed");

        random.status = 2;
        random.random = keccak256(abi.encodePacked(initiatorRandom, acceptorRandom));

        emit InitiatorCommitted (
            identifier, 
            initiator, 
            acceptor,
            initiatorRandom,
            acceptorRandom, 
            random,
            randomIdentifier
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
        address recoveredInitiator = recoverInitiatorSignature(
            identifier,
            initiator,
            acceptor,
            initiatorHashRandom,
            initiatorSignature
        );

        require(recoveredInitiator == initiator, "invalid initiator signature");

        bytes32 randomIdentifier = getRandomIdentifier (
            identifier,
            initiator,
            acceptor
        );

        RandomState storage random = identifier_to_random[randomIdentifier];

        require(random.status == 0, "already committed");

        random.status = 1;
        random.initiatorHashRandom = initiatorHashRandom;
        random.acceptorRandom = acceptorRandom;
        random.lastRevealBlock = block.number + revealWindow;
        random.acceptor = acceptor;

        emit AcceptorCommitted (
            identifier,
            initiator,
            acceptor,
            initiatorHashRandom,
            acceptorRandom,
            randomIdentifier
        );
    }

    function initiatorReveal (
        bytes32 randomIdentifier,
        bytes32 initiatorRandom
    )
        public
    {
        RandomState storage random = identifier_to_random[randomIdentifier];

        require(random.status == 1, "random status should be waiting for reveal");

        require(keccak256(abi.encodePacked(initiatorRandom)) == random.initiatorHashRandom, "initiatorRandom should be correct");

        require(block.number <= random.lastRevealBlock, "commit block expired");

        random.status = 2;
        random.random = keccak256(abi.encodePacked(initiatorRandom, random.acceptorRandom));

        emit InitiatorRevealed (
            randomIdentifier,
            initiator,
            acceptor,
            initiatorRandom,
            random.acceptorRandom,
            random.random
        );
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
        RandomState storage randomState = identifier_to_random[getRandomIdentifier(identifier, participant1, participant2)];

        if (randomState.status == 0) {
            status = 0;
        } else if (randomState.status == 1) {
            require(block.number > randomState.lastRevealBlock, "waiting for initiator reveal");

            status = 1;
            acceptor = randomState.acceptor;
        } else if (randomState.status == 2) {
            status = 2;
            random = randomState.random;
        }
        
    }

    /**
        Events
     */

    event InitiatorCommitted (
        bytes32 indexed identifier,
        address indexed initiator,
        address indexed acceptor,
        bytes32 initiatorRandom,
        bytes32 acceptorRandom,
        bytes32 random,
        bytes32 randomIdentifier
    );

    event AcceptorCommitted (
        bytes32 indexed identifier,
        address indexed initiator,
        address indexed acceptor,
        bytes32 initiatorHashRandom,
        bytes32 acceptorRandom,
        bytes32 randomIdentifier
    );

    event InitiatorRevealed (
        bytes32 indexed identifier,
        address indexed initiator,
        address indexed acceptor,
        bytes32 initiatorRandom,
        bytes32 acceptorRandom,
        bytes32 random
    );

    /**
        Internal Methods
     */

    function recoverInitiatorSignature (
        bytes32 identifier,
        address initiator,
        address acceptor,
        bytes32 initiatorHashRandom,
        bytes initiatorSignature
    )
        internal
        pure
        returns (address)
    {
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                identifier,
                initiator,
                acceptor,
                initiatorHashRandom
            )
        );
        return ECDSA.recover(messageHash, initiatorSignature);
    }

    function getRandomIdentifier (
        bytes32 identifier,
        address initiator,
        address acceptor
    )
        internal
        pure
        returns (bytes32 randomIdentifier)
    {
        require(initiator != 0x0 && acceptor != 0x0 && initiator != acceptor, "invalid input");

        if (initiator < acceptor) {
            randomIdentifier = keccak256(
                abi.encodePacked(
                    identifier,
                    initiator,
                    acceptor
                )
            );
        } else {
            randomIdentifier = keccak256(
                abi.encodePacked(
                    identifier,
                    acceptor,
                    initiator
                )
            );        
        }
    }
}