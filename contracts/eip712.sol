pragma solidity >=0.4.24 <0.6.0;

contract eip712 {
    bytes32 public DOMAIN_SEPERATOR;

    bytes32 public constant TRANSFER_TYPEHASH = keccak256(
        "Transfer(bytes32 channelID,uint256 balance,uint256 nonce,bytes32 additionalHash)"
    );

    bytes32 public constant EIP712DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    constructor (
        uint256 _chainID
    )
        public
    {
        DOMAIN_SEPERATOR =  keccak256(
            abi.encode(
                EIP712DOMAIN_TYPEHASH,
                keccak256("litexlayer2"),
                keccak256("1"),
                _chainID,
                address(this))
        );
    }

    function transfer (
        bytes32 channelID,
        uint256 balance,
        uint256 nonce,
        bytes32 additionalHash,
        bytes memory sig
    )
        public
    {
        bytes32 h = transferHash(channelID, balance, nonce, additionalHash);
        address r = recover(h, sig);
        emit R(r);
    }

    event R(address r);

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
        returns(bytes32)
    {
        bytes32 hash = keccak256(abi.encode(
            TRANSFER_TYPEHASH,
            channelID,
            balance,
            nonce,
            additionalHash
        ));

        return keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPERATOR,
            hash
        ));
    }

    /**
     * @dev Split the given signature of the form rsv in r s v. v is incremented with 27 if
     * it is below 2.
     * @param _signature Signature to split.
     * @return r s v
     */
    function signatureSplit(bytes memory _signature)
        private
        pure
        returns (bytes32 r, bytes32 s, uint8 v)
    {
        require(_signature.length == 65, "inv sig");

        assembly {
            r := mload(add(_signature, 32))
            s := mload(add(_signature, 64))
            v := and(mload(add(_signature, 65)), 0xff)
        }
        if (v < 2) {
            v = v + 27;
        }
    }

    /**
     * @dev Check if _sig is valid signature of _hash. Throws if invalid signature.
     * @param _hash Hash to check signature of.
     * @param _sig Signature of _hash.
     */
    function recover(
        bytes32 _hash,
        bytes memory _sig
    )
        internal
        pure
        returns(address)
    {
        (bytes32 r, bytes32 s, uint8 v) = signatureSplit(_sig);
        address addressRecover = ecrecover(_hash, v, r, s);
        // require(addressRecover == _address, "inv sig");
        return addressRecover;
    }
}