const ethUtil = require('ethereumjs-util');

//messageHash, privateKey are both buffer type
function myEcsign(messageHash, privateKey) {
    messageHash = Buffer.from(messageHash.substr(2), 'hex')
    let signatureObj = ethUtil.ecsign(messageHash, privateKey);
    let signatureHexString = ethUtil.toRpcSig(signatureObj.v, signatureObj.r, signatureObj.s).toString('hex');
    let signatureBytes = web3.utils.hexToBytes(signatureHexString);
    return signatureBytes;
}

module.exports = {
    myEcsign,
}