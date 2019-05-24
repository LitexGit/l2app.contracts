const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');

function tEcsign(messageHash, privateKey) {
  let signatureObj = ethUtil.ecsign(messageHash, privateKey);
  let signatureHexString = ethUtil
    .toRpcSig(signatureObj.v, signatureObj.r, signatureObj.s)
    .toString("hex");
  let signatureBytes = web3.utils.hexToBytes(signatureHexString);
  return signatureBytes;
}
function myEcsign(messageHash, privateKey) {
  messageHash = Buffer.from(messageHash.substr(2), "hex");
  let signatureObj = ethUtil.ecsign(messageHash, privateKey);
  let signatureHexString = ethUtil
    .toRpcSig(signatureObj.v, signatureObj.r, signatureObj.s)
    .toString("hex");
  let signatureBytes = web3.utils.hexToBytes(signatureHexString);
  return signatureBytes;
}

function personalSign(messageHash, privateKey) {
  return myEcsign(
    web3.utils.soliditySha3(
      { t: "string", v: "\x19Ethereum Signed Message:\n32" },
      { t: "bytes32", v: messageHash.toString("hex") }
    ),
    privateKey
  );
}

module.exports = {
  tEcsign,
  myEcsign,
  personalSign
};
