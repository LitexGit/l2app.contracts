const ethUtil = require('ethereumjs-util');
const BigNumber = web3.BigNumber;

var OnchainPayment = artifacts.require("OnchainPayment");
var LiteXToken = artifacts.require("LiteXToken");

function myEcsign(messageHash, privateKey) {
  messageHash = Buffer.from(messageHash.substr(2), 'hex')
  let signatureObj = ethUtil.ecsign(messageHash, privateKey);
  let signatureHexString = ethUtil.toRpcSig(signatureObj.v, signatureObj.r, signatureObj.s).toString('hex');
  let signatureBytes = web3.utils.hexToBytes(signatureHexString);
  return signatureBytes;
}

// function minBlock() {
//   await 
// }

contract('OnchainPayment', (accounts) => {

  //console.log('accounts', accounts);

  const providerAddress = accounts[0];
  const regulatorAddress = accounts[1];
  const userAddress = accounts[2];
  const tokenAddress = accounts[3];
  const puppetAddress = accounts[4];
  const puppetAddress2 = accounts[5];
  const puppetAddress3 = accounts[6];

  const providerPrivateKey = Buffer.from("24e13489c83a8f892891075e94953348b9b1c5841a638819e6b062ea87122d4e", 'hex');
  const regulatorPrivateKey = Buffer.from("de0fd81d5044820837c94143a5e32939fcc66e0705536d08ca350739ba34addb", 'hex');
  const userPrivateKey = Buffer.from("d127601a67d8dc42ace4efcdfafa148bc09f3fea52b9df773f8d5bb3e5d71033", 'hex');

  beforeEach(async ()=>{
    this.OnchainPayment = await OnchainPayment.new(regulatorAddress, providerAddress, 1, 9, 1, {from: providerAddress});
    this.Token = await LiteXToken.new({from: userAddress});
  });

  // it("should  successfully", async() =>{
  //     let res = await this.OnchainPayment.openChannel(userAddress, userAddress, 5, '0x0000000000000000000000000000000000000000', 0, {from: userAddress, value: 100});

  //     let channelID = res.receipt.logs[0].args[6];
  //       console.log(channelID, this.OnchainPayment.address);
        
  //     let messageHash = web3.utils.soliditySha3(this.OnchainPayment.address, channelID, 1, 9999);
  //     let psignature = myEcsign(messageHash, providerPrivateKey);
  //     let rsignature = myEcsign(messageHash, regulatorPrivateKey);

  //     res = await this.OnchainPayment.cooperativeSettle(channelID, 1, 9999, psignature, rsignature, {from: userAddress});

  //     res = await this.OnchainPayment.openChannel(userAddress, userAddress, 5, '0x0000000000000000000000000000000000000000', 0, {from: userAddress, value: 100});
  // });

  // it("eth close and settle channel should success", async()=>{
  //   let res = await this.OnchainPayment.openChannel(userAddress, userAddress, 1, '0x0000000000000000000000000000000000000000', 0, {from: userAddress, value: 100});
  //   let channelID = res.receipt.logs[0].args[6];
  //   //console.log(channelID, this.OnchainPayment.address);

  //   res = await this.OnchainPayment.closeChannel(channelID, 0, 0, "0x0", "0x0", 0, 0, "0x0", "0x0", {from: userAddress});
  //   console.log(res.receipt.logs[0])

  //   await OnchainPayment.new(regulatorAddress, providerAddress, 1, 9, 1, {from: providerAddress});

  //   res = await this.OnchainPayment.settleChannel(channelID);

  // });


  // it("token close and settle channel should success", async()=>{
  //   await this.Token.approve(this.OnchainPayment.address, 888, {from: userAddress});

  //   let res = await this.OnchainPayment.openChannel(userAddress, userAddress, 1, this.Token.address, 88, {from: userAddress});
  //   let channelID = res.receipt.logs[0].args[6];
  //   console.log(channelID, this.OnchainPayment.address);

  //   res = await this.OnchainPayment.closeChannel(channelID, 0, 0, "0x0", "0x0", 0, 0, "0x0", "0x0", {from: userAddress});
  //   console.log(res.receipt.logs[0])

  //   let channelData = await this.OnchainPayment.channels.call(channelID);
  //   console.log("channel data:", channelData);

  //   await OnchainPayment.new(regulatorAddress, providerAddress, 1, 9, 1, {from: providerAddress});

  //   res = await this.OnchainPayment.settleChannel(channelID);

  // });

  it("token co settle channel should success", async()=>{
    await this.Token.approve(this.OnchainPayment.address, 888, {from: userAddress});

    let res = await this.OnchainPayment.openChannel(userAddress, userAddress, 1, this.Token.address, 88, {from: userAddress});
    let channelID = res.receipt.logs[0].args[6];
    //console.log(channelID, this.OnchainPayment.address);

    let messageHash = web3.utils.soliditySha3(this.OnchainPayment.address, channelID, 8, 888);
    let providerSig = myEcsign(messageHash, providerPrivateKey);
    let regulatorSig = myEcsign(messageHash, regulatorPrivateKey);
    res = await this.OnchainPayment.cooperativeSettle(channelID, 8, 888, providerSig, regulatorSig, {from: userAddress});
    console.log(res);
  });

});