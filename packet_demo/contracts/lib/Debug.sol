pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

/*
* Used to proxy function calls to the RLPReader for testing
*/
import "./RLPReader.sol";

contract Debug {
    using RLPReader for bytes;
    using RLPReader for uint;
    using RLPReader for RLPReader.RLPItem;

    struct ProviderHashReady {
        address user1;
        address user2;
        address user3;
        address user4;
        address user5;
    }

    function decodePHR(bytes memory data) public view returns (ProviderHashReady memory) {
        RLPReader.RLPItem[] memory users = data.toRlpItem().toList();
        return ProviderHashReady(users[0].toAddress(), users[1].toAddress(), users[2].toAddress(), users[3].toAddress(), users[4].toAddress());
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
