pragma solidity ^0.4.24;

import "./GameInterface.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import "openzeppelin-solidity/contracts/utils/Address.sol";

contract ETHChannel {  
    using Address for address;

    /**
        States
     */
    
    GameInterface public game;

    address public regulator;

    address public provider;

    int256 public providerBalance;

    uint256 public settleWindowMin;
    uint256 public settleWindowMax;

    struct Channel {
        // 0 = not-exist or settled
        // 1 = open
        // 2 = close
        uint8 status;
        
        uint256 settleBlock;

        address participant;

        address puppet;

        uint256 deposit;

        bytes32 participantBalanceHash;

        uint256 participantNonce;

        bytes32 providerBalanceHash;

        uint256 providerNonce;

        uint256 inAmount;

        uint256 inNonce;

        uint256 outAmount;

        uint256 outNonce;

        bool isCloser;
    }

    uint256 public counter;

    mapping (address => uint256) public participant_to_counter;

    mapping (bytes32 => Channel) public identifier_to_channel;

    struct LockedAmount {
        address participant;
        address puppet;
        uint256 participantAmount;
        uint256 providerAmount;
    }

    mapping (bytes32 => LockedAmount) identifier_to_lockedAmount;

    /**
        Constructor
     */

    constructor (
        address _game,
        address _regulator,
        address _provider,
        uint256 _settleWindowMin,
        uint256 _settleWindowMax
    )
        public
    {
        require(_game.isContract(), "invalid game contract");
        require(_provider.isContract() == false, "provider should be a external address");
        require(settleWindowMin > 0);
        require(settleWindowMax > settleWindowMin);

        game = GameBase(_game);
        regulator = _regulator;
        provider = _provider;
        settleWindowMin = _settleWindowMin;
        settleWindowMax = _settleWindowMax;
    }

    /**
        Modifiers
     */

    modifier isChannelOpened (address participant) {
        bytes32 channelIdentifier = getChannelIdentifier(participant);
        require(identifier_to_channel[channelIdentifier].state == 1, "channel should be open");
        _;
    }

    modifier isChannelClosed (address participant) {
        bytes32 channelIdentifier = getChannelIdentifier(participant);
        require(identifier_to_channel[channelIdentifier].state == 2, "channel should be closed");
        _;
    }

    modifier settleWindowValid (uint256 settleWindow) {
        require(settleWindow <= settleWindowMax && settleWindow >= settleWindowMin, "invalid settleWindow");
        _;
    }

    modifier commitBlockValid (uint256 lastCommitBlock) {
        require(block.number <= lastCommitBlock, "commit block expired");
        _;
    }

    /**
        Externel Methods
     */
    
    /**
        Public Methods
     */

    function openChannel (
        address participant,
        address puppet,
        uint256 settleWindow
    )
        public
        payable
        settleWindowValid (settleWindow)
    {
        require (participant_to_counter[participant] == 0, "channel already exists");
        require (msg.value > 0, "participant should deposit when open channel");

        channelCounter += 1;
        participant_to_counter[participant] = channelCounter;

        bytes32 channelIdentifier = getChannelIdentifier (participant);
        Channel storage channel = identifier_to_channel[channelIdentifier];
        channel.state = 1;
        channel.puppet = puppet;
        channel.deposit = msg.value;
        channel.settleBlock = settleWindow;

        emit ChannelOpened (
            participant,
            puppet,
            channelIdentifier,
            msg.value,
            settleWindow
        );
    }

    function setPuppet (
        address puppet,
        uint256 lastCommitBlock,
        bytes providerSignature,
        bytes regulatorSignature
    )
        public
        isChannelOpened (msg.sender)
    {
        require (block.number <= lastCommitBlock, "commit expired");

        bytes32 channelIdentifier = getChannelIdentifier (msg.sender);
        Channel storage channel = identifier_to_channel[channelIdentifier];
        require (channel.puppet != puppet, "new puppet should be different from old one");

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                address(this),
                channelIdentifier,
                puppet,
                lastCommitBlock
            )
        );
        require(ECDSA.recover(messageHash, providerSignature) == provider, "invalid provider signature");
        require(ECDSA.recover(messageHash, regulatorSignature) == regulator, "invalid regulator signature");

        channel.puppet = puppet;

        emit PuppetChanged (
            channelIdentifier,
            msg.sender,
            puppet
        );
    }

    function setTotalDeposit (
        address participant
    )
        public
        payable
        isChannelOpened(participant)
    {
        require(msg.value > 0, "invalid deposit");

        bytes32 channelIdentifier = getChannelIdentifier(participant);
        Channel storage channel = identifier_to_channel[channelIdentifier];
        channel.deposit += msg.value;

        emit ChannelNewDeposit (
            channelIdentifier,
            participant,
            msg.value,
            channel.deposit
        );
    }

    function cooperativeSettle (
        address participant,
        uint256 balance,
        uint256 lastCommitBlock,
        bytes participantSignature,
        bytes providerSignature,
        bytes regulatorSignature
    )
        public
        isChannelOpened(participant)
        commitBlockValid(lastCommitBlock)
    {
        require(msg.sender == participant, "only participant can trigger");

        bytes32 channelIdentifier = getChannelIdentifier(participant);
                
        Channel storage channel = identifier_to_channel[channelIdentifier];

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                address(this),
                channelIdentifier,
                participant,
                balance,
                lastCommitBlock
            ) 
        );
        require(ECDSA.recover(messageHash, participantSignature) == channel.puppet, "invalid participant signature");
        require(ECDSA.recover(messageHash, providerSignature) == provider, "invalid provider signature");
        require(ECDSA.recover(messageHash, regulatorSignature) == regulator, "invalid regulator signature");

        if (balance >= channel.deposit) {
            providerBalance -= int256(balance - channel.deposit);
        } else {
            providerBalance += int256(channel.deposit - balance);
        }

        delete identifier_to_channel[channelIdentifier];
        delete participant_to_counter[participant];

        if (balance > 0) {
            participant.transfer(balance);
        }

        emit CooperativeSettled (
            channelIdentifier, 
            participant, 
            balance
        );
    }

    function closeChannel (
        address participant,
        bytes32 balanceHash, 
        uint256 nonce, 
        bytes partnerSignature,
        uint256 inAmount,
        uint256 inNonce,
        bytes regulatorSignature,
        bytes inProviderSignature,
        uint256 outAmount,
        uint256 outNonce,
        bytes participantSignature,
        bytes outProviderSignature
    )
        public
        isChannelOpened(participant)
    {
        bytes32 channelIdentifier = getChannelIdentifier(participant);
        Channel storage channel = identifier_to_channel(channelIdentifier);

        address recoveredPartner = recoverBalanceSignature (
            channelIdentifier,
            balanceHash,
            nonce,
            partnerSignature
        );

        if (recoveredPartner == channel.puppet) {
            require(msg.sender == provider, "only provider can trigger");
            if (nonce > 0) {
                channel.participantBalanceHash = balanceHash;
                channel.participantNonce = nonce;
            }
            channel.isCloser = false;
        } else if (recoveredPartner == provider) {
            require(msg.sender == participant, "only participant can trigger");
            if (nonce > 0) {
                channel.providerBalanceHash = balanceHash;
                channel.providerNonce = nonce;
            }
            channel.isCloser = true;
        } else {
            revert("invalid partner signature");
        }

        channel.state = 2;
        channel.settleBlock += uint256(block.number);

        updateRebalanceProof (
            channelIdentifier,
            inAmount,
            inNonce,
            regulatorSignature,
            inProviderSignature,
            outAmount,
            outNonce,
            participantSignature,
            outProviderSignature
        );

        emit ChannelClosed (
            channelIdentifier, 
            msg.sender, 
            balanceHash,
            nonce,
            inAmount,
            inNonce,
            outAmount,
            outNonce
        );
    }
     
    function partnerUpdateProof (
        address participant,
        bytes32 balanceHash, 
        uint256 nonce, 
        bytes partnerSignature,
        uint256 inAmount,
        uint256 inNonce,
        bytes regulatorSignature,
        bytes inProviderSignature,
        uint256 outAmount,
        uint256 outNonce,
        bytes participantSignature,
        bytes outProviderSignature,
        bytes consignorSignature
    )
        public
        isChannelClosed(participant)
    {
        bytes32 channelIdentifier = getChannelIdentifier(participant);
        Channel storage channel = identifier_to_channel[channelIdentifier];

        require(block.number <= channel.settleBlock, "commit block expired");

        address recoveredPartner = recoverBalanceSignature (
            channelIdentifier,
            balanceHash,
            nonce
        );

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                address(this),
                channelIdentifier,
                balanceHash,
                nonce,
                partnerSignature,
                inAmount,
                inNonce,
                regulatorSignature,
                inProviderSignature,
                outAmount,
                outNonce,
                participantSignature,
                outProviderSignature
            )
        );

        address recoveredConsignor = ECDSA.recover(messageHash, consignorSignature);

        if (channel.isCloser) {
            require(recoveredPartner == channel.puppet, "invalid partner signature");
            require(recoveredConsignor == provider, "invalid consignor signature");

            if (nonce > channel.participantNonce) {
                channel.participantNonce = nonce;
                channel.participantBalanceHash = balanceHash;
            }
        } else {
            require(recoveredPartner == provider, "invalid partner signature");
            require(recoveredConsignor == channel.puppet, "invalid consignor signature");

            if (nonce > channel.providerNonce) {
                channel.providerNonce = nonce;
                channel.providerBalanceHash = balanceHash;
            }        
        }

        updateRebalanceProof (
            channelIdentifier,
            inAmount,
            inNonce,
            regulatorSignature,
            inProviderSignature,
            outAmount,
            outNonce,
            participantSignature,
            outProviderSignature          
        );

        emit partnerUpdateProof (
            channelIdentifier, 
            participant, 
            channel.balanceHash,
            channel.nonce,
            channel.inAmount,
            channel.inNonce,
            channel.outAmount,
            channel.outNonce
        );
    }

    function regulatorUpdateProof (
        address participant,
        uint256 inAmount,
        uint256 inNonce,
        bytes regulatorSignature,
        bytes inProviderSignature,
        uint256 outAmount,
        uint256 outNonce,
        bytes participantSignature,
        bytes outProviderSignature
    )
        public
        isChannelClosed (participant)
    {
        bytes32 channelIdentifier = getChannelIdentifier(participant);
        Channel storage channel = identifier_to_channel[channelIdentifier];
        require(block.number <= channel.settleBlock, "commit block expired");

        updateRebalanceProof (
            channelIdentifier,
            inAmount,
            inNonce,
            regulatorSignature,
            inProviderSignature,
            outAmount,
            outNonce,
            participantSignature,
            outProviderSignature 
        );

        emit regulatorUpdateProof (
            channelIdentifier,
            participant,
            channel.inAmount,
            channel.inNonce,
            channel.outAmount,
            channel.outNonce
        );
    }

    function settleChannel (
        address participant, 
        uint256 participantTransferredAmount,
        uint256 participantLockedAmount,
        uint256 participantLockNonce,
        uint256 providerTransferredAmount,
        uint256 providerLockedAmount,
        uint256 providerLockNonce
    )
        public
        isChannelClosed(participant)
    {
        bytes32 channelIdentifier = getChannelIdentifier(participant);
        Channel storage channel = identifier_to_channel[channelIdentifier];

        require(block.number > channel.settleBlock, "settleWindow should be over");

        verifyBalanceData (
            channel.participantBalanceHash,
            participantTransferredAmount,
            participantLockedAmount,
            participantLockNonce
        );

        verifyBalanceData (
            channel.providerBalanceHash,
            providerTransferredAmount,
            providerLockedAmount,
            providerLockNonce           
        );

        bytes32 lockIdentifier;
        (
            lockIdentifier,
            participantLockedAmount,
            providerLockedAmount
        ) = settleLockData (
            participant,
            participantLockedAmount,
            participantLockNonce,
            providerLockedAmount,
            providerLockNonce
        );

        require(channel.deposit + channel.inAmount - channel.outAmount >= 0, "channel balance should be positive");
        require(channel.deposit + channel.inAmount - channel.outAmount >= participantLockedAmount + providerLockedAmount, "channel balance should be greater than locked amount");

        LockedAmount storage lockedAmount = identifier_to_lockedAmount[lockIdentifier];
        lockedAmount.participant = participant;
        lockedAmount.puppet = channel.puppet;
        lockedAmount.participantAmount = participantLockedAmount;
        lockedAmount.providerAmount = providerLockedAmount;

        uint256 transferToParticipantAmount;
        uint256 transferToProviderAmount;

        int256 providerDeposit;

        if (channel.inAmount >= channel.outAmount) {
            providerDeposit = int256(channel.inAmount - channel.outAmount);
        } else {
            providerDeposit = 0 - int256(channel.outAmount - channel.inAmount);
        }

        providerBalance -= providerDeposit;

        uint256 margin;
        uint256 min;
        (
            margin,
            min
        ) = magicSubstract (
            participantTransferredAmount,
            providerTransferredAmount
        );

        if (min == participantTransferredAmount) {
            require(providerDeposit >= 0, "provider deposit should be positive");
            require(uint256(providerDeposit) >= margin + providerLockedAmount, "provider balance should not be negative");

            transferToProviderAmount = uint256(providerDeposit) - margin - providerLockedAmount;

            require(channel.deposit + margin >= participantLockedAmount, "participant lock amount invalid");
            transferToParticipantAmount = channel.deposit + margin - participantLockedAmount;
        } else {
            require(channel.deposit >= margin + participantLockedAmount, "participant not sufficient funds");
            transferToParticipantAmount = channel.deposit - margin - participantLockedAmount;

            if (providerDeposit >= 0) {
                require(uint256(providerDeposit) + margin >= providerLockedAmount, "provider not sufficient funds");
                transferToProviderAmount = uint256(providerDeposit) + margin - providerLockedAmount;
            } else {
                require(margin >= uint256(0 - providerDeposit), "provider not sufficient funds");
                require(margin - uint256(0 - providerDeposit) >= providerLockedAmount, "provider not sufficient funds");
                transferToProviderAmount = margin - uint256(0 - providerDeposit) - providerLockedAmount;
            }
        }

        delete identifier_to_channel[channelIdentifier];
        delete participant_to_counter[participant];

        if (transferToParticipantAmount > 0) {
            participant.transfer(transferToParticipantAmount);
        }
        if (transferToProviderAmount > 0) {
            providerBalance += transferToProviderAmount;
        }

        emit ChannelSettled (
            channelIdentifier, 
            participant, 
            participantTransferredAmount, 
            providerTransferredAmount,
            lockIdentifier
        );
    }

    function unlock (
        bytes32 lockIdentifier
    )
        public
    {
        LockedAmount storage lockedAmount = identifier_to_lockedAmount[lockIdentifier];
        address participant = lockedAmount.participant;
        address puppet = lockedAmount.puppet;
        uint256 participantLockedAmount = lockedAmount.participantAmount;
        uint256 providerLockedAmount = lockedAmount.providerAmount;

        delete identifier_to_lockedAmount[lockIdentifier];

        bool isGameStateCommitted;
        uint256 transferToParticipantAmount;
        uint256 transferToProviderAmount;

        (
            isGameStateCommitted,
            transferToParticipantAmount,
            transferToProviderAmount
        ) = game.getResult (
            lockIdentifier,
            puppet,
            provider
        );

        if (isGameStateCommitted) {
            if (participantLockedAmount == 0) {
                if (transferToParticipantAmount <= providerLockedAmount) {
                    transferToProviderAmount = providerLockedAmount - transferToParticipantAmount;
                } else {
                    transferToParticipantAmount = providerLockedAmount;
                    transferToProviderAmount = 0;
                }
            } else if (providerLockedAmount == 0) {
                if (transferToProviderAmount <= participantLockedAmount) {
                    transferToParticipantAmount = participantLockedAmount - transferToProviderAmount;
                } else {
                    transferToParticipantAmount = 0;
                    transferToProviderAmount = participantLockedAmount;
                }
            } else {
                require(transferToParticipantAmount + transferToProviderAmount == participantLockedAmount + providerLockedAmount, "invalid result");
            }
        } else {
            transferToParticipantAmount = participantLockedAmount;
            transferToProviderAmount = providerLockedAmount;
        }

        if (transferToParticipantAmount > 0) {
            participant.transfer(transferToParticipantAmount);
        }

        if (transferToProviderAmount > 0) {
            providerBalance += transferToProviderAmount;
        }

        emit ChannelUnlocked (
            lockIdentifier,
            participant,
            transferToParticipantAmount,
            transferToProviderAmount
        );
    }

    function getChannelIdentifier (
        address participant
    ) 
        public
        view
        returns (bytes32)
    {
        require(participant != 0x0, "invalid input");

        uint256 counter = participant_to_counter[participantsHash];

        require(counter != 0, "channel does not exist");

        return keccak256((abi.encodePacked(participantsHash, counter)));
    }

    /**
        Events
     */

    event ChannelOpened (
        address indexed participant,
        address puppet,
        bytes32 channelIdentifier,
        uint256 settleWindow,
        uint256 amount
    );

    event PuppetChanged (
        address participant,
        bytes32 channelIdentifier,
        address puppet
    );

    event ChannelNewDeposit(
        bytes32 indexed channelIdentifier,
        address indexed participant,
        uint256 new_deposit,
        uint256 total_deposit
    );

    event CooperativeSettled (
        bytes32 indexed channelIdentifier,
        address indexed participant, 
        uint256 balance,
        uint256 recycle
    );

    event ChannelClosed (
        bytes32 indexed channelIdentifier,
        address indexed closing,
        bytes32 balanceHash,
        uint256 nonce,
        uint256 inAmount,
        uint256 inNonce,
        uint256 outAmount,
        uint256 outNonce
    );

    event PartnerUpdateProof(
        bytes32 indexed channelIdentifier,
        address indexed participant,
        bytes32 balanceHash,
        uint256 nonce,
        uint256 inAmount,
        uint256 inNonce,
        uint256 outAmount,
        uint256 outNonce        
    );

    event RegulatorUpdateProof (
        bytes32 indexed channelIdentifier,
        uint256 inAmount,
        uint256 inNonce,
        uint256 outAmount,
        uint256 outNonce        
    );

    event ChannelSettled(
        bytes32 indexed channelIdentifier, 
        address indexed participant,
        uint256 transferToParticipantAmount, 
        uint256 transferToProviderAmount,
        bytes32 lockedIdentifier
    );

    event ChannelUnlocked (
        bytes32 indexed lockIdentifier,
        address indexed participant,
        uint256 transferToParticipantAmount, 
        uint256 transferToProviderAmount
    );

    event ProviderDeposit (
        address provider,
        uint256 amount,
        int256 balance
    );

    event ProviderWithdraw (
        uint256 amount,
        int256 balance
    );

    /**
        Internal Methods
     */
    
    function recoverBalanceHash (
        bytes32 channelIdentifier,
        bytes32 balanceHash,
        uint256 nonce,
        bytes signature
    )
        internal
        view
    {
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                address(this),
                channelIdentifier,
                balanceHash,
                nonce
            )
        );
        return ECDSA.recover(messageHash, signature);
    }

    function updateRebalanceProof (
        bytes32 channelIdentifier,
        uint256 inAmount,
        uint256 inNonce,
        bytes regulatorSignature,
        bytes inProviderSignature,
        uint256 outAmount,
        uint256 outNonce,
        bytes participantSignature,
        bytes outProviderSignature
    )
        internal
    {
        Channel storage channel = identifier_to_channel[channelIdentifier];

        if (inNonce > channel.inNonce) {
            bytes32 messageHash = keccak256(
                abi.encodePacked(
                    address(this),
                    channelIdentifier,
                    inAmount,
                    inNonce
                )
            );
            require(ECDSA.recover(messageHash, regulatorSignature) == regulator, "invalid regulator signature");
            require(ECDSA.recover(messageHash, inProviderSignature) == provider, "invalid inProvider signature");
            channel.inAmount = inAmount;
            channel.inNonce = inNonce;
        }

        if (outNonce > channel.outNonce) {
            bytes32 messageHash = keccak256(
                abi.encodePacked(
                    address(this),
                    channelIdentifier,
                    outAmount,
                    outNonce
                )
            );
            require(ECDSA.recover(messageHash, participantSignature) == channel.puppet, "invalid participant signature");
            require(ECDSA.recover(messageHash, outProviderSignature) == provider, "invalid outProvider signature");
            channel.outAmount = outAmount;
            channel.outNonce = outNonce;            
        }
    }

    function verifyBalanceData (
        bytes32 balanceHash,
        uint256 transferredAmount,
        uint256 lockedAmount,
        uint256 nonce
    )
        internal
        pure
    {
        if (balanceHash == 0x0 && transferredAmount == 0x0 && lockedAmount == 0 && nonce == 0) {
            return;
        }

        require(
            keccak256(
                abi.encodePacked(
                    transferredAmount,
                    lockedAmount,
                    nonce
                )
            ) == balanceHash,
            "invalid balance data"
        );
    }

    function settleLockData (
        address participant,
        uint256 participantLockedAmount,
        uint256 participantLockNonce,
        uint256 providerLockedAmount,
        uint256 providerLockNonce
    )
        internal
        returns (bytes32 lockIdentifier, uint256 _participantLockedAmount, uint256 _providerLockedAmount)
    {
        if (participantLockNonce == 0 && providerLockNonce == 0) {
            lockIdentifier = 0x0;
            _participantLockedAmount = 0;
            _providerLockedAmount = 0;
            return;
        }

        bytes32 channelIdentifier = getChannelIdentifier(participant);

        if (participantLockNonce == providerLockNonce) {
            lockIdentifier = keccak256(abi.encodePacked(channelIdentifier, participantLockNonce));
            _participantLockedAmount = participantLockedAmount;
            _providerLockedAmount = providerLockedAmount;
        } else if (participantLockNonce < providerLockNonce) {
            lockIdentifier = keccak256(abi.encodePacked(channelIdentifier, providerLockNonce));
            _participantLockedAmount = 0;
            _providerLockedAmount = providerLockedAmount;
        } else {
            lockIdentifier = keccak256(abi.encodePacked(channelIdentifier, participantLockNonce));
            _providerLockedAmount = 0;
            _participantLockedAmount = participantLockedAmount;
        }
    }

    function magicSubtract(
        uint256 a,
        uint256 b
    )
        internal
        pure
        returns (uint256, uint256)
    {
        return a > b ? (a - b, b) : (b - a, a);
    }
}