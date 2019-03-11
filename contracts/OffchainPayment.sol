pragma solidity >=0.4.24 <0.6.0;

import "./lib/ECDSA.sol";
import "./lib/Address.sol";

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
        uint256 providerTotalSettled;
        // provider offchain balance
        uint256 providerBalance;
        // provider onchain balance
        int256 providerOnchainBalance;
    }

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
        // 0=not exist, 1=open, 2=closing, 3=settled
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
        // address token;
        // balance after withdraw
        int256 balance;
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
        address _regulator
    )
        public
    {
        onchainPayment = _onchainPayment;
        provider = _provider;
        regulator = _regulator;
        operator = _regulator;
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
            BalanceProof storage userBalanceProof = balanceProofMap[channelID][to];
            require(userBalanceProof.balance < balance);
            require(userBalanceProof.nonce < nonce);
            require(balance - userBalanceProof.balance <= channel.providerBalance);
            require(recoveredSignature == provider);

            channel.providerBalance -= balance - userBalanceProof.balance;
            channel.userBalance += balance - userBalanceProof.balance;
            userBalanceProof.balance = balance;
            userBalanceProof.nonce = nonce;
            userBalanceProof.additionalHash = additionalHash;
            userBalanceProof.signature = signature;
        } else {
            BalanceProof storage balanceProof = balanceProofMap[channelID][provider];
            require(balanceProof.balance < balance);
            require(balanceProof.nonce < nonce);
            require(balance - balanceProof.balance <= channel.userBalance);
            require(recoveredSignature == channel.user);
            arrearBalanceProofMap[channelID] = BalanceProof(channelID, balance, nonce, additionalHash, signature);
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
        BalanceProof storage balanceProof = balanceProofMap[channelID][channel.user];
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

    function submitFee (
        bytes32 channelID,
        address token,
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    )
        public
    {
        Channel storage channel = channelMap[channelID];
        require(token == channel.token);
        BalanceProof storage balanceProof = balanceProofMap[channelID][provider];
        channel.providerBalance += arrearBalanceProofMap[channelID].balance - balanceProof.balance;
        channel.userBalance -= arrearBalanceProofMap[channelID].balance - balanceProof.balance;
        balanceProof.balance = arrearBalanceProofMap[channelID].balance;
        balanceProof.nonce = arrearBalanceProofMap[channelID].nonce;
        balanceProof.additionalHash = arrearBalanceProofMap[channelID].additionalHash;
        balanceProof.signature = arrearBalanceProofMap[channelID].signature;
        FeeProof storage feeProof = feeProofMap[token];
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
        require(msg.sender == channel.user);
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
        require(userWithdrawProof.lastCommitBlock < lastCommitBlock);
        // userWithdrawProof.channelID = channelID;
        userWithdrawProof.amount = amount + channel.userWithdraw;
        userWithdrawProof.receiver = receiver;
        userWithdrawProof.lastCommitBlock = lastCommitBlock;
        userWithdrawProof.isConfirmed = false;
        userWithdrawProof.providerSignature = bytes(0);
        userWithdrawProof.regulatorSignature = bytes(0);
        emit UserProposeWithdraw(
            channelID,
            channel.user,
            amount,
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
            channelID,
            channel.user,
            signer,
            userWithdrawProof.amount,
            userWithdrawProof.lastCommitBlock,
            userWithdrawProof.isConfirmed
        );
    }

    function providerProposeWithdraw (
        address token,
        int256 balance,
        uint256 lastCommitBlock
    )
        public
    {
        require(msg.sender == provider);
        ProviderWithdrawProof storage providerWithdrawProof = providerWithdrawProofMap[token];
        require(balance < paymentNetworkMap[token].providerOnchainBalance);
        require(uint256(paymentNetworkMap[token].providerOnchainBalance - balance) <= paymentNetworkMap[token].providerBalance);
        require(lastCommitBlock > providerWithdrawProof.lastCommitBlock);
        providerWithdrawProof.balance = balance;
        providerWithdrawProof.lastCommitBlock = lastCommitBlock;
        emit ProviderProposeWithdraw (
            token,
            balance,
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
                providerWithdrawProof.balance,
                providerWithdrawProof.lastCommitBlock
            )
        );
        require(ECDSA.recover(messageHash, signature) == regulator);
        providerWithdrawProof.signature = signature;
        emit ConfirmProviderWithdraw (
            token,
            providerWithdrawProof.balance,
            providerWithdrawProof.lastCommitBlock
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
        require(msg.sender == channel.user);
        require(userWithdrawProofMap[channelID].isConfirmed == false);
        CooperativeSettleProof storage csProof = cooperativeSettleProofMap[channelID];
        require(csProof.isConfirmed == false);
        require(lastCommitBlock > csProof.lastCommitBlock);
        csProof = CooperativeSettleProof(false, balance, lastCommitBlock, bytes(0), bytes(0));
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
        emit ConfirmCooperativeSettle (
            channelID,
            channelMap[channelID].user,
            signer,
            csProof.balance,
            csProof.lastCommitBlock,
            csProof.isConfirmed
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
        require(rebalanceProof.amount < amount);
        require(rebalanceProof.nonce < nonce);
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                onchainPayment,
                channelID,
                amount,
                nonce
            )
        );
        require(ECDSA.recover(messageHash, signature) == provider);
        RebalanceProof storage proposeRebalanceProof = proposeRebalanceProofMap[messageHash];
        proposeRebalanceProof.channelID = channelID;
        require(amount > proposeRebalanceProof.amount);
        require(amount - proposeRebalanceProof.amount <= paymentNetworkMap[channelMap[channelID].token].providerBalance);
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
                proposeRebalanceProof.channelID,
                proposeRebalanceProof.amount,
                proposeRebalanceProof.nonce
            )
        );
        require(ECDSA.recover(messageHash, signature) == regulator);
        RebalanceProof storage rebalanceProof = rebalanceProofMap[proposeRebalanceProof.channelID];
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

        // calculate deltaDeposit, add deltaDeposit to paymentNetwork.userTotalDeposit
        PaymentNetwork storage paymentNetwork = paymentNetworkMap[channel.token];
        paymentNetwork.userTotalDeposit = paymentNetwork.userTotalDeposit + deltaDeposit;

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


    }

    function onchainProviderWithdraw (
        address token,
        uint256 amount,
        uint256 balance,
        uint256 lastCommitBlock
    )
        isOperator(msg.sender)
        public
    {
        delete providerWithdrawProofMap[token];

        /* PaymentNetwork storage paymentNetwork = paymentNetworkMap[token];
        paymentNetwork.providerWithdraw = paymentNetwork.providerWithdraw + amount;
        paymentNetwork.providerBalance = paymentNetwork.providerBalance - amount; */
    }

    function onchainCooperativeSettleChannel(
        bytes32 channelID,
        address user,
        uint256 balance,
        uint256 lastCommitBlock
    )
    isOperator(msg.sender)
    public {
        Channel storage channel = channelMap[channelID];
        require(channel.status == 4, "channel should be waiting for co-close");

        channel.status = 3;

        PaymentNetwork storage paymentNetwork = paymentNetworkMap[channel.token];
        paymentNetwork.userTotalDeposit -= channel.userDeposit;
        paymentNetwork.userTotalWithdraw -= channel.userWithdraw;

        RebalanceProof memory rebalanceProof = rebalanceProofMap[channelID];
        uint256 channelTotalAmount = channel.userDeposit + rebalanceProof.amount - channel.userWithdraw;
        uint256 providerSettleAmount = channelTotalAmount - balance;

        paymentNetwork.providerTotalSettled += providerSettleAmount;
        paymentNetwork.providerBalance += providerSettleAmount;

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
      require(channel.status == 1, "channel should be open");

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

    }

    function onchainSettleChannel (
        bytes32 channelID,
        uint256 userSettleAmount,
        uint256 providerSettleAmount
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
      paymentNetwork.providerTotalSettled += providerSettleAmount;
      paymentNetwork.providerBalance += providerSettleAmount;

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
        uint256 ethBlockNumber =  1;
        UserWithdrawProof storage userWithdrawProof = userWithdrawProofMap[channelID];
        Channel storage channel = channelMap[channelID];

        if(userWithdrawProof.lastCommitBlock > 0 && userWithdrawProof.lastCommitBlock < ethBlockNumber) {

            channel.userBalance += userWithdrawProof.amount - channel.userWithdraw;
            delete userWithdrawProofMap[channelID];

        }else{
          revert();
        }

    }

    function unlockProviderWithdrawProof(
      address token
    )
    public {

        uint256 ethBlockNumber =  1;
        ProviderWithdrawProof storage providerWithdrawProof = providerWithdrawProofMap[token];
        PaymentNetwork storage paymentNetwork = paymentNetworkMap[token];

        if(providerWithdrawProof.lastCommitBlock > 0 && providerWithdrawProof.lastCommitBlock < ethBlockNumber ){
            paymentNetwork.providerBalance += providerWithdrawProof.balance - paymentNetwork.providerDeposit;
            delete providerWithdrawProofMap[token];
        } else {
            revert();
        }



    }

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
        bytes32 indexed channelID,
        address indexed user,
        uint256 amount,
        address receiver,
        uint256 lastCommitBlock
    );

    event ConfirmUserWithdraw (
        bytes32 indexed channelID,
        address indexed user,
        address confirmer,
        uint256 amount,
        uint256 lastCommitBlock,
        bool isAllConfirmed
    );

    event ProviderProposeWithdraw (
        address indexed token,
        int256 balance,
        uint256 lastCommitBlock
    );

    event ConfirmProviderWithdraw (
        address indexed token,
        int256 balance,
        uint256 lastCommitBlock
    );

    event ProposeCooperativeSettle (
        address indexed user,
        bytes32 indexed channelID,
        uint256 balance,
        uint256 lastCommitBlock
    );

    event ConfirmCooperativeSettle (
        bytes32 indexed channelID,
        address indexed user,
        address confirmer,
        uint256 balance,
        uint256 lastCommitBlock,
        bool isAllConfirmed       
    );

    event ProposeRebalance (
        bytes32 indexed channelID,
        uint256 amout,
        uint256 nonce,
        bytes32 id
    );

    event ConfirmRebalance (
        bytes32 indexed channelID,
        bytes32 indexed id,
        uint256 amout,
        uint256 nonce
    );
}
