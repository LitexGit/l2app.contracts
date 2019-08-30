let rlp = require("rlp");


// mType=1
function rlpEncodeUserRandom(providerHash, providerSignature, userRandom,modulo,betMask) {
  let data = [providerHash,providerSignature,userRandom,modulo,betMask];
  return "0x" + rlp.encode(data).toString("hex");
}
// mType=2
function rlpEncodeProviderSettle(providerRandom) {
  let data = [providerRandom];
  return "0x" + rlp.encode(data).toString("hex");
}


module.exports = {
  rlpEncodeUserRandom,
  rlpEncodeProviderSettle
};
