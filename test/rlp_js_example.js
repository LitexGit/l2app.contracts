const rlp = require("rlp");

// contract interface
// paymentData is rlp encoded of [channelID, balance, nonce, amount, additionalHash, signature]
/*
    function sendMessage(
        address from,
        address to,
        bytes32 sessionID,
        uint8 mType,
        bytes memory content,
        bytes memory signature,
        bytes memory paymentData
    ) public {}
*/

// balance is a string of bn
// nonce is a number
// amount is a number
// signature is bytes
let paymentData = [channelID, web3.utils.toHex(balance), nonce, amount, additionalHash, web3.utils.bytesToHex(signature)];
// rlpencode is encoded data
let rlpencode = '0x' + rlp.encode(paymentData).toString('hex');
// use rlpencode to call sendMessage
let res = await Session.sendMessage(from, to, sessionID, mType, content, signature, rlpencode);