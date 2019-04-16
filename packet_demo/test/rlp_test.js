const ethUtil = require('ethereumjs-util');
let rlp = require("rlp");

var PacketVerify = artifacts.require('PacketVerify');

function myEcsign(messageHash, privateKey) {
    messageHash = Buffer.from(messageHash.substr(2), 'hex')
    let signatureObj = ethUtil.ecsign(messageHash, privateKey);
    let signatureHexString = ethUtil.toRpcSig(signatureObj.v, signatureObj.r, signatureObj.s).toString('hex');
    let signatureBytes = web3.utils.hexToBytes(signatureHexString);
    return signatureBytes;
}

contract('test abi encode', (accounts) => {
  const providerAddress = accounts[0];
  const regulatorAddress = accounts[1];
  const userAddress = accounts[2];
  const tokenAddress = accounts[3];
  const puppetAddress = accounts[4];
  const puppetAddress2 = accounts[5];
  const puppetAddress3 = accounts[6];

  const providerPrivateKey = Buffer.from("a5f37d95f39a584f45f3297d252410755ced72662dbb886e6eb9934efb2edc93", 'hex');
  const regulatorPrivateKey = Buffer.from("2fc8c9e1f94711b52b98edab123503519b6a8a982d38d0063857558db4046d89", 'hex');
  const userPrivateKey = Buffer.from("d01a9956202e7b447ba7e00fe1b5ca8b3f777288da6c77831342dbd2cb022f8f", 'hex');

//   beforeEach(async ()=>{
//     this.TestABI = await TestABI.new();
//   });

  it("should successfully", async() =>{
    let instance = await PacketVerify.new();
    let sessionID = web3.utils.sha3("jjj");
    console.log("bytes32 ", sessionID);
    let balance = 1;
    let nonce = 8;
    let signature = myEcsign(sessionID, userPrivateKey);
    let data = [];
    for(let i=0; i<10; i++) {
      data.push([userAddress, accounts[i], sessionID, i, "0x12", "0x23", sessionID, i, i, i, sessionID, "0x33"]);
    }
    let rlpencode = '0x' + rlp.encode(data).toString('hex');
    console.log("rlp encode", rlpencode);
    let res = await instance.testRlp.call(rlpencode);
    console.log('res', res);
  });
});