pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import "./lib/MsDecoder.sol";
import "./ECDSA.sol";
import "./lib/RLPReader.sol";

contract PacketVerify {
    using RLPReader for bytes;
    using RLPReader for uint;
    using RLPReader for RLPReader.RLPItem;

    uint256 constant rate = 98;
    struct State {
        // PacketData.ProviderRandomHash prh;
        bytes32 prh;
        address token;
        uint256 amount;
        address provider;
        bytes32 pr;
        address loser;
    }

    struct URHash {
        bytes32 urh;
        address user;
        bytes32 urr;
        uint256 m;
    }

    struct PSettle{
        address user;
        uint amount;
    }

    function testRlp (
        bytes memory data
    )
        public
        view
        returns(MsDecoder.Message[] memory) 
    {
        MsDecoder.Message[] memory ms = MsDecoder.decode(data);
        return ms;
    }

    function verifyCancel (
        State memory s,
        MsDecoder.Message[] memory ms,
        uint cIdx
    )
        internal
        view
        returns(uint)
    {
        address[] memory users = new address[](cIdx);
        uint userLength = 0;
        for(uint i=0; i<cIdx; i++) {
            if(ms[i].mType == 2 && ms[i].to == s.provider  && ms[i].amount == s.amount){
                users[userLength] = ms[i].from;
                userLength++;
            }
        }
        uint idx = 0;
        for(uint j=cIdx; j<ms.length&&idx<userLength; j++) {
            if(ms[j].mType == 7 && ms[j].to == users[idx] && ms[j].amount == s.amount){
                idx++;
            }
        }
        if(idx < userLength) {
            return 3001;
        } else {
            return 0;
        }
    }

    function verify (
        bytes memory data
    )
        public
        returns(uint) //0=success, 1xxx=invalid data, 2xxx=wrong result
    {
        MsDecoder.Message[] memory ms = MsDecoder.decode(data);
        State memory s;
        URHash[] memory urHash = new URHash[](5);
        PSettle[] memory pSettle = new PSettle[](5);
        uint idx = 0;
        // provider start game message
        if (ms[0].mType == 1) {
            RLPReader.RLPItem[] memory items = ms[0].content.toRlpItem().toList();
            s.prh = toBytes32(items[0].toBytes());
            s.token = items[1].toAddress();
            s.amount = items[2].toUint();
            s.provider = ms[0].from;
        } else return 1001;
        // provider cancel game
        for(uint i=1; i<ms.length; i++){
            if(ms[i].mType == 6 && ms[i].from == s.provider){
                return verifyCancel(s, ms, i);
            }
        }
        // provider send hash ready message
        for(uint i=1; i<ms.length; i++){ 
            if(ms[i].mType == 3 && ms[i].from == s.provider){
                RLPReader.RLPItem[] memory items = ms[i].content.toRlpItem().toList();
                urHash[0].user = items[0].toAddress();
                urHash[1].user = items[1].toAddress();
                urHash[2].user = items[2].toAddress();
                urHash[3].user = items[3].toAddress();
                urHash[4].user = items[4].toAddress();
                idx = 0;
                for(uint j=1; j<i&&idx<5; j++){
                    if(ms[j].mType == 2 && ms[j].to == s.provider && ms[j].from == urHash[idx].user && ms[j].amount == s.amount){
                        urHash[idx].urh = toBytes32(ms[j].content.toRlpItem().toList()[0].toBytes());
                        idx++;
                    }
                }
                if(idx < 5){
                    return 1002;
                }
                break;
            }
        }
        if(urHash[0].user == address(0)) return 1003;
        // provider settle game
        idx = 0;
        for(uint i=1; i<ms.length&&idx<5; i++){
            if(ms[i].mType == 5 && ms[i].from == s.provider){
                if(idx == 0) {
                    s.pr = toBytes32(ms[i].content.toRlpItem().toList()[0].toBytes());
                    if (keccak256(abi.encodePacked(s.pr)) != s.prh) return 1004;
                } else if(toBytes32(ms[i].content.toRlpItem().toList()[0].toBytes()) != s.pr) {
                    return 1005;
                }
                pSettle[idx].user = ms[i].to;
                pSettle[idx].amount = ms[i].amount;
                idx++;
            }
        }
        if(!verifyProviderSettle(urHash, pSettle)) return 1006;
        // provider send random message
        for(uint i=1; i<ms.length; i++){
            if(ms[i].mType == 4 && ms[i].from == s.provider){
                RLPReader.RLPItem[] memory items = ms[i].content.toRlpItem().toList();
                for(uint j=0; j<5; j++){
                    if(keccak256(abi.encodePacked(toBytes32(items[j].toBytes()))) != urHash[j].urh) return 1008;
                    urHash[j].urr = toBytes32(items[j].toBytes());
                }
            }
        }
        uint256 m = uint256(urHash[0].urr^urHash[1].urr^urHash[2].urr^urHash[3].urr^urHash[4].urr^s.pr)%100 + 100;
        for (uint j=0; j<5; j++) {
            uint i = 4 - j;
            urHash[i].m = uint256(urHash[i].urr)%m;
            if(i == 4) {
                s.loser = urHash[i].user;
            } else if(urHash[i].m<urHash[i+1].m) {
                s.loser = urHash[i].user;
            }
        }
        // verify if settlement was correct
        for (uint i=0; i<5; i++) {
            if(pSettle[i].user == s.loser) {
                if(pSettle[i].amount != (s.amount*rate/100)*urHash[i].m/(urHash[0].m+urHash[1].m+urHash[2].m+urHash[3].m+urHash[4].m))
                return 2001;
            } else {
                if(pSettle[i].amount != ((s.amount*rate/100)*urHash[i].m/(urHash[0].m+urHash[1].m+urHash[2].m+urHash[3].m+urHash[4].m)) + s.amount*rate/100) return 2002;
            }
        }
        return 0;
    }

    function verifyProviderSettle (
        URHash[] memory urHash,
        PSettle[] memory pSettle 
    )
        internal
        pure
        returns(bool)
    {
        for(uint i=0; i<5; i++) {
            uint j = 0;
            while(urHash[i].user != pSettle[j].user && j<5) j++;
            if(j==5) return false;
        }
        return true;
    }

    function verifySig(
        MsDecoder.Message memory m
    )
        internal
        pure
        returns (bool)
    {
        bytes32 h = keccak256(
            abi.encodePacked(
                m.from,
                m.to,
                m.sessionID,
                m.mType,
                m.content
            )
        );
        if(ECDSA.recover(h, m.signature) == m.from){
            return true;
        } else {
            return false;
        }
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