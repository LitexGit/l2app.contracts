pragma solidity ^0.4.24;

import "./GameBase.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";

contract ETHChannel {  
    /**
        States
     */
    
    address public regulator;

    address public provider;

    int256 public providerDeposit;

    GameBase public game;

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

    uint256 public channelCounter;

    mapping (address => uint256) public participant_to_channelCounter;

    mapping (bytes32 => Channel) public identifier_to_channel;

    mapping (bytes32 => mapping (address => uint256)) identifier_to_lockedAmount;

    /**
        Constructor
     */

    constructor (
        address _game,
        uint256 _settleWindowMin,
        uint256 _settleWindowMax
    )
        public
    {
        game = GameBase(_game);
        settleWindowMin = _settleWindowMin;
        settleWindowMax = _settleWindowMax;
    }

    /**
        Modifiers
     */

    modifier isChannelOpened (address participant, address partner) {
        bytes32 channelIdentifier = getChannelIdentifier(participant, partner);
        require(channels[channelIdentifier].state == 1, "channel should be open");
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

    /**
        Externel Methods
     */

    function getParticipantProfile(
        bytes32 channelIdentifier,
        address participant
    )
        external
        view
        returns (address puppet, uint256 deposit, uint256 withdraw, bool isCloser, bytes32 balanceHash, uint256 nonce)
    {
        Channel storage channel = identifier_to_channel[channelIdentifier];
        Participant storage participantProfile = channel.participants[participant];
        puppet = participantProfile.puppet;
        deposit = participantProfile.deposit;
        withdraw = participantProfile.withdraw;
        isCloser = participantProfile.isCloser;
        balanceHash = participantProfile.balanceHash;
        nonce = participantProfile.nonce;
    }
    
    /**
        Public Methods
     */

    function openChannel (
        address participant,
        address partner,
        address puppet,
        uint256 settleWindow
    )
        public
        payable
        settleWindowValid (settleWindow)
    {
        bytes32 participantsHash = getParticipantsHash (participant, partner);
        require (participantsHash_to_channelCounter[participantsHash] == 0, "channel already exists");

        require (msg.value > 0, "should deposit when open channel");

        channelCounter += 1;
        participantsHash_to_channelCounter[participantsHash] = channelCounter;

        bytes32 channelIdentifier = getChannelIdentifier (participant, partner);
        identifier_to_channel[channelIdentifier].state = 1;
        identifier_to_channel[channelIdentifier].settleBlock = settleWindow;

        Participant storage participantProfile = identifier_to_channel[channelIdentifier].participants[participant];
        participantProfile.deposit = msg.value;
        participantProfile.puppet = puppet;

        emit ChannelOpened (
            participant,
            partner,
            puppet,
            channelIdentifier,
            msg.value,
            settleWindow
        );
    }

    function setPuppet (
        address partner,
        address puppet,
        uint256 lastCommitBlock,
        bytes signature
    )
        public
        isChannelOpened (msg.sender, partner)
    {
        require (block.number <= lastCommitBlock, "commit expired");

        bytes32 channelIdentifier = getChannelIdentifier (msg.sender, partner);
        Participant storage participantProfile = identifier_to_channel[channelIdentifier].participants[msg.sender];
        require (participantProfile.puppet != puppet, "new puppet should be different from old one");

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                chainID,
                address(this),
                channelIdentifier,
                puppet,
                lastCommitBlock
            )
        );
        require(ECDSA.recover(messageHash, signature) == partner, "invalid signature");

        participantProfile.puppet = puppet;

        emit PuppetChanged (
            msg.sender,
            partner,
            channelIdentifier,
            puppet
        );
    }

    function setTotalDeposit (
        address participant,
        address partner
    )
        public
        payable
        isChannelOpened(participant, partner)
    {
        bytes32 channelIdentifier = getChannelIdentifier(participant, partner);
        Participant storage participantProfile = identifier_to_channel[channelIdentifier].participants[participant];
        participantProfile.deposit += msg.value;

        emit ChannelNewDeposit (
            channelIdentifier,
            participant,
            msg.value,
            participant.deposit
        );
    }

    function setTotalWithdraw (
        address participant,
        address partner,
        uint256 amount,
        bytes participantSignature,
        bytes partnerSignature
    )
        public
        payable
    {
        emit ChannelWithdraw (
            channelIdentifier,
            participant,
            amount,
            participant.deposit
        );
    }

    function cooperativeSettle (
        address participant1Address,
        uint256 participant1Balance,
        address participant2Address,
        uint256 participant2Balance,
        bytes participant1Signature,
        bytes participant2Signature
    )
        public
    {
        bytes32 channelIdentifier = getChannelIdentifier(participant1Address, participant2Address);

        address recoveredAddress = recoverAddressFromCooperativeSettleSignature(
            channelIdentifier, 
            participant1Address, 
            participant1Balance, 
            participant2Address, 
            participant2Balance, 
            participant1Signature
        );
        require(recoveredAddress == participant1Address, "signature should be signed by participant1");

        recoveredAddress = recoverAddressFromCooperativeSettleSignature(
            channelIdentifier, 
            participant1Address, 
            participant1Balance, 
            participant2Address, 
            participant2Balance, 
            participant2Signature
        );
        require(recoveredAddress == participant2Address, "signature should be signed by participant2");

        Channel storage channel = identifier_to_channel[channelIdentifier];

        uint256 totalDeposit = channel.participants[participant1Address].deposit + channel.participants[participant2_address].deposit;
        require(
            totalDeposit == safeAddition(participant1_balance, participant2_balance), 
            "the sum of balances should be equal to the total deposit"
        );

        delete channel.participants[participant1_address];
        delete channel.participants[participant2_address];
        delete channels[channelIdentifier];
        delete participantsHash_to_channelCounter[getParticipantsHash(participant1_address, participant2_address)];

        if (participant1_balance > 0) {
            participant1_address.transfer(participant1_balance);
        }

        if (participant2_balance > 0) {
            participant2_address.transfer(participant2_balance);
        }
        
        emit CooperativeSettled(channelIdentifier, participant1_address, participant2_address, participant1_balance, participant2_balance);



        emit CooperativeSettled (
            channelIdentifier, 
            participant1Address, 
            participant2Address, 
            participant1Balance, 
            participant2Balance
        );
    }

    function closeChannel (
        address partner, 
        bytes32 balanceHash, 
        uint256 nonce, 
        bytes signature
    )
        public
    {
        emit ChannelClosed (
            channelIdentifier, 
            msg.sender, 
            balanceHash
        );
    }
     
    function nonclosingUpdateBalanceProof (
        address nonclosing,
        address closing, 
        bytes32 balanceHash, 
        uint256 nonce, 
        bytes closingSignature,
        bytes nonclosingSignature
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
    )

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
    
    function getParticipantsHash(
        address participant,
        address partner
    )
        internal
        pure
        returns (bytes32)
    {
        require(participant != 0x0 && partner != 0x0 && participant != partner, "invalid input");

        if (participant < partner) {
            return keccak256(abi.encodePacked(participant, partner));
        } else {
            return keccak256(abi.encodePacked(partner, participant));
        }
    }
}