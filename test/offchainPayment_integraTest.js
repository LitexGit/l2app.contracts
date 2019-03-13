const ethUtil = require('ethereumjs-util');
const BigNumber = web3.BigNumber;

var OffchainPayment = artifacts.require("OffchainPayment");

function myEcsign(messageHash, privateKey) {
  messageHash = Buffer.from(messageHash.substr(2), 'hex')
  let signatureObj = ethUtil.ecsign(messageHash, privateKey);
  let signatureHexString = ethUtil.toRpcSig(signatureObj.v, signatureObj.r, signatureObj.s).toString('hex');
  let signatureBytes = web3.utils.hexToBytes(signatureHexString);
  return signatureBytes;
}

contract('OffchainPayment', (accounts) => {

  console.log('accounts', accounts);

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
    this.offchainPayment = await OffchainPayment.new(providerAddress, providerAddress, regulatorAddress, {from: providerAddress});
  });


  it("integration 1 should success", async ()=>{
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 100000;
    await this.offchainPayment.onchainOpenChannel(
      userAddress,
      tokenAddress,
      channelID,
      amount,
      { from: regulatorAddress}
    );
    let balance = 8;
    let lastCommitBlock = 888;
    await this.offchainPayment.proposeCooperativeSettle(channelID, balance, lastCommitBlock, {from: userAddress});
    let messageHash = web3.utils.soliditySha3(providerAddress, channelID, balance, lastCommitBlock);
    let providerSignature = myEcsign(messageHash, providerPrivateKey);
    await this.offchainPayment.confirmCooperativeSettle(channelID, providerSignature, {from: providerAddress});
    let regulatorSignature = myEcsign(messageHash, regulatorPrivateKey);
    await this.offchainPayment.confirmCooperativeSettle(channelID, regulatorSignature, {from: regulatorAddress});

    balance = 1;
    let nonce = 1;
    let additionalHash = channelID;
    messageHash = web3.utils.soliditySha3(providerAddress, channelID, balance, nonce, additionalHash);
    let signature = myEcsign(messageHash, userPrivateKey);
    await this.offchainPayment.transfer(providerAddress, channelID, balance, nonce, additionalHash, signature, {from: userAddress});
    amount = 1;
    let receiver = userAddress;
    lastCommitBlock = 888;
    await this.offchainPayment.userProposeWithdraw(channelID, amount, receiver, lastCommitBlock, {from: userAddress});
  });

  it("integration 3 should success", async ()=>{
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 100000;
    await this.offchainPayment.onchainOpenChannel(
      userAddress,
      tokenAddress,
      channelID,
      amount,
      { from: regulatorAddress}
    );

    amount = 100;
    let receiver = userAddress;
    let lastCommitBlock = 888;
    await this.offchainPayment.userProposeWithdraw(channelID, amount, receiver, lastCommitBlock, {from: userAddress});

    let messageHash = web3.utils.soliditySha3(providerAddress, channelID, amount, lastCommitBlock);
    let providerSignature = myEcsign(messageHash, providerPrivateKey);
    await this.offchainPayment.confirmUserWithdraw(channelID, providerSignature, {from: providerAddress});
    let regulatorSignature = myEcsign(messageHash, regulatorPrivateKey);
    await this.offchainPayment.confirmUserWithdraw(channelID, regulatorSignature, {from: regulatorAddress});

    let channelData = await this.offchainPayment.channelMap.call(channelID);
    console.log("vvv", channelData.userBalance.toNumber());

    let balance = 99999;
    let nonce = 1;
    let additionalHash = channelID;
    messageHash = web3.utils.soliditySha3(providerAddress, channelID, balance, nonce, additionalHash);
    let signature = myEcsign(messageHash, userPrivateKey);
    await this.offchainPayment.transfer(providerAddress, channelID, balance, nonce, additionalHash, signature, {from: userAddress});

  });

  it("integration 5 should success", async ()=> {
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 10;
    await this.offchainPayment.onchainOpenChannel(
      userAddress,
      tokenAddress,
      channelID,
      amount,
      { from: regulatorAddress}
    );

    amount = 20000;
    await this.offchainPayment.onchainProviderDeposit(tokenAddress, amount, { from: regulatorAddress});

    amount = 10;
    let nonce = 888;
    let messageHash = web3.utils.soliditySha3(providerAddress, channelID, amount, nonce);
    let signature = myEcsign(messageHash, providerPrivateKey);
    await this.offchainPayment.proposeRebalance(channelID, amount, nonce, signature, {from: providerAddress});
    signature = myEcsign(messageHash, regulatorPrivateKey);
    await this.offchainPayment.confirmRebalance(messageHash, signature, {from: regulatorAddress});

    let channelData = await this.offchainPayment.channelMap.call(channelID);
    console.log("vvv", channelData.providerBalance.toNumber());

    let balance = 5;
    nonce = 1;
    let additionalHash = channelID;
    messageHash = web3.utils.soliditySha3(providerAddress, channelID, balance, nonce, additionalHash);
    signature = myEcsign(messageHash, userPrivateKey);
    await this.offchainPayment.transfer(providerAddress, channelID, balance, nonce, additionalHash, signature, {from: userAddress});

    balance = 12;
    nonce = 1;
    additionalHash = channelID;
    messageHash = web3.utils.soliditySha3(providerAddress, channelID, balance, nonce, additionalHash);
    signature = myEcsign(messageHash, providerPrivateKey);
    await this.offchainPayment.transfer(userAddress, channelID, balance, nonce, additionalHash, signature, {from: providerAddress});
  })

  it("integration 6 should success", async()=>{
      
  })

})
