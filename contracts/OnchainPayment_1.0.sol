pragma solidity >=0.4.24 <0.6.0;

import "./lib/ECDSA.sol";
import "./lib/ERC20.sol";

contract OnchainPayment {
    using SafeERC20 for ERC20;

    /**
    States
     */

    string public constant version = "1.0.0";
    address public regulator;
    address public provider;
    // tokenAddress => providerBalance
    mapping (address => int256) public providerBalance;
    // tokenAddress => regulatorWithdraw
    mapping (address => uint256) public regulatorWithdrawMap;

    // user => puppet => status(0=not exist, 1=enabled, 2=disabled)
    mapping (address => mapping (address => uint8)) public puppetMap;

    // channel counter
    uint256 public counter;
    // user => tokenAddress => counter
    mapping (address => mapping (address => uint256)) public channelCounter;
    // channelID => channel
    mapping (bytes32 => Channel) public channels;

    struct Channel {
        // 0 = not-exist or settled
        // 1 = open
        // 2 = close
        uint8 status;
        address user;
        bool isCloser;
        uint256 settleBlock;

        // // 0 = eth
        // // 1 = erc20
        // uint8 tokenType;

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
        // uint256 outAmount;
        // uint256 outNonce;
    }

    uint256 public settleWindowMin;
    uint256 public settleWindowMax;

    // proxy data
    bool internal initialized;
    mapping(bytes32 => uint256) internal uintStorage;
    mapping(bytes32 => int256) internal intStorage;
    mapping(bytes32 => bool) internal boolStorage;
    mapping(bytes32 => address) internal addressStorage;
    mapping(bytes32 => string) internal stringStorage;
    mapping(bytes32 => bytes) internal bytesStorage;

    /**
    Initializer
     */

    function initializer (
        address _regulator,
        address _provider,
        uint256 _settleWindowMin,
        uint256 _settleWindowMax
    )
        public
    {
        require(!initialized, "only initialize once");
        require(_settleWindowMin > 0, "invalid settle window min");
        require(_settleWindowMax > _settleWindowMin, "invalid settle window max");

        regulator = _regulator;
        provider = _provider;
        settleWindowMin = _settleWindowMin;
        settleWindowMax = _settleWindowMax;

        initialized = true;
    }

    // /**
    //     Constructor
    //  */

    // constructor (
    //     address _regulator,
    //     address _provider,
    //     uint256 _settleWindowMin,
    //     uint256 _settleWindowMax
    // )
    //     public
    // {
    //     require(_settleWindowMin > 0);
    //     require(_settleWindowMax > _settleWindowMin);

    //     regulator = _regulator;
    //     provider = _provider;
    //     settleWindowMin = _settleWindowMin;
    //     settleWindowMax = _settleWindowMax;
    // }

    /**
    Modifiers
     */

    modifier isChannelOpened (bytes32 channelID) {
        require(channels[channelID].status == 1, "channel should be open");
        _;
    }

    modifier isChannelClosed (bytes32 channelID) {
        require(channels[channelID].status == 2, "channel should be closed");
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

    /**
    Public Functions
     */

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
        require (channelCounter[user][token] == 0, "channel already exists");
        counter += 1;
        channelCounter[user][token] = counter;
        bytes32 channelID = getChannelID (user, token);
        Channel storage channel = channels[channelID];
        if (msg.sender == provider) {
            channel.status = 1;
            channel.user = user;
            channel.token = token;
            channel.settleBlock = settleWindow;

            emit ChannelOpened (
                msg.sender,
                user,
                token,
                address(0x0),
                0,
                settleWindow,
                channelID
            );
        } else {
            require(msg.sender == user, "msg.sender should be userself");

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
            } else { //open token channel
                require(amount > 0, "user should deposit token");
                ERC20(token).safeTransferFrom(user, address(this), amount);
                channel.deposit = amount;
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
        Channel storage channel = channels[channelID];
        if (channel.token == address(0x0)) {
            require(msg.value > 0, "invalid deposit");
            channel.deposit += msg.value;
            emit UserNewDeposit (
                channelID,
                msg.sender,
                msg.value,
                channel.deposit
            );
        } else {
            require(amount > 0, "invalid deposit");
            ERC20(channel.token).safeTransferFrom(msg.sender, address(this), amount);
            channel.deposit += amount;
            emit UserNewDeposit (
                channelID,
                msg.sender,
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
            providerBalance[token] += int256(msg.value);
            emit ProviderNewDeposit (
                token,
                msg.value,
                providerBalance[token]
            );
        } else {
            require(amount > 0, "invalid deposit");
            ERC20(token).safeTransferFrom(msg.sender, address(this), amount);
            providerBalance[token] += int256(amount);
            emit ProviderNewDeposit (
                token,
                amount,
                providerBalance[token]
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
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                address(this),
                channelID,
                withdraw,
                lastCommitBlock
            )
        );
        require(ECDSA.recover(messageHash, providerSignature) == provider, "invalid provider signature");
        require(ECDSA.recover(messageHash, regulatorSignature) == regulator, "invalid regulator signature");

        Channel storage channel = channels[channelID];
        require(msg.sender == channel.user, "msg.sender should be user");
        require(channel.withdraw < withdraw, "invalid withdraw");
        uint256 amount = withdraw - channel.withdraw;
        channel.withdraw = withdraw;

        if (channel.token == address(0x0)) {
            address(receiver).transfer(amount);
        } else {
            ERC20(channel.token).safeTransfer(receiver, amount);
        }

        emit UserWithdraw (
            channelID,
            msg.sender,
            amount,
            withdraw,
            lastCommitBlock
        );
    }

    function providerWithdraw (
        address token,
        int256 balance,
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
                balance,
                lastCommitBlock
            )
        );
        require(ECDSA.recover(messageHash, regulatorSignature) == regulator, "invaild regulator signature");
        require(balance < providerBalance[token], "invalid withdraw");

        uint256 amount = uint256(providerBalance[token] - balance);
        providerBalance[token] = balance;
        if (token == address(0x0)) {
            address(provider).transfer(amount);
        } else {
            ERC20(token).safeTransfer(provider, amount);
        }

        emit ProviderWithdraw (
            token,
            amount,
            balance,
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

        emit RegulatorWithdraw (
            token,
            withdrawAmount,
            feeAmount,
            feeNonce
        );
    }

    // function cooperativeSettle (
    //     bytes32 channelID,
    //     uint256 balance,
    //     uint256 lastCommitBlock,
    //     bytes memory providerSignature,
    //     bytes memory regulatorSignature
    // )
    //     public
    //     isChannelOpened(user)
    //     commitBlockValid(lastCommitBlock)
    // {
    //     require(msg.sender == user, "only user can trigger");

    //     bytes32 channelID = getChannelID(user);

    //     Channel storage channel = channels[channelID];

    //     bytes32 messageHash = keccak256(
    //         abi.encodePacked(
    //             address(this),
    //             channelID,
    //             user,
    //             balance,
    //             lastCommitBlock
    //         )
    //     );

    //     require(ECDSA.recover(messageHash, providerSignature) == provider, "invalid provider signature");
    //     require(ECDSA.recover(messageHash, regulatorSignature) == regulator, "invalid regulator signature");

    //     uint256 payout = safeAdd(balance, channel.withdraw);

    //     if (payout >= channel.deposit) {
    //         providerBalance -= int256(payout - channel.deposit);
    //     } else {
    //         providerBalance += int256(channel.deposit - payout);
    //     }

    //     delete channels[channelID];
    //     delete channelCounter[user];

    //     if (balance > 0) {
    //         address(user).transfer(balance);
    //     }

    //     emit CooperativeSettled (
    //         channelID,
    //         user,
    //         balance,
    //         lastCommitBlock
    //     );
    // }

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
        Channel storage channel = channels[channelID];
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
        Channel storage channel = channels[channelID];
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
        Channel storage channel = channels[channelID];
        require(block.number > channel.settleBlock, "settleWindow should be over");
        require(safeAdd(channel.deposit, channel.inAmount) >= channel.withdraw,  "channel balance should be positive");
        providerBalance[channel.token] -= int256(channel.inAmount);

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
            require(channel.inAmount >= margin, "provider not sufficient funds");
            providerTransferredAmount = channel.inAmount - margin;

            require(safeAdd(channel.deposit, margin) >= channel.withdraw, "user not sufficient funds");
            userTransferredAmount = safeAdd(channel.deposit, margin) - channel.withdraw;
        } else {
            require(channel.deposit >= safeAdd(channel.withdraw, margin), "user not sufficient funds");
            userTransferredAmount = channel.deposit - safeAdd(channel.withdraw, margin);
            providerTransferredAmount = safeAdd(channel.inAmount, margin);
        }

        delete channels[channelID];
        delete channelCounter[channel.user][channel.token];

        if (userTransferredAmount > 0) {
            if (channel.token == address(0x0)) {
                address(channel.user).transfer(userTransferredAmount);
            } else {
                ERC20(channel.token).safeTransfer(channel.user, userTransferredAmount);
            }
        }
        if (providerTransferredAmount > 0) {
            providerBalance[channel.token] += int256(providerTransferredAmount);
        }

        emit ChannelSettled (
            channelID,
            channel.user,
            channel.token,
            userTransferredAmount,
            providerTransferredAmount
        );
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

        uint256 _counter = channelCounter[user][token];
        require(_counter != 0, "channel does not exist");

        return keccak256((abi.encodePacked(user, token, _counter)));
    }

    /**
    Events
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
        bytes32 indexed channelID,
        address indexed user,
        uint256 newDeposit,
        uint256 totalDeposit
    );

    event ProviderNewDeposit (
        address indexed token,
        uint256 amount,
        int256 balance
    );

    event UserWithdraw (
        bytes32 indexed channelID,
        address indexed user,
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

    // event CooperativeSettled (
    //     bytes32 indexed channelID,
    //     address indexed user,
    //     uint256 balance,
    //     uint256 lastCommitBlock
    // );

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
        bytes32 indexed channelID,
        address indexed user,
        address indexed token,
        uint256 transferTouserAmount,
        uint256 transferToProviderAmount
    );

    /**
        Internal Methods
     */

    function handleBalanceProof (
        bytes32 channelID,
        uint256 balance,
        uint256 nonce,
        bytes32 additionalHash,
        bytes memory partnerSignature
    )
        internal
    {
        Channel storage channel = channels[channelID];
        require(channel.status == 1, "channel should be open");

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

        channel.status = 2;
        channel.settleBlock += uint256(block.number);
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
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                address(this),
                channelID,
                balance,
                nonce,
                additionalHash
            )
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
        Channel storage channel = channels[channelID];
        if (inNonce > channel.inNonce) {
            bytes32 inMessageHash = keccak256(
                abi.encodePacked(
                    address(this),
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
