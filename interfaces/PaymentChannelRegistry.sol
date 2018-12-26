pragma solididy ^0.4.24;

import "./ERC20Channel.sol";
import "./ETHChannel.sol";
import "openzeppelin-solidity/contracts/utils/Address.sol";

contract PaymentChannelRegistry {
    using Address for address;

    /**
        States
     */

    uint256 public chainID;

    // identifier is keccak256(tokenAddress, gameAddress)
    mapping (bytes32 => address) public identifier_to_paymentChannel;

    /**
        Constructor
     */
    
    constructor (
        uint256 _chainID,
    )
        public
    {
        require(_chainID > 0);

        chainID = _chainID;
    }

    /**
        External Methods
     */

    function createPaymentChannel (
        address tokenAddress,
        address gameContract,
        uint256 settleWindowMin,
        uint256 settleWindowMax
    )
        external
        returns (address paymentChannel)
    {
        require(tokenAddress.isContract(), "invalid tokenAddress");
        require(gameContract.isContract(), "invalid gameContract");
        require(settleWindowMin > 0);
        require(settleWindowMax > settleWindowMin);

        bytes32 identifier = getPaymentChannelIdentifier (
            tokenAddress,
            gameContract
        );

        require(identifier_to_paymentChannel[identifier] == 0x0, "duplicate registered");

        if (tokenAddress == 0x0) {
            paymentChannel = new ETHChannel (
                gameContract,
                settleWindowMin,
                settleWindowMax
            );
        } else {
            paymentChannel = new ERC20Channel (
                tokenAddress,
                gameContract,
                settleWindowMin,
                settleWindowMax
            );
        }

        identifier_to_paymentChannel[identifier] = paymentChannel;

        emit paymentChannelCreated (
            tokenAddress,
            gameContract,
            identifier,
            paymentChannel,
            settleWindowMin,
            settleWindowMax
        );
    }

    /**
        Public Methods
     */

    function getPaymentChannelIdentifier (
        address tokenAddress,
        address gameContract
    )
        public
        pure
        returns (bytes32 identifier) 
    {
        return keccak256 (
            abi.encodePacked(
                tokenAddress,
                gameContract
            )
        );
    }

    /**
        Events
     */

    event paymentChannelCreated (
        address tokenAddress,
        address gameContract,
        bytes32 identifier,
        address paymentChannel,
        uint256 settleWindowMin,
        uint256 settleWindowMax
    );
}