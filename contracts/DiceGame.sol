pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/utils/Address.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import "./RandomInterface.sol";

contract DiceGame {
    using Address for address;

    /**
        States
     */

    uint256 constant MAX_MASK_MODULO = 40;

    struct GameState {
        address initiator;
        address acceptor;
        uint256 initiatorStake;
        uint256 acceptorStake;
        uint256 betMask;
        uint256 modulo;
    }

    mapping (bytes32 => GameState) public identifier_to_gameState;

    RandomInterface myRandom;

    /**
        Constructor
     */
    
    constructor (address _myRandom) public {
        require(_myRandom.isContract(), "invalid random contract address");
        myRandom = RandomInterface(_myRandom);
    }

    /**
        Public Methods
     */
    
    function commitGameState (
        bytes32 identifier,
        address initiator,
        address acceptor,
        uint256 initiatorStake,
        uint256 acceptorStake,
        uint256 betMask,
        uint256 modulo,
        bytes initiatorSignature,
        bytes acceptorSignature
    )
        public
    {
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                identifier,
                initiator,
                acceptor,
                initiatorStake,
                acceptorStake,
                betMask,
                modulo
            )
        );

        require(ECDSA.recover(messageHash, initiatorSignature) == initiator, "invalid initiator signature");
        require(ECDSA.recover(messageHash, acceptorSignature) == acceptor, "invalid acceptor signature");

        bytes32 gameIdentifier = getGameIdentifier (
            identifier,
            initiator,
            acceptor
        );

        GameState storage gameState = identifier_to_gameState[gameIdentifier];
        gameState.initiator = initiator;
        gameState.acceptor = acceptor;
        gameState.initiatorStake = initiatorStake;
        gameState.acceptorStake = acceptorStake;
        gameState.betMask = betMask;
        gameState.modulo = modulo;

        emit CommitGameState (
            identifier,
            initiator,
            acceptor,
            gameIdentifier
        );
    }

    /**
        External Methods
     */

    function getResult (
        bytes32 identifier,
        address participant1,
        address participant2
    )
        external
        returns (
            bool isCommitted,
            uint256 amount1,
            uint256 amount2
        )
    {
        GameState storage gameState = identifier_to_gameState[getGameIdentifier(identifier, participant1, participant2)];

        if (gameState.initiator == 0x0 && gameState.acceptor == 0x0) {
            isCommitted = false;
            return;
        }

        require(gameState.initiator != 0x0 && gameState.acceptor != 0x0 && gameState.initiator != gameState.acceptor, "invalid game state");

        uint8 randomStatus;
        bytes32 random;
        address winner;

        (
            randomStatus,
            random,
            winner
        ) = myRandom.getRandom (
            identifier,
            participant1,
            participant2
        );

        if (randomStatus == 0) {
            isCommitted = false;
            return;
        } 
        
        isCommitted = true;

        if (randomStatus == 2) {
            uint256 dice = uint256(random) % gameState.modulo;

            if (gameState.modulo <= MAX_MASK_MODULO) {
                if (((2 ** dice) & uint40(gameState.betMask)) != 0) {
                    winner = gameState.initiator;
                } else {
                    winner = gameState.acceptor;
                }
            } else {
                if (dice < gameState.betMask) {
                    winner = gameState.initiator;
                } else {
                    winner = gameState.acceptor;
                }
            }
        }

        if (winner == participant1) {
            amount1 = gameState.initiatorStake + gameState.acceptorStake;
            amount2 = 0;
        } else if (winner == participant2) {
            amount1 = 0;
            amount2 = gameState.initiatorStake + gameState.acceptorStake;
        } else {
            revert("invalid winner");
        }
    }

    /**
        Events
     */

    event CommitGameState (
        bytes32 indexed identifier,
        address indexed initiator,
        address indexed acceptor,
        bytes32 gameIdentifier
    );

    /**
        Internal Methods
     */

    function getGameIdentifier (
        bytes32 identifier,
        address initiator,
        address acceptor
    )
        internal
        pure
        returns (bytes32 gameIdentifier)
    {
        require(initiator != 0x0 && acceptor != 0x0 && initiator != acceptor, "invalid input");

        if (initiator < acceptor) {
            gameIdentifier = keccak256(
                abi.encodePacked(
                    identifier,
                    initiator,
                    acceptor
                )
            );
        } else {
            gameIdentifier = keccak256(
                abi.encodePacked(
                    identifier,
                    acceptor,
                    initiator
                )
            );        
        }
    }
}