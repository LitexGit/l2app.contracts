pragma solidity >=0.4.24 <0.6.0;

import "./lib/ECDSA.sol";
import "./lib/ERC20.sol";

contract OnchainPayment {
    using SafeERC20 for ERC20;

    /* States */

    address public regulator;
    address public provider;
    // tokenAddress => providerBalance
    mapping (address => int256) public providerBalanceMap;
    // tokenAddress => providerDeposit
    mapping (address => uint256) public providerDepositMap;
    // tokenAddress => providerWithdraw
    mapping (address => uint256) public providerWithdrawMap;
    // tokenAddress => providerRegain
    mapping (address => int256) public providerRegainMap;
    // tokenAddress => regulatorWithdraw
    mapping (address => uint256) public regulatorWithdrawMap;
    // channel counter
    uint256 public counter;
    // user => tokenAddress => counter
    mapping (address => mapping (address => uint256)) public channelCounterMap;
    // channelID => channel
    mapping (bytes32 => Channel) public channelMap;
    struct Channel {
        // 0 = not-exist or settled
        // 1 = open
        // 2 = close
        uint8 status;
        address user;
        bool isCloser;
        uint256 settleBlock;
        // 0x0 if eth channel
        address token;
        uint256 deposit;
        uint256 withdraw;
        // balance proof
        uint256 userBalance;
        uint256 userNonce;
        uint256 providerBalance;
        uint256 providerNonce;
        // rebalance data
        uint256 inAmount;
        uint256 inNonce;
    }
    uint256 public settleWindowMin;
    uint256 public settleWindowMax;
    // user => puppet => status(0=not exist, 1=enabled, 2=disabled)
    mapping (address => mapping (address => uint8)) public puppetMap;

    // EIP712
    bytes32 public DOMAIN_SEPERATOR;
    bytes32 public constant TRANSFER_TYPEHASH = keccak256(
        "Transfer(bytes32 channelID,uint256 balance,uint256 nonce,bytes32 additionalHash)"
    );
    bytes32 public constant EIP712DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    /* Constructor */

    constructor (
        address _regulator,
        address _provider,
        uint256 _settleWindowMin,
        uint256 _settleWindowMax,
        uint256 _chainID
    )
        public
    {
        require(_settleWindowMin > 0);
        require(_settleWindowMax > _settleWindowMin);
        regulator = _regulator;
        provider = _provider;
        settleWindowMin = _settleWindowMin;
        settleWindowMax = _settleWindowMax;
        DOMAIN_SEPERATOR =  keccak256(
            abi.encode(
                EIP712DOMAIN_TYPEHASH,
                keccak256("litexlayer2"),
                keccak256("1"),
                _chainID,
                address(this))
        );
    }

    // Modifiers

    modifier isChannelOpened (bytes32 channelID) {
        require(channelMap[channelID].status == 1, "channel should be open");
        _;
    }
    modifier isChannelClosed (bytes32 channelID) {
        require(channelMap[channelID].status == 2, "channel should be closed");
        _;
    }
    modifier validSettleWindow (uint256 settleWindow) {
        require(settleWindow <= settleWindowMax && settleWindow >= settleWindowMin, "invalid settleWindow");
        _;
    }
    modifier commitBlockValid (uint256 lastCommitBlock) {
        require(block.number <= lastCommitBlock, "commit block expired");
        _;
    }

    /* Public Functions */

    function openChannel (
        address user,
        address puppet,
        uint256 settleWindow,
        address token,
        uint256 amount
    )
        public
        payable
        validSettleWindow (settleWindow)
    {
        require (channelCounterMap[user][token] == 0, "channel already exists");
        counter += 1;
        channelCounterMap[user][token] = counter;
        bytes32 channelID = getChannelID (user, token);
        Channel storage channel = channelMap[channelID];
        if (msg.sender == provider) {
            require(puppet == address(0x0), "provider should not set puppet");
            channel.status = 1;
            channel.user = user;
            channel.token = token;
            channel.settleBlock = settleWindow;
        } else {
            require(msg.sender == user, "msg.sender should be user");
            if (puppet != address(0x0)) {
                puppetMap[user][puppet] = 1;
            }
            channel.status = 1;
            channel.settleBlock = settleWindow;
            channel.user = user;
            channel.token = token;
            // open eth channel
            if (token == address(0x0)) {
                require(msg.value > 0, "user should deposit eth");
                channel.deposit = msg.value;
            } else { // open token channel
                require(amount > 0, "user should deposit token");
                ERC20(token).safeTransferFrom(user, address(this), amount);
                channel.deposit = amount;
            }
        }
        emit ChannelOpened (
            msg.sender,
            user,
            token,
            puppet,
            channel.deposit,
            settleWindow,
            channelID
        );
    }

    function addPuppet (
        address puppet
    )
        public
    {
        puppetMap[msg.sender][puppet] = 1;
        emit PuppetAdded (
            msg.sender,
            puppet
        );
    }

    function disablePuppet (
        address puppet
    )
        public
    {
        puppetMap[msg.sender][puppet] = 2;
        emit PuppetDisabled (
            msg.sender,
            puppet
        );
    }

    function userDeposit (
        bytes32 channelID,
        uint256 amount
    )
        public
        payable
        isChannelOpened(channelID)
    {
        Channel storage channel = channelMap[channelID];
        if (channel.token == address(0x0)) {
            require(msg.value > 0, "invalid deposit");
            channel.deposit += msg.value;
            emit UserNewDeposit (
                channel.user,
                channelID,
                msg.value,
                channel.deposit
            );
        } else {
            require(amount > 0, "invalid deposit");
            ERC20(channel.token).safeTransferFrom(msg.sender, address(this), amount);
            channel.deposit += amount;
            emit UserNewDeposit (
                channel.user,
                channelID,
                amount,
                channel.deposit
            );
        }
    }

    function providerDeposit (
        address token,
        uint256 amount
    )
        public
        payable
    {
        if (token == address(0x0)) {
            require(msg.value > 0, "invalid deposit");
            providerBalanceMap[token] += int256(msg.value);
            providerDepositMap[token] += msg.value;
            emit ProviderNewDeposit (
                token,
                msg.value,
                providerBalanceMap[token]
            );
        } else {
            require(amount > 0, "invalid deposit");
            ERC20(token).safeTransferFrom(msg.sender, address(this), amount);
            providerBalanceMap[token] += int256(amount);
            providerDepositMap[token] += amount;
            emit ProviderNewDeposit (
                token,
                amount,
                providerBalanceMap[token]
            );
        }
    }

    function userWithdraw (
        bytes32 channelID,
        uint256 withdraw,
        uint256 lastCommitBlock,
        bytes memory providerSignature,
        bytes memory regulatorSignature,
        address receiver
    )
        public
        isChannelOpened(channelID)
        commitBlockValid(lastCommitBlock)
    {
        // bytes32 messageHash = keccak256(
        //     abi.encodePacked(
        //         address(this),
        //         channelID,
        //         withdraw,
        //         lastCommitBlock
        //     )
        // );
        // require(ECDSA.recover(messageHash, providerSignature) == provider, "invalid provider signature");
        // require(ECDSA.recover(messageHash, regulatorSignature) == regulator, "invalid regulator signature");
        // Channel storage channel = channelMap[channelID];
        // require(msg.sender == channel.user, "msg.sender should be user");
        // require(channel.withdraw < withdraw, "invalid withdraw");
        // uint256 amount = withdraw - channel.withdraw;
        // channel.withdraw = withdraw;
        // if (channel.token == address(0x0)) {
        //     address(receiver).transfer(amount);
        // } else {
        //     ERC20(channel.token).safeTransfer(receiver, amount);
        // }
        // emit UserWithdraw (
        //     msg.sender,
        //     channelID,
        //     amount,
        //     withdraw,
        //     lastCommitBlock
        // );
        revert();
    }

    function providerWithdraw (
        address token,
        uint256 amount,
        uint256 lastCommitBlock,
        bytes memory regulatorSignature
    )
        public
        commitBlockValid(lastCommitBlock)
    {
        require(msg.sender == provider, "only provider can trigger");
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                address(this),
                token,
                amount,
                lastCommitBlock
            )
        );
        require(ECDSA.recover(messageHash, regulatorSignature) == regulator, "invaild regulator signature");
        uint256 withdraw = amount - providerWithdrawMap[token];
        providerBalanceMap[token] -= int256(withdraw);
        providerWithdrawMap[token] = amount;
        if (token == address(0x0)) {
            address(provider).transfer(amount);
        } else {
            ERC20(token).safeTransfer(provider, amount);
        }
        require(int256(withdraw) <= providerBalanceMap[token]);
        emit ProviderWithdraw (
            token,
            withdraw,
            providerBalanceMap[token],
            lastCommitBlock
        );
    }

    function regulatorWithdraw (
        address token,
        uint256 withdrawAmount,
        uint256 feeAmount,
        uint256 feeNonce,
        bytes memory signature
    )
        public
    {
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                address(this),
                token,
                feeAmount,
                feeNonce
            )
        );
        require(ECDSA.recover(messageHash, signature) == provider, "invaild provider signature");
        require(regulatorWithdrawMap[token] + withdrawAmount <= feeAmount, "insufficient funds");
        regulatorWithdrawMap[token] += withdrawAmount;
        if (token == address(0x0)) {
            address(regulator).transfer(withdrawAmount);
        } else {
            ERC20(token).safeTransfer(regulator, withdrawAmount);
        }
        providerBalanceMap[token] -= int256(withdrawAmount);
        emit RegulatorWithdraw (
            token,
            withdrawAmount,
            feeAmount,
            feeNonce
        );
    }

    function cooperativeSettle (
        bytes32 channelID,
        uint256 balance,
        uint256 lastCommitBlock,
        bytes memory providerSignature,
        bytes memory regulatorSignature
    )
        public
        commitBlockValid(lastCommitBlock)
    {
        Channel storage channel = channelMap[channelID]; 
        require(channel.status == 1, "channel should be open");
        require(msg.sender == channel.user, "only user can trigger");
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                address(this),
                channelID,
                balance,
                lastCommitBlock
            ) 
        );
        require(ECDSA.recover(messageHash, providerSignature) == provider, "invalid provider signature");
        require(ECDSA.recover(messageHash, regulatorSignature) == regulator, "invalid regulator signature");
        uint256 payout = safeAdd(balance, channel.withdraw);
        if (payout >= channel.deposit) {
            require(int256(payout - channel.deposit) <= providerBalanceMap[channel.token],"insufficient funds of provider");
            providerRegainMap[channel.token] -= int256(payout - channel.deposit);
            providerBalanceMap[channel.token] -= int256(payout - channel.deposit);
        } else {
            providerRegainMap[channel.token] += int256(channel.deposit - payout);
            providerBalanceMap[channel.token] += int256(channel.deposit - payout);
        }    
        address user = channel.user;
        address token = channel.token;
        int256 regain = int256(channel.deposit) - int256(payout);
        delete channelCounterMap[channel.user][channel.token];
        delete channelMap[channelID];  
        if (token == address(0)) {
            address(user).transfer(balance);
        } else {
            ERC20(token).safeTransfer(user, balance);
        }
        emit CooperativeSettled (
            user,
            channelID,
            token, 
            balance,
            regain,
            lastCommitBlock
        );
    }

    function closeChannel (
        bytes32 channelID,
        uint256 balance,
        uint256 nonce,
        bytes32 additionalHash,
        bytes memory partnerSignature,
        uint256 inAmount,
        uint256 inNonce,
        bytes memory regulatorSignature,
        bytes memory providerSignature
    )
        public
    {
        handleBalanceProof (
            channelID,
            balance,
            nonce,
            additionalHash,
            partnerSignature
        );
        updateRebalanceProof (
            channelID,
            inAmount,
            inNonce,
            regulatorSignature,
            providerSignature
        );
        emit ChannelClosed (
            channelID,
            balance,
            nonce,
            inAmount,
            inNonce
        );
    }

    function partnerUpdateProof (
        bytes32 channelID,
        uint256 balance,
        uint256 nonce,
        bytes32 additionalHash,
        bytes memory partnerSignature,
        bytes memory consignorSignature
    )
        public
    {
        Channel storage channel = channelMap[channelID];
        require(channel.status == 2, "channel should be closed");
        require(block.number <= channel.settleBlock, "commit block expired");
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                address(this),
                channelID,
                balance,
                nonce,
                additionalHash,
                partnerSignature
            )
        );
        address recoveredConsignor = ECDSA.recover(messageHash, consignorSignature);
        address recoveredPartner = recoverBalanceSignature (
            channelID,
            balance,
            nonce,
            additionalHash,
            partnerSignature
        );
        if (channel.isCloser) {
            require(recoveredPartner == channel.user, "invalid partner signature");
            require(recoveredConsignor == provider, "invalid consignor signature");
            if (nonce > channel.userNonce) {
                channel.userNonce = nonce;
                channel.userBalance = balance;
            }
        } else {
            require(recoveredPartner == provider, "invalid partner signature");
            require(puppetMap[channel.user][recoveredConsignor] == 1, "invalid consignor signature");
            if (nonce > channel.providerNonce) {
                channel.providerNonce = nonce;
                channel.providerBalance = balance;
            }
        }
        emit PartnerUpdateProof (
            channelID,
            channel.userBalance,
            channel.userNonce,
            channel.providerBalance,
            channel.providerNonce
        );
    }

    function regulatorUpdateProof (
        bytes32 channelID,
        uint256 inAmount,
        uint256 inNonce,
        bytes memory regulatorSignature,
        bytes memory inProviderSignature
    )
        public
        isChannelClosed (channelID)
    {
        Channel storage channel = channelMap[channelID];
        require(block.number <= channel.settleBlock, "commit block expired");
        updateRebalanceProof (
            channelID,
            inAmount,
            inNonce,
            regulatorSignature,
            inProviderSignature
        );
        emit RegulatorUpdateProof (
            channelID,
            channel.inAmount,
            channel.inNonce
        );
    }

    function settleChannel (
        bytes32 channelID
    )
        public
        isChannelClosed(channelID)
    {
        Channel storage channel = channelMap[channelID];
        require(block.number > channel.settleBlock, "settleWindow should be over");
        require(safeAdd(channel.deposit, channel.inAmount) >= channel.withdraw,  "channel balance should be positive");
        providerBalanceMap[channel.token] -= int256(channel.inAmount);
        uint256 userTransferredAmount;
        uint256 providerTransferredAmount;
        uint256 margin;
        uint256 min;
        (
            margin,
            min
        ) = magicSub (
            channel.userBalance,
            channel.providerBalance
        );
        if (min == channel.userBalance) {
            providerTransferredAmount = safeSub(channel.inAmount, margin);
            userTransferredAmount = safeSub(safeAdd(channel.deposit, margin), channel.withdraw);
            providerRegainMap[channel.token] -= int256(margin);
            emit ChannelSettled (
                channel.user,
                channel.token,
                channelID,
                userTransferredAmount,
                0 - int256(margin)
            );
        } else {
            userTransferredAmount = safeSub(channel.deposit, safeAdd(channel.withdraw, margin));
            providerTransferredAmount = safeAdd(channel.inAmount, margin);
            providerRegainMap[channel.token] += int256(margin);
            emit ChannelSettled (
                channel.user,
                channel.token,
                channelID,
                userTransferredAmount,
                int256(margin)
            );
        }
        if (userTransferredAmount > 0) {
            if (channel.token == address(0x0)) {
                address(channel.user).transfer(userTransferredAmount);
            } else {
                ERC20(channel.token).safeTransfer(channel.user, userTransferredAmount);
            }
        }
        if (providerTransferredAmount > 0) {
            providerBalanceMap[channel.token] += int256(providerTransferredAmount);
        }
        delete channelCounterMap[channel.user][channel.token];
        delete channelMap[channelID];
    }

    function getChannelID (
        address user,
        address token
    )
        public
        view
        returns (bytes32)
    {
        require(user != address(0x0), "invalid input");
        uint256 _counter = channelCounterMap[user][token];
        require(_counter != 0, "channel does not exist");
        return keccak256((abi.encodePacked(user, token, _counter)));
    }

    /**
     *  Events
     */

    event ChannelOpened (
        address indexed sender,
        address indexed user,
        address indexed token,
        address puppet,
        uint256 amount,
        uint256 settleWindow,
        bytes32 channelID
    );
    event PuppetAdded (
        address indexed user,
        address puppet
    );
    event PuppetDisabled (
        address indexed user,
        address puppet
    );
    event UserNewDeposit (
        address indexed user,
        bytes32 indexed channelID,
        uint256 newDeposit,
        uint256 totalDeposit
    );
    event ProviderNewDeposit (
        address indexed token,
        uint256 amount,
        int256 balance
    );
    event UserWithdraw (
        address indexed user,
        bytes32 indexed channelID,
        uint256 amount,
        uint256 totalWithdraw,
        uint256 lastCommitBlock
    );
    event ProviderWithdraw (
        address token,
        uint256 amount,
        int256 balance,
        uint256 lastCommitBlock
    );
    event RegulatorWithdraw (
        address token,
        uint256 withdrawAmount,
        uint256 feeAmount,
        uint256 feeNonce
    );
    event CooperativeSettled (
        address indexed user, 
        bytes32 indexed channelID,
        address token,
        uint256 balance,
        int256 providerRegain,
        uint256 lastCommitBlock
    );
    event ChannelClosed (
        bytes32 indexed channelID,
        uint256 balance,
        uint256 nonce,
        uint256 inAmount,
        uint256 inNonce
    );
    event PartnerUpdateProof(
        bytes32 indexed channelID,
        uint256 userBalance,
        uint256 userNonce,
        uint256 providerBalance,
        uint256 providerNonce
    );
    event RegulatorUpdateProof (
        bytes32 indexed channelID,
        uint256 inAmount,
        uint256 inNonce
    );
    event ChannelSettled(
        address indexed user,
        address indexed token,
        bytes32 indexed channelID,
        uint256 transferToUserAmount,
        int256 providerRegain
    );

    /**
     *  Internal Methods
     */

    function transferHash(
        bytes32 channelID,
        uint256 balance,
        uint256 nonce,
        bytes32 additionalHash
    )
        private
        view
        returns(bytes32)
    {
        bytes32 hash = keccak256(
            abi.encode(
                TRANSFER_TYPEHASH,
                channelID,
                balance,
                nonce,
                additionalHash)
        );
        return keccak256(
            abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPERATOR,
            hash)
        );
    }

    function handleBalanceProof (
        bytes32 channelID,
        uint256 balance,
        uint256 nonce,
        bytes32 additionalHash,
        bytes memory partnerSignature
    )
        internal
    {
        Channel storage channel = channelMap[channelID];
        require(channel.status == 1, "channel should be open");
        channel.status = 2;
        channel.settleBlock += uint256(block.number);
        if (nonce == 0 && balance == 0) {
            if (msg.sender == channel.user) {
                channel.isCloser = true;
            }
            return;
        }
        address recoveredPartner = recoverBalanceSignature (
            channelID,
            balance,
            nonce,
            additionalHash,
            partnerSignature
        );
        if (recoveredPartner == channel.user) {
            require(msg.sender == provider, "only provider can trigger");
            if (nonce > 0) {
                channel.userBalance = balance;
                channel.userNonce = nonce;
            }
            channel.isCloser = false;
        } else if (recoveredPartner == provider) {
            require(msg.sender == channel.user, "only user can trigger");
            if (nonce > 0) {
                channel.providerBalance = balance;
                channel.providerNonce = nonce;
            }
            channel.isCloser = true;
        } else {
            revert("invalid partner signature");
        }
    }

    function recoverBalanceSignature (
        bytes32 channelID,
        uint256 balance,
        uint256 nonce,
        bytes32 additionalHash,
        bytes memory signature
    )
        internal
        view
        returns (address)
    {
        bytes32 messageHash = transferHash(
            channelID,
            balance,
            nonce,
            additionalHash
        );
        return ECDSA.recover(messageHash, signature);
    }

    function updateRebalanceProof (
        bytes32 channelID,
        uint256 inAmount,
        uint256 inNonce,
        bytes memory regulatorSignature,
        bytes memory providerSignature
    )
        internal
    {
        Channel storage channel = channelMap[channelID];
        if (inNonce > channel.inNonce) {
            bytes32 inMessageHash = keccak256(
                abi.encodePacked(
                    address(this),
                    keccak256(abi.encodePacked("rebalanceIn")),
                    channelID,
                    inAmount,
                    inNonce
                )
            );
            require(ECDSA.recover(inMessageHash, regulatorSignature) == regulator, "invalid regulator signature");
            require(ECDSA.recover(inMessageHash, providerSignature) == provider, "invalid inProvider signature");
            channel.inAmount = inAmount;
            channel.inNonce = inNonce;
        }
    }

    function magicSub(
        uint256 a,
        uint256 b
    )
        internal
        pure
        returns (uint256, uint256)
    {
        return a > b ? (a - b, b) : (b - a, a);
    }

    function safeSub(
        uint256 a,
        uint256 b
    )
        internal
        pure
        returns (uint256)
    {
        return a > b ? a - b : 0;
    }

    function safeAdd(
        uint256 a,
        uint256 b
    )
        internal
        pure
        returns (uint256)
    {
        uint256 c = a + b;
        require(c >= a);

        return c;
    }
}
