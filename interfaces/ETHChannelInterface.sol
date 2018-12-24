pragma solidity ^0.4.24;

interface ETHChannel {
    function openChannel (
        address participant,
        address puppet,
        uint256 settleWindow
    )
        public
        payable
    {
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
    {
        emit PuppetChanged (
            msg.sender,
            channelIdentifier,
            puppet
        );
    }

    function setTotalDeposit (
        address participant
    )
        public
        payable
    {
        emit ChannelNewDeposit (
            participant,
            channelIdentifier,
            msg.value,
            participant.deposit
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
    {
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
    {
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
    {
        emit partnerUpdateProof (
            channelIdentifier, 
            participant, 
            balanceHash,
            nonce,
            inAmount,
            inNonce,
            outAmount,
            outNonce
        );
    }

    function regulatorUpdateProof (
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
        public
    {
        emit regulatorUpdateProof (
            channelIdentifier,
            inAmount,
            inNonce,
            outAmount,
            outNonce
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
    {
        emit ChannelSettled (
            channelIdentifier, 
            participant, 
            participantTransferredAmount, 
            providerTransferredAmount,
            lockIdentifier
        );
    }

    function unlock (
        address participant,
        bytes32 lockIdentifier
    )
        public
    {   
        emit ChannelUnlocked (
            lockIdentifier,
            participant,
            participantTransferredAmount, 
            providerTransferredAmount
        );
    }

    function providerDeposit ()
        public
        payable
    {
        emit ProviderDeposit (
            provider,
            msg.value,
            providerDeposit
        );
    }

    function providerWithdraw (
        int256 balance,
        uint256 lastCommitBlock,
        bytes providerSignature,
        bytes regulatorSignature
    )
        public
    {
        emit ProviderWithdraw (
            amount,
            balance
        );
    }

    function getChannelIdentifier (
        address participant
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
}