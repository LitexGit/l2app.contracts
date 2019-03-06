pragma solidity >=0.4.24 <0.6.0;

import "./lib/ECDSA.sol";

contract OffchainPayment {
    /**
    States
     */

    // payment contract address on ethereum
    address public onchainPayment;
    address public provider;
    address public regulator;

    // tokenAddress => paymentNetwork
    mapping (address => PaymentNetwork) public paymentNetworkMap;
    struct PaymentNetwork {
        // total user number joined in this token network
        uint256 userCount;
        uint256 userTotalDeposit;
        uint256 userTotalWithdraw;
        // amount of token provider deposit in
        uint256 providerDeposit;
        uint256 providerWithdraw;
        uint256 providerRebalanceIn;
        // provider offchain balance
        uint256 providerBalance;
    }

    // channelID => channel
    mapping (bytes32 => Channel) public channelMap;
    struct Channel {
        address user;
        address token; 
        uint256 userDeposit;
        uint256 userWithdraw;
        // participant => balanceProof
        mapping (address => BalanceProof) balanceProofMap;
        // user offchain balance
        uint256 userBalance;
        // provider offchain balance
        uint256 providerBalance;
        // orientation => rebalanceProof, in=true, out=false
        mapping (bool => RebalanceProof) rebalanceProofMap;
        // 0=not exist, 1=open, 2=closing, 3=settled
        uint256 status;
        ClosingChannel closingData;
    }
    // record data committed onchain when closing channel
    struct ClosingChannel {
        address closer;
        uint256 userTransferredAmount;
        uint256 userTransferredNonce;
        uint256 providerTransferredAmount;
        uint256 providerTransferredNonce;
        uint256 providerRebalanceInAmount;
        uint256 providerRebalanceOutAmount;
    }

    struct BalanceProof {
        bytes32 channelID;
        uint256 balance;
        uint256 nonce;
        // hash of data related to transfer
        bytes32 additionalHash;
        bytes signature;
        // for proof guardian
        bytes consignorSignature;
    }

    // user => puppet list
    mapping (address => Puppet[]) public puppets;
    struct Puppet {
        address p;
        bool enabled;
    }

    // id => disable puppet proof
    mapping (bytes32 => DisablePuppetProof) public disablePuppetProofMap;
    struct DisablePuppetProof {
        address user;
        address puppet;
        uint256 lastCommitBlock;
        bytes providerSignature;
        bytes regulatorSignature;
    }

    // id => user withdraw proof
    mapping (bytes32 => UserWithdrawProof) public userWithdrawProofMap;
    struct UserWithdrawProof {
        address user;
        bytes32 channelID;
        // total amount of withdraw
        uint256 amount;
        uint256 lastCommitBlock;
        bytes providerSignature;
        bytes regulatorSignature;
    }

    // id => provider withdraw proof
    mapping (bytes32 => ProviderWithdrawProof) public providerWithdrawProofMap;
    struct ProviderWithdrawProof {
        address token;
        // balance after withdraw
        int256 balance;
        uint256 lastCommitBlock;
        bytes signature;
    }

    // id => rebalance proof
    mapping (bytes32 => RebalanceProof) public rebalanceProofMap;
    struct RebalanceProof {
        // in=true, out=false
        bool orientation;
        bytes32 channelID;
        // total amount of rebalance inOrOut
        uint256 amount;
        uint256 nonce;
        bytes providerSignature;
        bytes partnerSignature;
    }

    // token => feeProof
    mapping (address => FeeProof) public feeProofMap;
    struct FeeProof {
        uint256 amount;
        uint256 nonce;
        bytes signature;
    }

    /**
    Constructor
     */

    constructor (
        address _onchainPayment,
        address _provider,
        address _regulator
    )
        public
    {
        onchainPayment = _onchainPayment;
        provider = _provider;
        regulator = _regulator;
    }

    /**
    Functions
     */

    function transfer (
        address to,
        bytes32 channelID,
        uint256 balance,
        uint256 nonce,
        bytes32 additionalHash,
        bytes memory signature
    )
        public
    {
        Channel storage channel = channelMap[channelID];
        require(channel.status == 1, "channel should be open");
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                onchainPayment,
                channelID,
                balance,
                nonce,
                additionalHash
            )
        );
        address recoveredSignature = ECDSA.recover(messageHash, signature);
        if (msg.sender == provider) {
            BalanceProof storage userBalanceProof = channel.balanceProofMap[to];
            require(userBalanceProof.balance < balance);
            require(userBalanceProof.nonce < nonce);
            require(balance - userBalanceProof.balance <= channel.providerBalance);
            require(recoveredSignature == provider);

            channel.providerBalance -= balance - channel.balanceProofMap[to].balance;
            channel.userBalance += balance - channel.balanceProofMap[to].balance;
            userBalanceProof.balance = balance;
            userBalanceProof.nonce = nonce;
            userBalanceProof.additionalHash = additionalHash;
            userBalanceProof.signature = signature;
        } else {
            BalanceProof storage balanceProof = channel.balanceProofMap[provider];
            require(balanceProof.balance < balance);
            require(balanceProof.nonce < nonce);
            require(balance - balanceProof.balance <= channel.userBalance);
            require(recoveredSignature == channel.user);

            channel.providerBalance += balance - balanceProof.balance;
            channel.userBalance -= balance - balanceProof.balance;
            balanceProof.balance = balance;
            balanceProof.nonce = nonce;
            balanceProof.additionalHash = additionalHash;
            balanceProof.signature = signature;
        }
        emit Transfer (
            msg.sender,
            to,
            channelID,
            balance,
            nonce,
            additionalHash
        );
    }

    function guardBalanceProof (
        bytes32 channelID,
        uint256 balance,
        uint256 nonce,
        bytes32 additionalHash,
        bytes memory signature,
        bytes memory consignorSignature
    )
        public
    {
        Channel storage channel = channelMap[channelID];
        require(msg.sender == channel.user);
        require(channel.status == 1);
        BalanceProof storage balanceProof = channel.balanceProofMap[channel.user];
        require(balanceProof.balance == balance);
        require(balanceProof.nonce == nonce);
        balanceProof.consignorSignature = consignorSignature;
        emit GuardBalanceProof (
            msg.sender,
            channelID,
            balance,
            nonce
        );
    }

    function proposeDisablePuppet (
        address puppet,
        uint256 lastCommitBlock
    )
        public
    {}

    // @param id generated after proposeDisablePuppet
    function confirmDisablePuppet (
        bytes32 id,
        address confirmer,
        bytes memory signature
    )
        public
    {}

    function userProposeWithdraw (
        bytes32 channelID,
        uint256 amount,
        uint256 lastCommitBlock
    )
        public
    {}

    // @param id generated after userProposeWithdraw
    function confirmUserWithdraw (
        bytes32 id,
        address confirmer,
        bytes memory signature
    )
        public
    {}   

    // @param balance balance after withdraw
    function providerProposeWithdraw (
        address token,
        int256 balance,
        uint256 lastCommitBlock
    )
        public
    {}

    // @param id generated after providerProposeWithdraw
    function confirmProviderWithdraw (
        bytes32 id,
        bytes memory signature
    )
        public
    {} 

    // @param amount total withdraw amount
    function rebalance (
        bytes32 channelID,
        uint256 amout,
        uint256 nonce,
        bool inOrOut,
        bytes memory signature
    )
        public
    {}

    // @param id generated after rebalance
    function confirmRebalance (
        bytes32 id,
        address confirmer,
        bytes memory signature
    )
        public
    {}

    function submitFee (
        address token,
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    )
        public
    {}

    // function substituteRebalanceProof (
    //     bytes32 id,
    //     bytes memory signature
    // )
    //     public
    // {}

    function onchainOpenChannel (
        address user,
        address token,
        uint256 settleWindow,
        bytes32 channelID
    ) 
        public
    {}

    function onchainAddPuppet (
        address user,
        address puppet
    ) 
        public
    {}

    function onchainDisablePuppet (
        address user,
        address puppet
    ) 
        public
    {}

    function onchainUserDeposit (
        bytes32 channelID,
        address user,
        uint256 amount
    ) 
        public
    {}

    function onchainProviderDeposit (
        address token,
        uint256 amount
    ) 
        public
    {}

    function onchainUserWithdraw (
        bytes32 channelID,
        uint256 amount,
        uint256 lastCommitBlock
    ) 
        public
    {}

    function onchainProviderWithdraw (
        address token,
        uint256 amount,
        uint256 lastCommitBlock
    ) 
        public
    {}

    function onchainCloseChannel (
        bytes32 channelID,
        address closer
    ) 
        public
    {}

    function onchainPartnerUpdateProof (
        bytes32 channelID
    ) 
        public
    {}

    function onchainRegulatorUpdateProof (
        bytes32 channelID
    ) 
        public
    {}

    function onchainSettleChannel (
        bytes32 channelID,
        uint256 userSettleAmount,
        uint256 providerSettleAmount
    ) 
        public
    {}

    /**
     Events
     */

    event Transfer (
        address indexed from,
        address indexed to,
        bytes32 channelID,
        uint256 balance,
        uint256 nonce,
        bytes32 additionalHash
    );

    event GuardBalanceProof (
        address indexed user,
        bytes32 indexed channelID,
        uint256 balance,
        uint256 nonce
    );

    event ProposeDisablePuppet (
        address indexed user,
        address puppet,
        uint256 lastCommitBlock,
        bytes32 id // generated after proposeDisablePuppet
    );

    event ConfirmdisablePuppet (
        bytes32 indexed id,
        address indexed user,
        address indexed confirmer,
        address puppet,
        uint256 lastCommitBlock
    );

    event UserProposeWithdraw (
        address indexed user,
        bytes32 indexed channelID,
        uint256 amount,
        uint256 lastCommitBlock,
        bytes32 id
    );

    event ConfirmUserWithdraw (
        bytes32 indexed id,
        address indexed user,
        address indexed confirmer,
        uint256 amount,
        uint256 lastCommitBlock        
    );

    event ProviderProposeWithdraw (
        address indexed token,
        int256 balance,
        uint256 lastCommitBlock
    );

    event ConfirmProviderWithdraw (
        bytes32 indexed id,
        address indexed token,
        int256 balance,
        uint256 lastCommitBlock       
    );

    event Rebalance (
        bytes32 channelID,
        uint256 amout,
        uint256 nonce,
        bool inOrOut,
        bytes32 id
    );

    event ConfirmRebalance (
        bytes32 indexed id,
        uint256 amout,
        uint256 nonce,
        bool inOrOut        
    );
}