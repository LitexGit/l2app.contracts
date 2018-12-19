pragma solidity ^0.4.24;

interface ETHChannel {
    function openChannel (
        address participant,
        address partner,
        address puppet,
        uint256 settleWindow
    )
        public
        payable
    {
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
        bytes signature
    )
        public
    {
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
    {
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
        view
        public
        returns (bytes32)
    {
        require(participant != 0x0 && partner != 0x0 && participant != partner, "invalid input");

        bytes32 participantsHash = getParticipantsHash(participant, partner);
        uint256 counter = participantsHash_to_channelCounter[participantsHash];
        return keccak256((abi.encodePacked(participantsHash, counter)));
    }

    /**
        Events
     */

    event ChannelOpened (
        address indexed participant1,
        address indexed participant2,
        address puppet,
        bytes32 channelIdentifier,
        uint256 settle_timeout,
        uint256 amount
    );

    event PuppetChanged (
        address participant,
        address partner,
        bytes32 channelIdentifier,
        address puppet
    );

    event ChannelNewDeposit(
        bytes32 indexed channel_identifier,
        address indexed participant,
        uint256 new_deposit,
        uint256 total_deposit
    );

    event ChannelWithdraw (
        bytes32 indexed channel_identifier,
        address indexed participant,
        address indexed partner,
        uint256 amount,
        uint256 deposit
    );

    event CooperativeSettled (
        bytes32 indexed channelIdentifier,
        address indexed participant1_address, 
        address indexed participant2_address,
        uint256 participant1_balance,
        uint256 participant2_balance
    );

    event ChannelClosed(
        bytes32 indexed channel_identifier,
        address indexed closing,
        bytes32 balanceHash
    );

    event NonclosingUpdateBalanceProof(
        bytes32 indexed channel_identifier,
        address indexed nonclosing,
        bytes32 balanceHash
    );

    event ChannelSettled(
        bytes32 indexed channelIdentifier, 
        address indexed participant1,
        address indexed participant2,
        bytes32 lockedIdentifier,
        uint256 transferToParticipant1Amount, 
        uint256 transferToParticipant2Amount
    );

    event ChannelUnlocked (
        bytes32 indexed lockIdentifier,
        address indexed participant1,
        address indexed participant2,
        uint256 transferAmount1, 
        uint256 transferAmount2
    );

    /**
        Externel Methods
     */

    function getParticipantInfo(
        bytes32 channelIdentifier,
        address participant
    )
        view
        external
        returns (address puppet, uint256 deposit, bool isCloser, bytes32 balanceHash, uint256 nonce)
    {
        Channel storage channel = channels[channelIdentifier];
        Participant storage participantStruct = channel.participants[participant];
        puppet = participantStruct.puppet;
        deposit = participantStruct.deposit;
        isCloser = participantStruct.isCloser;
        balanceHash = participantStruct.balanceHash;
        nonce = participantStruct.nonce;
    }
}