pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

/*
* Used to proxy function calls to the RLPReader for testing
*/
import "./RLPReader.sol";

library MsDecoder {
    using RLPReader for bytes;
    using RLPReader for uint;
    using RLPReader for RLPReader.RLPItem;

    struct Message {
        address from;
        address to;
        bytes32 sessionID;
        uint mType;
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

    function decode(bytes memory data) internal view returns (Message[] memory) {
        RLPReader.RLPItem[] memory messages = data.toRlpItem().toList();
        Message[] memory ms = new Message[](messages.length);
        RLPReader.RLPItem[] memory items;
        for(uint i=0; i<messages.length; i++) {
            items = messages[i].toList();
            ms[i] = Message(items[0].toAddress(), items[1].toAddress(), toBytes32(items[2].toBytes()), items[3].toUint(), items[4].toBytes(), items[5].toBytes(), toBytes32(items[6].toBytes()), items[7].toUint(), items[8].toUint(), items[9].toUint(), toBytes32(items[10].toBytes()), items[11].toBytes());
        }
        return ms;
    }

    function toBytes32(bytes memory source) internal pure returns (bytes32 result) {
        if (source.length == 0) {
            return 0x0;
        }
        assembly {
            result := mload(add(source, 32))
        }
    }
}
