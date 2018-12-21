pragma solidity ^0.4.24;

import "./GameBase.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import "openzeppelin-solidity/contracts/utils/Address.sol";

contract ETHChannel {  
    using Address for address;

    /**
        States
     */
    
    GameBase public game;

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

    mapping (bytes32 => mapping (address => uint256)) identifier_to_lockedAmount;

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

    modifier isChannelClosed (address participant, address partner) {
        bytes32 channelIdentifier = getChannelIdentifier(participant, partner);
        require(channels[channelIdentifier].state == 2, "channel should be closed");
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

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                address(this),
                channelIdentifier,
                participant,
                balance,
                lastCommitBlock
            ) 
        );
        require(ECDSA.recover(messageHash, participantSignature) == participant, "invalid participant signature");
        require(ECDSA.recover(messageHash, providerSignature) == provider, "invalid provider signature");
        require(ECDSA.recover(messageHash, regulatorSignature) == regulator, "invalid regulator signature");

        Channel storage channel = identifier_to_channel[channelIdentifier];

        if (balance >= channel.deposit) {
            providerBalance -= balance - channel.deposit;
        } else {
            providerBalance += channel.deposit - balance;
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

        if (recoveredPartner == participant) {
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
        bytes participantDelegateSignature
    )
        public
    {

        emit NonclosingUpdateBalanceProof (
            channelIdentifier, 
            nonclosing, 
            balanceHash
        );
    }

    function settleChannel (
        address participant1, 
        uint256 participant1TransferredAmount,
        uint256 participant1LockedAmount,
        uint256 participant1LockNonce,
        address participant2,
        uint256 participant2TransferredAmount,
        uint256 participant2LockedAmount,
        uint256 participant2LockNonce
    )
        public
    {
        emit ChannelSettled (
            channelIdentifier, 
            participant1, 
            participant2, 
            lockIdentifier, 
            participant1TransferredAmount, participant2TransferredAmount
        );
    }

    function unlock (
        address participant1,
        address participant2,
        bytes32 lockIdentifier
    )
        public
    {   
        emit ChannelUnlocked (
            lockIdentifier,
            participant1,
            participant2,
            transferredAmount1,
            transferredAmount2
        );
    }

    function getChannelIdentifier (
        address participant, 
        address partner
    ) 
        public
        view
        returns (bytes32)
    {
        require(participant != 0x0 && partner != 0x0 && participant != partner, "invalid input");

        bytes32 participantsHash = getParticipantsHash(participant, partner);
        uint256 counter = participantsHash_to_channelCounter[participantsHash];

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
        bytes32 lockedIdentifier,
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
            require(ECDSA.recover(messageHash, participantSignature) == channel.participant, "invalid participant signature");
            require(ECDSA.recover(messageHash, outProviderSignature) == provider, "invalid outProvider signature");
            channel.outAmount = outAmount;
            channel.outNonce = outNonce;            
        }
    }
}