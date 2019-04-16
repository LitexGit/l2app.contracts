const ethUtil = require('ethereumjs-util');
var TestABI = artifacts.require('TestABI');

const BigNumber = web3.BigNumber;

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

  beforeEach(async ()=>{
    this.TestABI = await TestABI.new();
  });

  it("should successfully", async() =>{
    let sessionID = web3.utils.sha3("jjj");
    let balance = 1;
    let nonce = 8;
    let additionalHash = sessionID;
    let signature = myEcsign(sessionID, userPrivateKey);
    for(let i=1; i<2; i++) {
      await this.TestABI.sendMessage(userAddress, providerAddress, sessionID, "xxoo", "0x0", "0x0", sessionID, balance, nonce, sessionID, signature);
    }
    let res = await this.TestABI.exportSession.call(sessionID);
    console.log("export", res);
    // res = await this.TestABI.importSession(res);
    // console.log("1", res);
    // res = await this.TestABI.testM.call();
    // console.log("2", res);

  });
});