pragma solidity ^0.4.24;

import "./GameInterface.sol";
import "./ECDSA.sol";
import "./Address.sol";

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
        require(_settleWindowMin > 0);
        require(_settleWindowMax > _settleWindowMin);

        game = GameInterface(_game);
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
        require(identifier_to_channel[channelIdentifier].status == 1, "channel should be open");
        _;
    }

    modifier isChannelClosed (address participant) {
        bytes32 channelIdentifier = getChannelIdentifier(participant);
        require(identifier_to_channel[channelIdentifier].status == 2, "channel should be closed");
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

        counter += 1;
        participant_to_counter[participant] = counter;

        bytes32 channelIdentifier = getChannelIdentifier (participant);
        Channel storage channel = identifier_to_channel[channelIdentifier];
        channel.status = 1;
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
       // isChannelOpened(participant)
    {
        bytes32 channelIdentifier = getChannelIdentifier(participant);
        
        closeChannelSplit (
            participant,
            balanceHash,
            nonce,
            partnerSignature
        );

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
        //isChannelClosed(participant)
    {
        bytes32 channelIdentifier = getChannelIdentifier(participant);
        
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

        partnerUpdateProofSplit (
            participant,
            balanceHash,
            nonce,
            partnerSignature,
            messageHash,
            consignorSignature
        );

        // partnerUpdateProofSplit2 (
        //     participant,
        //     balanceHash,
        //     nonce,
        //     partnerSignature,
        //     recoveredConsignor
        // );

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

        emit PartnerUpdateProof (
            channelIdentifier, 
            participant, 
            identifier_to_channel[channelIdentifier].participantBalanceHash,
            identifier_to_channel[channelIdentifier].participantNonce,
            identifier_to_channel[channelIdentifier].providerBalanceHash,
            identifier_to_channel[channelIdentifier].providerNonce,
            identifier_to_channel[channelIdentifier].inAmount,
            identifier_to_channel[channelIdentifier].inNonce,
            identifier_to_channel[channelIdentifier].outAmount,
            identifier_to_channel[channelIdentifier].outNonce
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

        emit RegulatorUpdateProof (
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
        uint256 participantLastCommitBlock,
        uint256 providerTransferredAmount,
        uint256 providerLockedAmount,
        uint256 providerLockNonce,
        uint256 providerLastCommitBlock
    )
        public
  //      isChannelClosed(participant)
    {
        bytes32 channelIdentifier = getChannelIdentifier(participant);
        Channel storage channel = identifier_to_channel[channelIdentifier];

        require(block.number > channel.settleBlock, "settleWindow should be over");

        verifyBalanceData (
            channel.participantBalanceHash,
            participantTransferredAmount,
            participantLockedAmount,
            participantLockNonce,
            participantLastCommitBlock
        );

        verifyBalanceData (
            channel.providerBalanceHash,
            providerTransferredAmount,
            providerLockedAmount,
            providerLockNonce,
            providerLastCommitBlock           
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
            participantLastCommitBlock,
            providerLockedAmount,
            providerLockNonce,
            providerLastCommitBlock
        );

        require(channel.deposit + channel.inAmount - channel.outAmount >= 0, "channel balance should be positive");
        require(channel.deposit + channel.inAmount - channel.outAmount >= participantLockedAmount + providerLockedAmount, "channel balance should be greater than locked amount");

        if (lockIdentifier !=  0x0) {
            LockedAmount storage lockedAmount = identifier_to_lockedAmount[lockIdentifier];
            lockedAmount.participant = participant;
            lockedAmount.puppet = channel.puppet;
            lockedAmount.participantAmount = participantLockedAmount;
            lockedAmount.providerAmount = providerLockedAmount;
        }

       // uint256 transferToParticipantAmount;
       // uint256 transferToProviderAmount;

        int256 providerDeposit;

        if (channel.inAmount >= channel.outAmount) {
            providerDeposit = int256(channel.inAmount - channel.outAmount);
        } else {
            providerDeposit = 0 - int256(channel.outAmount - channel.inAmount);
        }

        providerBalance -= providerDeposit;

        //uint256 participantLockNonce;
        //uint256 providerLockNonce;
        (
            participantLockNonce,
            providerLockNonce
        ) = magicSubtract (
            participantTransferredAmount,
            providerTransferredAmount
        );

        if (providerLockNonce == participantTransferredAmount) {
            require(providerDeposit >= 0, "provider deposit should be positive");
            require(uint256(providerDeposit) >= participantLockNonce + providerLockedAmount, "provider balance should not be negative");

            providerTransferredAmount = uint256(providerDeposit) - participantLockNonce - providerLockedAmount;

            require(channel.deposit + participantLockNonce >= participantLockedAmount, "participant lock amount invalid");
            participantTransferredAmount = channel.deposit + participantLockNonce - participantLockedAmount;
        } else {
            require(channel.deposit >= participantLockNonce + participantLockedAmount, "participant not sufficient funds");
            participantTransferredAmount = channel.deposit - participantLockNonce - participantLockedAmount;

            if (providerDeposit >= 0) {
                require(uint256(providerDeposit) + participantLockNonce >= providerLockedAmount, "provider not sufficient funds");
                providerTransferredAmount = uint256(providerDeposit) + participantLockNonce - providerLockedAmount;
            } else {
                require(participantLockNonce >= uint256(0 - providerDeposit), "provider not sufficient funds");
                require(participantLockNonce - uint256(0 - providerDeposit) >= providerLockedAmount, "provider not sufficient funds");
                providerTransferredAmount = participantLockNonce - uint256(0 - providerDeposit) - providerLockedAmount;
            }
        }

        delete identifier_to_channel[channelIdentifier];
        delete participant_to_counter[participant];

        if (participantTransferredAmount > 0) {
            participant.transfer(participantTransferredAmount);
        }
        if (providerTransferredAmount > 0) {
            providerBalance += int256(providerTransferredAmount);
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
            providerBalance += int256(transferToProviderAmount);
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

        uint256 _counter = participant_to_counter[participant];

        require(_counter != 0, "channel does not exist");

        return keccak256((abi.encodePacked(participant, _counter)));
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
        bytes32 channelIdentifier,
        address participant,
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
        uint256 balance
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
        bytes32 participantBalanceHash,
        uint256 participantNonce,
        bytes32 providerBalanceHash,
        uint256 providerNonce,
        uint256 inAmount,
        uint256 inNonce,
        uint256 outAmount,
        uint256 outNonce        
    );

    event RegulatorUpdateProof (
        bytes32 indexed channelIdentifier,
        address indexed participant,
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

    function closeChannelSplit (
        address participant,
        bytes32 balanceHash, 
        uint256 nonce, 
        bytes partnerSignature
    )
        internal 
    {
        bytes32 channelIdentifier = getChannelIdentifier(participant);
        Channel storage channel = identifier_to_channel[channelIdentifier];

        require(channel.status == 1, "channel should be open");

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

        channel.status = 2;
        channel.settleBlock += uint256(block.number);
    }
    
    function recoverBalanceSignature (
        bytes32 channelIdentifier,
        bytes32 balanceHash,
        uint256 nonce,
        bytes signature
    )
        internal
        view
        returns (address)
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

    // function partnerUpdateProofSplit1 (
    //     address participant,
    //     bytes32 balanceHash, 
    //     uint256 nonce, 
    //     bytes partnerSignature,
    //     uint256 inAmount,
    //     uint256 inNonce,
    //     bytes regulatorSignature,
    //     bytes inProviderSignature,
    //     uint256 outAmount,
    //     uint256 outNonce,
    //     bytes participantSignature,
    //     bytes outProviderSignature,
    //     bytes consignorSignature
    // )
    //     internal
    //     returns (address)
    // {
    //     bytes32 channelIdentifier = getChannelIdentifier(participant);
    //     // bytes32 messageHash = keccak256(
    //     //     abi.encodePacked(
    //     //         address(this),
    //     //         channelIdentifier,
    //     //         balanceHash,
    //     //         nonce,
    //     //         partnerSignature,
    //     //         inAmount,
    //     //         inNonce,
    //     //         regulatorSignature,
    //     //         inProviderSignature,
    //     //         outAmount,
    //     //         outNonce,
    //     //         participantSignature,
    //     //         outProviderSignature
    //     //     )
    //     // );

    //     return ECDSA.recover(keccak256(
    //             abi.encodePacked(
    //                 address(this),
    //                 channelIdentifier,
    //                 balanceHash,
    //                 nonce,
    //                 partnerSignature,
    //                 inAmount,
    //                 inNonce,
    //                 regulatorSignature,
    //                 inProviderSignature,
    //                 outAmount,
    //                 outNonce,
    //                 participantSignature,
    //                 outProviderSignature
    //             )
    //         ), consignorSignature);

    // }

    function partnerUpdateProofSplit (
        address participant,
        bytes32 balanceHash,
        uint256 nonce,
        bytes partnerSignature,
        bytes32 messageHash,
        bytes consignorSignature
    )
        internal
    {
        address recoveredConsignor = ECDSA.recover(messageHash, consignorSignature);
        
        bytes32 channelIdentifier = getChannelIdentifier(participant);
        Channel storage channel = identifier_to_channel[channelIdentifier];

        require(channel.status == 2, "channel should be closed");

        require(block.number <= channel.settleBlock, "commit block expired");

        address recoveredPartner = recoverBalanceSignature (
            channelIdentifier,
            balanceHash,
            nonce,
            partnerSignature
        );

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
            bytes32 inMessageHash = keccak256(
                abi.encodePacked(
                    address(this),
                    channelIdentifier,
                    inAmount,
                    inNonce
                )
            );
            require(ECDSA.recover(inMessageHash, regulatorSignature) == regulator, "invalid regulator signature");
            require(ECDSA.recover(inMessageHash, inProviderSignature) == provider, "invalid inProvider signature");
            channel.inAmount = inAmount;
            channel.inNonce = inNonce;
        }

        if (outNonce > channel.outNonce) {
            bytes32 outMessageHash = keccak256(
                abi.encodePacked(
                    address(this),
                    channelIdentifier,
                    outAmount,
                    outNonce
                )
            );
            require(ECDSA.recover(outMessageHash, participantSignature) == channel.puppet, "invalid participant signature");
            require(ECDSA.recover(outMessageHash, outProviderSignature) == provider, "invalid outProvider signature");
            channel.outAmount = outAmount;
            channel.outNonce = outNonce;            
        }
    }

    function verifyBalanceData (
        bytes32 balanceHash,
        uint256 transferredAmount,
        uint256 lockedAmount,
        uint256 nonce,        
        uint256 lastCommitBlock
    )
        internal
        pure
    {
        if (balanceHash == 0x0 && transferredAmount == 0x0 && lockedAmount == 0 && nonce == 0 && lastCommitBlock == 0x0) {
            return;
        }

        require(
            keccak256(
                abi.encodePacked(
                    transferredAmount,
                    lockedAmount,
                    nonce,
                    lastCommitBlock
                )
            ) == balanceHash,
            "invalid balance data"
        );
    }

    function settleLockData (
        address participant,
        uint256 participantLockedAmount,
        uint256 participantLockNonce,
        uint256 participantLastCommitBlock,
        uint256 providerLockedAmount,
        uint256 providerLockNonce,
        uint256 providerLastCommitBlock
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

        if (block.number > participantLastCommitBlock) {
            _participantLockedAmount = 0;
        }
        if (block.number > providerLastCommitBlock) {
            _providerLockedAmount = 0;
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