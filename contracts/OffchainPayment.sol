pragma solidity >=0.4.24 <0.6.0;

import "./lib/ECDSA.sol";
import "./lib/Address.sol";
import "./lib/MultiSignInterface.sol";

contract OffchainPayment {
    /**
    States
     */
    using Address for address;

    // payment contract address on ethereum
    address public onchainPayment;
    address public operator;
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
        int256 providerTotalSettled;
        uint256 onchainFeeWithdraw;
        // provider offchain balance
        uint256 providerBalance;
        // provider onchain balance
        int256 providerOnchainBalance;
    }

    // user => token => channelID
    mapping (address => mapping(address => bytes32)) public channelIDMap;
    // channelID => Channel
    mapping (bytes32 => Channel) public channelMap;
    // channelID => ClosingChannel
    mapping (bytes32 => ClosingChannel) public closingChannelMap;
    // channelID => participant => balanceProof
    mapping (bytes32 => mapping(address => BalanceProof)) public balanceProofMap;
    // channelID => RebalanceProof
    mapping (bytes32 => RebalanceProof) public rebalanceProofMap;
    struct Channel {
        address user;
        address token;
        uint256 userDeposit;
        uint256 userWithdraw;
        // user offchain balance
        uint256 userBalance;
        // provider offchain balance
        uint256 providerBalance;
        // 0=not exist, 1=open, 2=closing, 3=settled, 4=waiting co-settle
        uint256 status;
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

    // channelID => BalanceProof
    mapping (bytes32 => BalanceProof) public arrearBalanceProofMap;
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

    // // id => disable puppet proof
    // mapping (bytes32 => DisablePuppetProof) public disablePuppetProofMap;
    // struct DisablePuppetProof {
    //     address user;
    //     address puppet;
    //     uint256 lastCommitBlock;
    //     bytes providerSignature;
    //     bytes regulatorSignature;
    // }


    // channelID => user withdraw proof
    mapping (bytes32 => UserWithdrawProof) public userWithdrawProofMap;
    struct UserWithdrawProof {
        bool isConfirmed;
        // bytes32 channelID;
        // total amount of withdraw
        uint256 amount;
        uint256 lastCommitBlock;
        bytes providerSignature;
        bytes regulatorSignature;
        address receiver;
    }

    // token => provider withdraw proof
    mapping (address => ProviderWithdrawProof) public providerWithdrawProofMap;
    struct ProviderWithdrawProof {
        // total withdraw
        uint256 amount;
        uint256 lastCommitBlock;
        bytes signature;
    }

    // channelID => cooperative settle proof
    mapping (bytes32 => CooperativeSettleProof) public cooperativeSettleProofMap;
    struct CooperativeSettleProof {
        bool isConfirmed;
        uint256 balance;
        uint256 lastCommitBlock;
        bytes providerSignature;
        bytes regulatorSignature;
    }

    // id => rebalance proof
    mapping (bytes32 => RebalanceProof) public proposeRebalanceProofMap;
    struct RebalanceProof {
        // in=true, out=false
        // bool orientation;
        bytes32 channelID;
        // total amount of rebalance inOrOut
        uint256 amount;
        uint256 nonce;
        bytes providerSignature;
        bytes regulatorSignature;
    }

    // token => feeRate
    mapping (address => uint256) public feeRateMap;

    // token => feeProof
    mapping (address => FeeProof) public feeProofMap;
    struct FeeProof {
        uint256 amount;
        uint256 nonce;
        bytes signature;
    }

    // struct LockedAsset {
    //     bool locked;
    //     //1 = provider's withdraw asset
    //     //2 = user's withdraw asset
    //     uint8 assetType;
    //     uint256 deltaAmount;
    // }


    // id => locked asset
    // mapping (bytes32 => LockedAsset) public lockedAssetMap;

    bytes32 public DOMAIN_SEPERATOR;

    bytes32 public constant TRANSFER_TYPEHASH = keccak256(
        "Transfer(bytes32 channelID,uint256 balance,uint256 nonce,bytes32 additionalHash)"
    );

    bytes32 public constant EIP712DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );



    modifier isOperator (address caller) {
        require(caller == operator, "only operator can call this function");
        _;
    }

    /**
    Constructor
     */

    constructor (
        address _onchainPayment,
        address _provider,
        address _regulator,
        address _operator,
        uint256 _chainID
    )
        public
    {
        onchainPayment = _onchainPayment;
        provider = _provider;
        regulator = _regulator;
        operator = _operator;

        DOMAIN_SEPERATOR =  keccak256(
            abi.encode(
                EIP712DOMAIN_TYPEHASH,
                keccak256("litexlayer2"),
                keccak256("1"),
                _chainID,
                onchainPayment)
        );
    }

    /**
    Functions
     */

    function setFeeRate (
        address token,
        uint256 rate
    )
        public
    {
        require(msg.sender == operator, "invalid sender");
        require(rate < 10000);
        feeRateMap[token] = rate;
    }

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
        uint8 participantIndex = recoverPariticipantFromSignature(
            channelID,
            balance,
            nonce,
            additionalHash,
            channel.user,
            signature
        );

        uint256 transferAmount;
        if (participantIndex == 2) {
            BalanceProof storage userBalanceProof = balanceProofMap[channelID][to];
            require(userBalanceProof.balance < balance, "invalid balance");
            require(userBalanceProof.nonce < nonce, "invalid nonce");
            require(balance - userBalanceProof.balance <= channel.providerBalance, "provider insufficient funds");
            // require(recoveredSignature == provider, "invalid signature");
            transferAmount = balance - userBalanceProof.balance;
            channel.providerBalance -= balance - userBalanceProof.balance;
            channel.userBalance += balance - userBalanceProof.balance;
            userBalanceProof.balance = balance;
            userBalanceProof.nonce = nonce;
            userBalanceProof.additionalHash = additionalHash;
            userBalanceProof.signature = signature;
            emit Transfer (
                provider,
                to,
                channelID,
                balance,
                transferAmount,
                nonce,
                additionalHash
            );
        } else if (participantIndex == 1) {
            BalanceProof storage balanceProof = balanceProofMap[channelID][provider];
            require(balanceProof.balance < balance, "invalid balance");
            require(balanceProof.nonce < nonce, "invalid nonce");
            require(balance - balanceProof.balance <= channel.userBalance, "user insufficient funds");
            // require(recoveredSignature == channel.user, "invalid signature");
            transferAmount = balance - balanceProof.balance;
            if (feeRateMap[channel.token] == 0) {
                channel.providerBalance += transferAmount;
                channel.userBalance -= transferAmount;
                balanceProof.balance = balance;
                balanceProof.nonce = nonce;
                balanceProof.additionalHash = additionalHash;
                balanceProof.signature = signature;
            } else {
                channel.userBalance -= transferAmount;
                arrearBalanceProofMap[channelID] = BalanceProof(channelID, balance, nonce, additionalHash, signature, new bytes(32));
            }
            emit Transfer (
                channel.user,
                to,
                channelID,
                balance,
                transferAmount,
                nonce,
                additionalHash
            );
        } else {
            revert("invalid signature");
        }
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
        require(isPuppet(channel.user, msg.sender), "invalid puppet");
        require(channel.status == 1);
        BalanceProof storage balanceProof = balanceProofMap[channelID][channel.user];
        require(balanceProof.balance == balance, "invalid balance");
        require(balanceProof.nonce == nonce, "invalid nonce");
        balanceProof.consignorSignature = consignorSignature;
        emit GuardBalanceProof (
            msg.sender,
            channelID,
            balanceProof.balance,
            balanceProof.nonce
        );
    }

    function submitFee (
        bytes32 channelID,
        address token,
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    )
        public
    {
        FeeProof storage feeProof = feeProofMap[token];
        Channel storage channel = channelMap[channelID];
        require(token == channel.token);
        require(feeRateMap[token] != 0, "should not submit fee");
        BalanceProof storage balanceProof = balanceProofMap[channelID][provider];
        channel.providerBalance += arrearBalanceProofMap[channelID].balance - balanceProof.balance;
        require(amount == feeProof.amount + feeRateMap[token]*(arrearBalanceProofMap[channelID].balance - balanceProof.balance)/10000, "invalid fee");
        paymentNetworkMap[token].providerBalance -= amount - feeProof.amount;
        //channel.userBalance -= arrearBalanceProofMap[channelID].balance - balanceProof.balance;
        balanceProof.balance = arrearBalanceProofMap[channelID].balance;
        balanceProof.nonce = arrearBalanceProofMap[channelID].nonce;
        balanceProof.additionalHash = arrearBalanceProofMap[channelID].additionalHash;
        balanceProof.signature = arrearBalanceProofMap[channelID].signature;
        require(amount > feeProof.amount);
        require(nonce > feeProof.nonce);
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                onchainPayment,
                token,
                amount,
                nonce
            )
        );
        require(ECDSA.recover(messageHash, signature) == provider);
        feeProof.amount = amount;
        feeProof.nonce = nonce;
        feeProof.signature = signature;
        emit SubmitFee (
            token,
            amount,
            nonce
        );
    }

    // function proposeDisablePuppet (
    //     address puppet,
    //     uint256 lastCommitBlock
    // )
    //     public
    // {

    // }

    // // @param id generated after proposeDisablePuppet
    // function confirmDisablePuppet (
    //     bytes32 id,
    //     address confirmer,
    //     bytes memory signature
    // )
    //     public
    // {}

    function userProposeWithdraw (
        bytes32 channelID,
        uint256 amount,
        address receiver,
        uint256 lastCommitBlock
    )
        public
    {
        Channel storage channel = channelMap[channelID];
        require(channel.status == 1);
        require(isPuppet(channel.user, msg.sender));
        require(cooperativeSettleProofMap[channelID].isConfirmed == false);
        bytes32 id = keccak256(
            abi.encodePacked(
                onchainPayment,
                channelID,
                amount,
                lastCommitBlock
            )
        );
        UserWithdrawProof storage userWithdrawProof = userWithdrawProofMap[channelID];
        require(amount <= channel.userBalance);
        require(userWithdrawProof.lastCommitBlock == 0);
        // userWithdrawProof.channelID = channelID;
        userWithdrawProof.amount = amount + channel.userWithdraw;
        userWithdrawProof.receiver = receiver;
        userWithdrawProof.lastCommitBlock = lastCommitBlock;
        userWithdrawProof.isConfirmed = false;
        userWithdrawProof.providerSignature.length = 0;
        userWithdrawProof.regulatorSignature.length = 0;
        emit UserProposeWithdraw(
            channel.user,
            channelID,
            amount,
            userWithdrawProof.amount,
            receiver,
            lastCommitBlock
        );
    }

    // @param id generated after userProposeWithdraw
    function confirmUserWithdraw (
        bytes32 channelID,
        bytes memory signature
    )
        public
    {
        UserWithdrawProof storage userWithdrawProof = userWithdrawProofMap[channelID];
        require(userWithdrawProof.isConfirmed == false);
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                onchainPayment,
                channelID,
                userWithdrawProof.amount,
                userWithdrawProof.lastCommitBlock
            )
        );
        address signer = ECDSA.recover(messageHash, signature);
        if (signer == provider) {
            userWithdrawProof.providerSignature = signature;
            if (userWithdrawProof.regulatorSignature.length != 0) {
                userWithdrawProof.isConfirmed = true;
            }
        } else if (signer == regulator) {
            userWithdrawProof.regulatorSignature = signature;
            if (userWithdrawProof.providerSignature.length != 0) {
                userWithdrawProof.isConfirmed = true;
            }
        } else {
            revert();
        }
        Channel storage channel = channelMap[channelID];
        if (userWithdrawProof.isConfirmed) {
            // lockedAssetMap[id] = LockedAsset(true, 2, channel.userWithdraw);
            channel.userBalance -= userWithdrawProof.amount - channel.userWithdraw;
        }
        emit ConfirmUserWithdraw (
            channel.user,
            channelID,
            signer,
            userWithdrawProof.amount,
            userWithdrawProof.lastCommitBlock,
            userWithdrawProof.isConfirmed,
            userWithdrawProof.providerSignature,
            userWithdrawProof.regulatorSignature
        );
    }

    function providerProposeWithdraw (
        address token,
        uint256 amount,
        uint256 lastCommitBlock
    )
        public
    {
        require(msg.sender == provider);
        ProviderWithdrawProof storage providerWithdrawProof = providerWithdrawProofMap[token];
        require(amount > paymentNetworkMap[token].providerWithdraw);
        require(amount - paymentNetworkMap[token].providerWithdraw <= paymentNetworkMap[token].providerBalance);
        require(lastCommitBlock > providerWithdrawProof.lastCommitBlock);
        providerWithdrawProof.amount = amount;
        providerWithdrawProof.lastCommitBlock = lastCommitBlock;
        emit ProviderProposeWithdraw (
            token,
            amount,
            lastCommitBlock
        );
    }

    function confirmProviderWithdraw (
        address token,
        bytes memory signature
    )
        public
    {
        ProviderWithdrawProof storage providerWithdrawProof = providerWithdrawProofMap[token];
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                onchainPayment,
                token,
                providerWithdrawProof.amount,
                providerWithdrawProof.lastCommitBlock
            )
        );
        require(ECDSA.recover(messageHash, signature) == regulator);
        providerWithdrawProof.signature = signature;
        emit ConfirmProviderWithdraw (
            token,
            providerWithdrawProof.amount,
            providerWithdrawProof.lastCommitBlock,
            providerWithdrawProof.signature
        );
    }

    function proposeCooperativeSettle (
        bytes32 channelID,
        uint256 balance,
        uint256 lastCommitBlock
    )
        public
    {
        Channel storage channel = channelMap[channelID];
        require(channel.userBalance >= balance, "user insufficient funds");
        require(isPuppet(channel.user, msg.sender));
        require(userWithdrawProofMap[channelID].isConfirmed == false);
        CooperativeSettleProof storage csProof = cooperativeSettleProofMap[channelID];
        require(csProof.isConfirmed == false);
        require(lastCommitBlock > csProof.lastCommitBlock);
        // csProof = CooperativeSettleProof(false, balance, lastCommitBlock, new bytes(0), new bytes(0));
        csProof.isConfirmed = false;
        csProof.balance = balance;
        csProof.lastCommitBlock = lastCommitBlock;
        emit ProposeCooperativeSettle (
            channel.user,
            channelID,
            balance,
            lastCommitBlock
        );
    }

    function confirmCooperativeSettle (
        bytes32 channelID,
        bytes memory signature
    )
        public
    {
        CooperativeSettleProof storage csProof = cooperativeSettleProofMap[channelID];
        require(csProof.isConfirmed == false);
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                onchainPayment,
                channelID,
                csProof.balance,
                csProof.lastCommitBlock
            )
        );
        address signer = ECDSA.recover(messageHash, signature);
        if (signer == provider) {
            csProof.providerSignature = signature;
            if (csProof.regulatorSignature.length != 0) {
                csProof.isConfirmed = true;
            }
        } else if (signer == regulator) {
            csProof.regulatorSignature = signature;
            if (csProof.providerSignature.length != 0) {
                csProof.isConfirmed = true;
            }
        } else {
            revert();
        }
        if (csProof.isConfirmed) {
            channelMap[channelID].status = 4;
        }
        
        emit ConfirmCooperativeSettle (
            channelMap[channelID].user,
            channelID,
            signer,
            csProof.balance,
            csProof.lastCommitBlock,
            csProof.isConfirmed,
            csProof.providerSignature,
            csProof.regulatorSignature
        );
    }

    // @param amount total withdraw amount
    function proposeRebalance (
        bytes32 channelID,
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    )
        public
    {
        RebalanceProof storage rebalanceProof = rebalanceProofMap[channelID];
        require(rebalanceProof.amount < amount, "invalid amount");
        require(rebalanceProof.nonce < nonce, "invalid nonce");
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                onchainPayment,
                keccak256(abi.encodePacked("rebalanceIn")),
                channelID,
                amount,
                nonce
            )
        );
        require(ECDSA.recover(messageHash, signature) == provider, "invalid provider sig");
        RebalanceProof storage proposeRebalanceProof = proposeRebalanceProofMap[messageHash];
        proposeRebalanceProof.channelID = channelID;
        require(amount > proposeRebalanceProof.amount);
        require(amount - proposeRebalanceProof.amount <= paymentNetworkMap[channelMap[channelID].token].providerBalance - feeProofMap[channelMap[channelID].token].amount);
        proposeRebalanceProof.amount = amount;
        proposeRebalanceProof.nonce = nonce;
        proposeRebalanceProof.providerSignature = signature;
        emit ProposeRebalance (
            channelID,
            amount,
            nonce,
            messageHash
        );
    }

    // @param id generated after rebalance
    function confirmRebalance (
        bytes32 id,
        bytes memory signature
    )
        public
    {
        RebalanceProof storage proposeRebalanceProof = proposeRebalanceProofMap[id];
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                onchainPayment,
                keccak256(abi.encodePacked("rebalanceIn")),
                proposeRebalanceProof.channelID,
                proposeRebalanceProof.amount,
                proposeRebalanceProof.nonce
            )
        );
        require(ECDSA.recover(messageHash, signature) == regulator);
        RebalanceProof storage rebalanceProof = rebalanceProofMap[proposeRebalanceProof.channelID];
        Channel storage channel = channelMap[proposeRebalanceProof.channelID];
        paymentNetworkMap[channel.token].providerBalance -= proposeRebalanceProof.amount - rebalanceProof.amount;
        paymentNetworkMap[channel.token].providerRebalanceIn += proposeRebalanceProof.amount - rebalanceProof.amount;
        channel.providerBalance += proposeRebalanceProof.amount - rebalanceProof.amount;
        rebalanceProof.channelID = proposeRebalanceProof.channelID;
        rebalanceProof.amount = proposeRebalanceProof.amount;
        rebalanceProof.nonce = proposeRebalanceProof.nonce;
        rebalanceProof.providerSignature = proposeRebalanceProof.providerSignature;
        rebalanceProof.regulatorSignature = signature;
        
        emit ConfirmRebalance (
            rebalanceProof.channelID,
            id,
            rebalanceProof.amount,
            rebalanceProof.nonce
        );
    }

    // function substituteRebalanceProof (
    //     bytes32 id,
    //     bytes memory signature
    // )
    //     public
    // {}

    function onchainOpenChannel (
        address user,
        address token,
        /* uint256 settleWindow, */
        bytes32 channelID,
        uint256 amount
    )
        isOperator(msg.sender)
        public
    {

        /* require(token.isContract() == true, "invalid token address"); */
        //find channel by getChannelID
        // new a channel struct, add it to mapping

        Channel storage channel = channelMap[channelID];
        require(channel.status == 0, "channel status should be init");

        channel.status = 1;
        channel.user = user;
        channel.token = token;
        channel.userDeposit = amount;
        channel.userWithdraw = 0;
        channel.userBalance = amount;
        channel.providerBalance = 0;

        // modify payment network data

        PaymentNetwork storage paymentNetwork = paymentNetworkMap[token];
        paymentNetwork.userCount = paymentNetwork.userCount + 1;
        paymentNetwork.userTotalDeposit = paymentNetwork.userTotalDeposit + amount;
        channelIDMap[user][token] = channelID;
        emit OnchainOpenChannel (
            user,
            token,
            channelID,
            amount
        );
    }

    function onchainAddPuppet (
        address user,
        address puppet
    )
        isOperator(msg.sender)
        public
    {
        // find puppet
        Puppet[] storage puppetList = puppets[user];

        uint256 i = 0;
        while (i < puppetList.length) {
            if (puppetList[i].p == puppet){
                puppetList[i].enabled = true;
                break;
            }
            i += 1;
        }

        if (i == puppetList.length) {
            puppetList.push(Puppet(puppet, true));
        }

        emit OnchainAddPuppet (
            user,
            puppet
        );
    }

    function onchainDisablePuppet (
        address user,
        address puppet
    )
        isOperator(msg.sender)
        public
    {
        Puppet[] storage puppetList = puppets[user];

        uint256 i = 0;
        while (i < puppetList.length) {
            if (puppetList[i].p == puppet){
                puppetList[i].enabled = false;
                break;
            }
            i += 1;
        }
        emit OnchainDisablePuppet(
            user,
            puppet
        );
    }

    function onchainUserDeposit (
        bytes32 channelID,
        address user,
        uint256 deposit
    )
        isOperator(msg.sender)
        public
    {
        // find channel
        Channel storage channel = channelMap[channelID];
        require(channel.status == 1, "channel should be open");
        require(channel.userDeposit < deposit, "new deposit should greater than old deposit");

        // set channel user Deposit

        uint256 deltaDeposit = deposit - channel.userDeposit;
        channel.userDeposit = deposit;
        channel.userBalance += deltaDeposit;
        // calculate deltaDeposit, add deltaDeposit to paymentNetwork.userTotalDeposit
        PaymentNetwork storage paymentNetwork = paymentNetworkMap[channel.token];
        paymentNetwork.userTotalDeposit = paymentNetwork.userTotalDeposit + deltaDeposit;

        emit OnchainUserDeposit(
            user,
            channelID,
            deltaDeposit,
            deposit 
        );
    }


    function onchainProviderDeposit (
        address token,
        uint256 amount
    )
        isOperator(msg.sender)
        public
    {
        // find payment network
        /* require(token.isContract() == true, "invalid token address"); */

        PaymentNetwork storage paymentNetwork = paymentNetworkMap[token];
        // set provider deposit

        paymentNetwork.providerDeposit = paymentNetwork.providerDeposit + amount;
        paymentNetwork.providerBalance = paymentNetwork.providerBalance + amount;
        paymentNetwork.providerOnchainBalance += int256(amount);

        emit OnchainProviderDeposit (
            token,
            amount
        );
    }

    function onchainUserWithdraw (
        bytes32 channelID,
        uint256 amount,
        uint256 withdraw,
        uint256 lastCommitBlock
    )
        isOperator(msg.sender)
        public
    {
        // find channel

        Channel storage channel = channelMap[channelID];
        require(channel.status == 1, "channel should be open");
        require(channel.userWithdraw <= withdraw, "new withdraw should greater than old withdraw");


        // destroy locked assets
        delete userWithdrawProofMap[channelID];

        PaymentNetwork storage paymentNetwork = paymentNetworkMap[channel.token];
        paymentNetwork.userTotalWithdraw = paymentNetwork.userTotalWithdraw + amount;
        channel.userWithdraw += amount;

        emit OnchainUserWithdraw(
            channel.user,
            channelID,
            amount,
            withdraw,
            lastCommitBlock
        );
    }

    function onchainProviderWithdraw (
        address token,
        uint256 amount,
        int256 balance,
        uint256 lastCommitBlock
    )
        isOperator(msg.sender)
        public
    {
        delete providerWithdrawProofMap[token];

        PaymentNetwork storage paymentNetwork = paymentNetworkMap[token];
        paymentNetwork.providerWithdraw = paymentNetwork.providerWithdraw + amount;
        paymentNetwork.providerBalance = paymentNetwork.providerBalance - amount;
        paymentNetwork.providerOnchainBalance = balance;

        emit OnchainProviderWithdraw(
            token,
            amount,
            balance,
            lastCommitBlock
        );
    }

    function onchainCooperativeSettleChannel(
        bytes32 channelID,
        address user,
        uint256 balance,
        int256 providerRegain,
        uint256 lastCommitBlock
    )
    isOperator(msg.sender)
    public {
        Channel storage channel = channelMap[channelID];
        // require(channel.status == 4, "channel should be waiting for co-close");

        channel.status = 3;

        PaymentNetwork storage paymentNetwork = paymentNetworkMap[channel.token];

        paymentNetwork.userCount -= 1;
        paymentNetwork.userTotalDeposit -= channel.userDeposit;
        paymentNetwork.userTotalWithdraw -= channel.userWithdraw;

        // RebalanceProof memory rebalanceProof = rebalanceProofMap[channelID];
        // uint256 channelTotalAmount = channel.userDeposit + rebalanceProof.amount - channel.userWithdraw;
        // uint256 providerSettleAmount = channelTotalAmount - balance;

        paymentNetwork.providerTotalSettled += providerRegain;
        paymentNetwork.providerBalance += uint256(int256(rebalanceProofMap[channelID].amount) + providerRegain);
        paymentNetwork.providerRebalanceIn -= rebalanceProofMap[channelID].amount;
        paymentNetwork.providerOnchainBalance += providerRegain;
        // paymentNetwork.providerBalance += providerSettleAmount;

        emit OnchainCooperativeSettleChannel(
            user,
            channelID,
            channel.token,
            balance,
            lastCommitBlock
        );
    }

    function onchainCloseChannel (
        bytes32 channelID,
        address closer,
        uint256 balance,
        uint256 nonce,
        uint256 inAmount
    )
        isOperator(msg.sender)
        public
    {
        // find channel
        Channel storage channel = channelMap[channelID];
        // require(channel.status == 1, "channel should be open");

        // set status to close
        channel.status = 2;

        ClosingChannel storage closingData = closingChannelMap[channelID];

        closingData.closer = closer;
        if (closer == channel.user ) {
            closingData.providerTransferredAmount = balance;
            closingData.providerTransferredNonce = nonce;

        } else {
            closingData.userTransferredAmount = balance;
            closingData.userTransferredNonce = nonce;

        }
        closingData.providerRebalanceInAmount = inAmount;

        emit OnchainCloseChannel (
            closer,
            channelID,
            balance,
            nonce,
            inAmount
        );
    }

    function onchainPartnerUpdateProof (
        bytes32 channelID,
        uint256 userBalance,
        uint256 userNonce,
        uint256 providerBalance,
        uint256 providerNonce
    )
        isOperator(msg.sender)
        public
    {
      // find channel
        Channel storage channel = channelMap[channelID];
        require(channel.status == 2, "channel should be close");

        ClosingChannel storage closingData = closingChannelMap[channelID];
        closingData.providerTransferredAmount = providerBalance;
        closingData.providerTransferredNonce = providerNonce;
        closingData.userTransferredAmount = userBalance;
        closingData.userTransferredNonce = userNonce;

        emit OnchainPartnerUpdateProof(
            channelID,
            userBalance,
            userNonce,
            providerBalance,
            providerNonce
        );
    }

    function onchainRegulatorUpdateProof (
        bytes32 channelID,
        uint256 inAmount
    )
        isOperator(msg.sender)
        public
    {
        // find channel
        Channel storage channel = channelMap[channelID];
        require(channel.status == 2, "channel should be close");
        // set status
        ClosingChannel storage closingData = closingChannelMap[channelID];
        closingData.providerRebalanceInAmount = inAmount;

        emit OnchainRegulatorUpdateProof (
            channelID,
            inAmount
        );
    }

    function onchainSettleChannel (
        bytes32 channelID,
        uint256 userSettleAmount,
        int256 providerRegain
    )
        isOperator(msg.sender)
        public
    {
        // find channel
        Channel storage channel = channelMap[channelID];
        require(channel.status == 2, "channel should be close");
        // set status, settled
        channel.status = 3;

        // change channel data && paymentNetwork data
        // check userSettleAmount & providerSettleAmount
        // set paymentNetwork.userCount/userTotalDeposit/userTotalWithdraw/providerBalance/providerRebalanceIn

        PaymentNetwork storage paymentNetwork = paymentNetworkMap[channel.token];

        paymentNetwork.userCount -= 1;
        paymentNetwork.userTotalDeposit -= channel.userDeposit;
        paymentNetwork.userTotalWithdraw -= channel.userWithdraw;

        paymentNetwork.providerTotalSettled += providerRegain;
        paymentNetwork.providerBalance += uint256(int256(rebalanceProofMap[channelID].amount) + providerRegain);
        paymentNetwork.providerRebalanceIn -= rebalanceProofMap[channelID].amount;
        paymentNetwork.providerOnchainBalance += providerRegain;

        emit OnchainSettleChannel(
            channel.user,
            channel.token,
            channelID,
            userSettleAmount,
            providerRegain
        );
    }

    function onchainRegulatorWithdraw(
        address token,
        uint256 amount
    )
        public
        isOperator(msg.sender)
    {
        PaymentNetwork storage paymentNetwork = paymentNetworkMap[token];
        paymentNetwork.onchainFeeWithdraw += amount;
        emit OnchainRegulatorWithdraw(
            token,
            amount
        );
    }


    function setOperator(
        address newOperator
    )
    /* isOperator(msg.sender) */
    public {

        /* require(newOperator.isContract() == true, "invalid contract address"); */
        require(newOperator != operator, "change operator to the same address");

        emit OperatorChanged(
            operator,
            newOperator
            );
        operator = newOperator;

    }

    function unlockUserWithdrawProof(
        bytes32 channelID
    )
    public {

        uint256 ethBlockNumber =  MultiSignInterface(operator).getEthBlockNumber();
        // uint256 ethBlockNumber = 99999;
        UserWithdrawProof storage userWithdrawProof = userWithdrawProofMap[channelID];
        Channel storage channel = channelMap[channelID];

        if(userWithdrawProof.lastCommitBlock > 0 && userWithdrawProof.lastCommitBlock < ethBlockNumber && userWithdrawProof.isConfirmed) {

            channel.userBalance += userWithdrawProof.amount - channel.userWithdraw;
            delete userWithdrawProofMap[channelID];

        }else{
            revert();
        }
        emit UnlockUserWithdrawProof(
            channelID
        );
    }

    // function unlockProviderWithdrawProof(
    //     address token
    // )
    // public {

    //     // uint256 ethBlockNumber =  1;
    //     ProviderWithdrawProof storage providerWithdrawProof = providerWithdrawProofMap[token];
    //     PaymentNetwork storage paymentNetwork = paymentNetworkMap[token];

    //     if(providerWithdrawProof.lastCommitBlock > 0 && providerWithdrawProof.lastCommitBlock < ethBlockNumber ){
    //         paymentNetwork.providerBalance += providerWithdrawProof.balance - paymentNetwork.providerDeposit;
    //         delete providerWithdrawProofMap[token];
    //     } else {
    //         revert();
    //     }

    function unlockCooperativeSettle(
        bytes32 channelID
    )
        public
    {
        // uint256 ethBlockNumber = 9999;
        uint256 ethBlockNumber =  MultiSignInterface(operator).getEthBlockNumber();
        require(cooperativeSettleProofMap[channelID].lastCommitBlock < ethBlockNumber, "invalid block number");

        Channel storage channel = channelMap[channelID];
        require(channel.status == 4, "channel should be waiting for co-close");

        channel.status = 1;
        delete cooperativeSettleProofMap[channelID];

        emit UnlockCooperativeSettle(
            channelID
        );
    }

    function isPuppet(
        address user,
        address puppet
    )
        public
        view
        returns(bool)
    {
        Puppet[] storage puppetList = puppets[user];

        uint256 i = 0;
        while (i < puppetList.length) {
            if (puppetList[i].p == puppet && puppetList[i].enabled){
                return true;
            }
            i += 1;
        }

        if (i == puppetList.length) {
            return false;
        }
    }

    function recoverPariticipantFromSignature(
        bytes32 channelID,
        uint256 balance,
        uint256 nonce,
        bytes32 additionalHash,
        address user,
        bytes memory signature
    )
        private
        view
        returns(uint8)
    {
        bytes32 hash1;
        bytes32 hash2;
        (hash1, hash2) = transferHash(channelID, balance, nonce, additionalHash);

        address recoveredSignature1 = ECDSA.recover(hash1, signature);
        if( recoveredSignature1 == user ){
            return 1;
        }
        if( recoveredSignature1 == provider ){
            return 2;
        }

        address recoveredSignature2 = ECDSA.recover(hash2, signature);
        if( recoveredSignature2 == user ){
            return 1;
        }
        if( recoveredSignature2 == provider ){
            return 2;
        }

        return 0;
    }

    /**
     * @dev Calculate typed hash of given data (compare eth_signTypedData).
     * @return Hash of given data.
     */
    function transferHash(
        bytes32 channelID,
        uint256 balance,
        uint256 nonce,
        bytes32 additionalHash
    )
        private
        view
        returns(bytes32, bytes32)
    {
        bytes32 hash = keccak256(abi.encode(
            TRANSFER_TYPEHASH,
            channelID,
            balance,
            nonce,
            additionalHash
        ));

        bytes32 hash1 = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPERATOR,
            hash
        ));

        bytes32 hash2 = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash1));

        return (hash1, hash2);
    }

    // /**
    //  * @dev Split the given signature of the form rsv in r s v. v is incremented with 27 if
    //  * it is below 2.
    //  * @param _signature Signature to split.
    //  * @return r s v
    //  */
    // function signatureSplit(bytes memory _signature)
    //     private
    //     pure
    //     returns (bytes32 r, bytes32 s, uint8 v)
    // {
    //     require(_signature.length == 65, "inv sig");

    //     assembly {
    //         r := mload(add(_signature, 32))
    //         s := mload(add(_signature, 64))
    //         v := and(mload(add(_signature, 65)), 0xff)
    //     }
    //     if (v < 2) {
    //         v = v + 27;
    //     }
    // }

    // /**
    //  * @dev Check if _sig is valid signature of _hash. Throws if invalid signature.
    //  * @param _hash Hash to check signature of.
    //  * @param _sig Signature of _hash.
    //  */
    // function recover(
    //     bytes32 _hash,
    //     bytes memory _sig
    // )
    //     internal
    //     pure
    //     returns(address)
    // {
    //     (bytes32 r, bytes32 s, uint8 v) = signatureSplit(_sig);
    //     address addressRecover = ecrecover(_hash, v, r, s);
    //     // require(addressRecover == _address, "inv sig");
    //     return addressRecover;
    // }

    // function verifyPuppet(
    //     address user,
    //     address puppet
    // )
    //     public
    //     returns(bool)
    // {

    // }


    // }

    /**
     Events
     */

    event OperatorChanged (
      address indexed oldOperator,
      address indexed newOperator
    );

    event Transfer (
        address indexed from,
        address indexed to,
        bytes32 channelID,
        uint256 balance,
        uint256 transferAmount,
        uint256 nonce,
        bytes32 additionalHash
    );

    event GuardBalanceProof (
        address indexed user,
        bytes32 indexed channelID,
        uint256 balance,
        uint256 nonce
    );

    event SubmitFee (
        address token,
        uint256 amount,
        uint256 nonce
    );

    // event ProposeDisablePuppet (
    //     address indexed user,
    //     address puppet,
    //     uint256 lastCommitBlock,
    //     bytes32 id // generated after proposeDisablePuppet
    // );

    // event ConfirmdisablePuppet (
    //     bytes32 indexed id,
    //     address indexed user,
    //     address indexed confirmer,
    //     address puppet,
    //     uint256 lastCommitBlock
    // );

    event UserProposeWithdraw (
        address indexed user,
        bytes32 indexed channelID,
        uint256 amount,
        uint256 balance,
        address receiver,
        uint256 lastCommitBlock
    );

    event ConfirmUserWithdraw (
        address indexed user,
        bytes32 indexed channelID,
        address confirmer,
        uint256 amount,
        uint256 lastCommitBlock,
        bool isAllConfirmed,
        bytes providerSignature,
        bytes regulatorSignature
    );

    event ProviderProposeWithdraw (
        address indexed token,
        uint256 amount,
        uint256 lastCommitBlock
    );

    event ConfirmProviderWithdraw (
        address indexed token,
        uint256 amount,
        uint256 lastCommitBlock,
        bytes signature
    );

    event ProposeCooperativeSettle (
        address indexed user,
        bytes32 indexed channelID,
        uint256 balance,
        uint256 lastCommitBlock
    );

    event ConfirmCooperativeSettle (
        address indexed user,
        bytes32 indexed channelID,
        address confirmer,
        uint256 balance,
        uint256 lastCommitBlock,
        bool isAllConfirmed,
        bytes providerSignature,
        bytes regulatorSignature
    );

    event ProposeRebalance (
        bytes32 indexed channelID,
        uint256 amount,
        uint256 nonce,
        bytes32 id
    );

    event ConfirmRebalance (
        bytes32 indexed channelID,
        bytes32 indexed id,
        uint256 amount,
        uint256 nonce
    );

    event OnchainOpenChannel (
        address indexed user,
        address indexed token,
        bytes32 channelID,
        uint256 amount
    );

    event OnchainAddPuppet(
        address indexed user,
        address indexed puppet
    );

    event OnchainDisablePuppet (
        address indexed user,
        address indexed puppet
    );

    event OnchainUserDeposit (
        address indexed user,
        bytes32 indexed channelID,
        uint256 deposit,
        uint256 totalDeposit
    );

    event OnchainProviderDeposit (
        address indexed token,
        uint256 amount
    );

    event OnchainUserWithdraw (
        address indexed user,
        bytes32 indexed channelID,
        uint256 amount,
        uint256 withdraw,
        uint256 lastCommitBlock
    );

    event OnchainProviderWithdraw (
        address indexed token,
        uint256 amount,
        int256 balance,
        uint256 lastCommitBlock
    );

    event OnchainCooperativeSettleChannel(
        address indexed user,
        bytes32 channelID,
        address token,
        uint256 balance,
        uint256 lastCommitBlock
    );

    event OnchainCloseChannel (
        address indexed closer,
        bytes32 indexed channelID,
        uint256 balance,
        uint256 nonce,
        uint256 inAmount
    );

    event OnchainPartnerUpdateProof (
        bytes32 indexed channelID,
        uint256 userBalance,
        uint256 userNonce,
        uint256 providerBalance,
        uint256 providerNonce
    );

    event OnchainRegulatorUpdateProof (
        bytes32 indexed channelID,
        uint256 inAmount
    );

    event OnchainSettleChannel (
        address indexed user,
        address indexed token,
        bytes32 indexed channelID,
        uint256 userSettleAmount,
        int256 providerSettleAmount
    );

    event OnchainRegulatorWithdraw (
        address indexed token,
        uint256 amount
    );

    event UnlockUserWithdrawProof (
        bytes32 indexed channelID
    );

    event UnlockCooperativeSettle (
        bytes32 indexed channelID
    );
}
