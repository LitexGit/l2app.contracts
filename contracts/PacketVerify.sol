pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;

import "./PacketData.sol";

contract PacketVerify {
    using PacketData for bytes;

    struct Message {
        address from;
        address to;
        bytes32 sessionID;
        string mType;
        bytes content;
        bytes signature;
        // balance proof
        bytes32 channelID;
        uint256 balance;
        uint256 nonce;
        // hash of data related to transfer
        uint256 amount;
        bytes32 additionalHash;
        bytes paymentSignature;
    }

    function verify (
        Message[] memory messages
    )   
        public
    {
        
    }
}