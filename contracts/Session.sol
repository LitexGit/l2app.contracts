pragma solidity >=0.4.24 <0.6.0;
pragma experimental ABIEncoderV2;

import "./lib/ECDSA.sol";
import "./lib/TransferData.sol";

contract OCPInterface {
    function transfer (address to, bytes32 channelID, uint256 balance, uint256 nonce, bytes32 additionalHash, bytes memory signature) public;
    function isPuppet (address user, address puppet) public returns(bool);
}

contract Session {
    /**
     *  States
     */

    // sessionID => Session
    mapping (bytes32 => Session) public sessions;
    struct Session {
        // 0=not exists
        // 1=open
        // 2=closed
        uint8 status;
        address provider;
        address game;
        address paymentContract;
        bytes data;
    }
    // sessionID => player list
    mapping (bytes32 => address[]) public players;
    // sessionID => message list
    mapping (bytes32 => Message[]) public messages;

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

    // game => counter
    // mapping (address => uint256) public counter;

    /**
     *  Constructor
     */
    
    constructor() public {}

    /**
     *  Public Functions
     */

    // function getSessionID(
    //     address game,
    //     uint256 counter
    // )
    //     public
    //     returns(bytes32)
    // {
    //     return keccak256(abi.encodePacked(game, counter));
    // }
    
    function initSession(
        bytes32 sessionID,
        address provider,
        address game,
        address[] memory _players,
        address paymentContract,
        bytes memory data
    )
        public
    {
        require(msg.sender == provider);
        // counter[game]++;
        //bytes32 sessionID = getSessionID(game, counter[game]);
        require(sessions[sessionID].status == 0);
        sessions[sessionID] = Session(1, provider, game, paymentContract, data);
        players[sessionID] = _players;
        emit InitSession(
            provider,
            game,
            _players,
            sessionID
        );
    }

    function joinSession(
        bytes32 sessionID,
        address user
    )
        public
    {
        require(sessions[sessionID].status == 1);
        require(sessions[sessionID].provider == msg.sender);
        address[] storage _players = players[sessionID];
        uint256 idx = 0;
        while(idx < _players.length){
            if(_players[idx] == user){
                revert("user already exists");
            }
            idx++;
        }
        _players.push(user);
        emit JoinSession(
            sessionID,
            user
        );
    }

    function kickUser(
        bytes32 sessionID,
        address user
    )
        public
    {
        require(sessions[sessionID].status == 1);
        require(sessions[sessionID].provider == msg.sender);
        address[] storage _players = players[sessionID];
        uint256 idx = 0;
        while(idx < _players.length){
            if(_players[idx] == user){
                delete _players[idx];
                break;
            }
            idx++;
        }
        if(idx == _players.length) revert("user not exists");
        emit KickUser(
            sessionID,
            user
        );
    }

    function sendMessage(
        address from,
        address to,
        bytes32 sessionID,
        uint8 mType,
        bytes memory content,
        bytes memory signature,
        bytes memory protoData,
        bytes memory paymentSig
    )
        public
    {
        require(sessions[sessionID].status == 1, "session should be open");
        bytes32 mHash = keccak256(
            abi.encodePacked(
                from,
                to,
                sessionID,
                mType,
                content
        )); 
        if (from == sessions[sessionID].provider) {
            require(msg.sender == from, "invalid sender");
        } else {
            require(isUserExist(sessionID, from), "invalid user");
            require(OCPInterface(sessions[sessionID].paymentContract).isPuppet(from, ECDSA.recover(mHash, signature)), "invalid puppet signature");
        }
        TransferData.Transfer memory transferData;
        if (protoData.length != 0) transferData = TransferData.decTransfer(protoData);
        if (transferData.balance != 0 && transferData.nonce != 0 && mType != 0) {
            
            mHash = keccak256(
                abi.encodePacked(                  
                    mHash,
                    transferData.amount
                )
            );
            require(transferData.additionalHash == mHash, "invalid additional hash");
            OCPInterface(sessions[sessionID].paymentContract).transfer(to, transferData.channelID, transferData.balance, transferData.nonce, transferData.additionalHash, paymentSig);
        }
        Message[] storage message = messages[sessionID];
        message.push(Message(from, to, sessionID, mType, content, signature, transferData.channelID, transferData.balance, transferData.nonce, transferData.amount, transferData.additionalHash, paymentSig));
        emit SendMessage(from, to, sessionID, mType, content, signature, transferData.channelID, transferData.balance, transferData.nonce, transferData.amount, transferData.additionalHash, paymentSig);
    }

    function closeSession(
        bytes32 sessionID
    )
        public
    {
        Session storage session = sessions[sessionID];
        require(session.status == 1);
        require(msg.sender == session.provider);
        session.status = 2;
        emit CloseSession(
            sessionID
        );
    }

    function isUserExist(
        bytes32 sessionID,
        address user
    )
        public
        returns(bool)
    {
        address[] memory addrs = players[sessionID];
        for(uint i=0; i<addrs.length; i++) {
            if(addrs[i]==user) return true;
        }
        return false;
    }

    /**
     * External Functions
     */
    // function exportSessionBytes(
    //     bytes32 sessionID
    // )
    //     external
    //     view
    //     returns(bytes memory)
    // {
    //     return abi.encode(messages[sessionID]);
    // }

    function exportSession(
        bytes32 sessionID
    )
        external
        view
        returns(Message[] memory)
    {
        return messages[sessionID];
    }

    function exportPlayer(
        bytes32 sessionID
    )
        external
        returns(address[] memory)
    {
        return players[sessionID];
    }

    /**
     * Events
     */
    
    event InitSession(
        address indexed provider,
        address indexed game,
        address[] _players,
        bytes32 sessionID
    );

    event JoinSession(
        bytes32 indexed sessionID,
        address indexed user
    );

    event KickUser(
        bytes32 indexed sessionID,
        address indexed user
    );

    event SendMessage(
        address indexed from,
        address indexed to,
        bytes32 indexed sessionID,
        uint8 mType,
        bytes content,
        bytes signature,
        bytes32 channelID,
        uint256 balance,
        uint256 nonce,
        uint256 amount,
        bytes32 additionalHash,
        bytes paymentSignature
    );

    event CloseSession(
        bytes32 indexed sessionID
    );
}