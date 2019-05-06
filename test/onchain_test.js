const ethUtil = require('ethereumjs-util');

var OnchainPayment = artifacts.require("OnchainPayment");
var LiteXToken = artifacts.require("LiteXToken");

function myEcsign(messageHash, privateKey) {
  messageHash = Buffer.from(messageHash.substr(2), 'hex')
  let signatureObj = ethUtil.ecsign(messageHash, privateKey);
  let signatureHexString = ethUtil.toRpcSig(signatureObj.v, signatureObj.r, signatureObj.s).toString('hex');
  let signatureBytes = web3.utils.hexToBytes(signatureHexString);
  return signatureBytes;
}

contract('OnchainPayment', (accounts) => {
  const providerAddress = accounts[0];
  const regulatorAddress = accounts[1];
  const userAddress = accounts[2];
  const tokenAddress = accounts[3];
  const puppetAddress1 = accounts[4];
  const puppetAddress2 = accounts[5];
  const puppetAddress3 = accounts[6];
  const providerPrivateKey = Buffer.from("24e13489c83a8f892891075e94953348b9b1c5841a638819e6b062ea87122d4e", 'hex');
  const regulatorPrivateKey = Buffer.from("de0fd81d5044820837c94143a5e32939fcc66e0705536d08ca350739ba34addb", 'hex');
  const userPrivateKey = Buffer.from("d127601a67d8dc42ace4efcdfafa148bc09f3fea52b9df773f8d5bb3e5d71033", 'hex');
  let myOnchainPayment;
  let myToken;

  beforeEach(async ()=>{
    myOnchainPayment = await OnchainPayment.new(regulatorAddress, providerAddress, 1, 9, 1, {from: providerAddress});
    myToken = await LiteXToken.new({from: userAddress});
    await myToken.transfer(providerAddress, 88888888, {from: userAddress});
    await myToken.approve(myOnchainPayment.address, 88888888, {from: providerAddress});
    await myToken.approve(myOnchainPayment.address, 88888888, {from: userAddress});
  });

  it("open eth channel", async()=>{
    let res = await myOnchainPayment.openChannel(userAddress, userAddress, 5, '0x0000000000000000000000000000000000000000', 0, {from: userAddress, value: 100});
    let channelID = res.receipt.logs[0].args[6];
    let channel = await myOnchainPayment.channelMap.call(channelID);
    assert.equal(channel.status.toNumber(), 1, "channel status error");
    assert.equal(channel.deposit.toNumber(), 100, "channel deposit error");
    // console.log("channel", channel);
  });

  it("open token channel", async()=>{
    let res = await myOnchainPayment.openChannel(userAddress, userAddress, 5, myToken.address, 100, {from: userAddress});
    let channelID = res.receipt.logs[0].args[6];
    let channel = await myOnchainPayment.channelMap.call(channelID);
    assert.equal(channel.status.toNumber(), 1, "channel status error");
    assert.equal(channel.deposit.toNumber(), 100, "channel deposit error");
    // console.log("channel", channel);
  });

  it("user deposit eth channel", async()=>{
    let res = await myOnchainPayment.openChannel(userAddress, userAddress, 5, '0x0000000000000000000000000000000000000000', 0, {from: userAddress, value: 100});
    let channelID = res.receipt.logs[0].args[6];
    res = await myOnchainPayment.userDeposit(channelID, 0, {value: 100});
    let channel = await myOnchainPayment.channelMap.call(channelID);
    assert.equal(channel.deposit.toNumber(), 200, "channel deposit error");
    // console.log("channel", channel);
  });

  it("user deposit token channel", async()=>{
    let res = await myOnchainPayment.openChannel(userAddress, userAddress, 5, myToken.address, 100, {from: userAddress});
    let channelID = res.receipt.logs[0].args[6];
    res = await myOnchainPayment.userDeposit(channelID, 100, {from: userAddress});
    let channel = await myOnchainPayment.channelMap.call(channelID);
    assert.equal(channel.deposit.toNumber(), 200, "channel deposit error");
    // console.log("channel", channel);
  });

  it("provider deposit eth", async()=>{
    let res = await myOnchainPayment.providerDeposit('0x0000000000000000000000000000000000000000', 0, {value: 100});
    let pDeposit = await myOnchainPayment.providerDepositMap.call('0x0000000000000000000000000000000000000000');
    assert.equal(pDeposit.toNumber(), 100, "provider deposit eth error");
  });

  it("provider deposit token", async()=>{
    let res = await myOnchainPayment.providerDeposit(myToken.address, 100, {from: providerAddress});
    let pDeposit = await myOnchainPayment.providerDepositMap.call(myToken.address);
    assert.equal(pDeposit.toNumber(), 100, "provider deposit eth error");
  });

  it("user withdraw eth", async()=>{
    let res = await myOnchainPayment.openChannel(userAddress, userAddress, 5, '0x0000000000000000000000000000000000000000', 0, {from: userAddress, value: 100});
    let channelID = res.receipt.logs[0].args[6];
    res = await myOnchainPayment.userDeposit(channelID, 0, {value: 100});
    let hash = web3.utils.soliditySha3(myOnchainPayment.address, channelID, 80, 1000000);
    let pSig = myEcsign(hash, providerPrivateKey);
    let rSig = myEcsign(hash, regulatorPrivateKey);
    res = await myOnchainPayment.userWithdraw(channelID, 80, 1000000, pSig, rSig, userAddress, {from: userAddress});
    let channel = await myOnchainPayment.channelMap.call(channelID);
    assert.equal(channel.withdraw.toNumber(), 80, "channel withdraw error");
  });

  it("user withdraw token", async()=>{
    let res = await myOnchainPayment.openChannel(userAddress, userAddress, 5, myToken.address, 100, {from: userAddress});
    let channelID = res.receipt.logs[0].args[6];
    res = await myOnchainPayment.userDeposit(channelID, 100, {from: userAddress});
    let hash = web3.utils.soliditySha3(myOnchainPayment.address, channelID, 80, 1000000);
    let pSig = myEcsign(hash, providerPrivateKey);
    let rSig = myEcsign(hash, regulatorPrivateKey);
    res = await myOnchainPayment.userWithdraw(channelID, 80, 1000000, pSig, rSig, userAddress, {from: userAddress});
    let channel = await myOnchainPayment.channelMap.call(channelID);
    assert.equal(channel.withdraw.toNumber(), 80, "channel withdraw error");
  });

  it("provider withdraw eth", async()=>{
    let res = await myOnchainPayment.providerDeposit('0x0000000000000000000000000000000000000000', 0, {value: 100});
    let hash = web3.utils.soliditySha3(myOnchainPayment.address, '0x0000000000000000000000000000000000000000', 20, 1000000);
    let rSig = myEcsign(hash, regulatorPrivateKey);
    res = await myOnchainPayment.providerWithdraw('0x0000000000000000000000000000000000000000', 20, 1000000, rSig, {from: providerAddress});
    let pDeposit = await myOnchainPayment.providerBalanceMap.call('0x0000000000000000000000000000000000000000');
    assert.equal(pDeposit.toNumber(), 80, "provider deposit eth error");
  });

  it("provider withdraw token", async()=>{
    let res = await myOnchainPayment.providerDeposit(myToken.address, 100, {from: providerAddress});
    let hash = web3.utils.soliditySha3(myOnchainPayment.address, myToken.address, 20, 1000000);
    let rSig = myEcsign(hash, regulatorPrivateKey);
    res = await myOnchainPayment.providerWithdraw(myToken.address, 20, 1000000, rSig, {from: providerAddress});
    let pDeposit = await myOnchainPayment.providerBalanceMap.call(myToken.address);
    assert.equal(pDeposit.toNumber(), 80, "provider deposit eth error");
  });

  it("regulator withdraw eth", async()=>{
    let res = await myOnchainPayment.providerDeposit('0x0000000000000000000000000000000000000000', 0, {value: 100});
    let hash = web3.utils.soliditySha3(myOnchainPayment.address, '0x0000000000000000000000000000000000000000', 50, 1000000);
    let pSig = myEcsign(hash, providerPrivateKey);
    res = await myOnchainPayment.regulatorWithdraw('0x0000000000000000000000000000000000000000', 20, 50, 1000000, pSig, {from: providerAddress});
    let pDeposit = await myOnchainPayment.providerBalanceMap.call('0x0000000000000000000000000000000000000000');
    assert.equal(pDeposit.toNumber(), 80, "provider deposit eth error");
  });

  it("regulator withdraw token", async()=>{
    let res = await myOnchainPayment.providerDeposit(myToken.address, 100, {from: providerAddress});
    let hash = web3.utils.soliditySha3(myOnchainPayment.address, myToken.address, 50, 1000000);
    let pSig = myEcsign(hash, providerPrivateKey);
    res = await myOnchainPayment.regulatorWithdraw(myToken.address, 20, 50, 1000000, pSig, {from: providerAddress});
    let pDeposit = await myOnchainPayment.providerBalanceMap.call(myToken.address);
    assert.equal(pDeposit.toNumber(), 80, "provider deposit eth error");
  });

  it("eth cooperative settle channel", async() =>{
      let res = await myOnchainPayment.openChannel(userAddress, userAddress, 5, '0x0000000000000000000000000000000000000000', 0, {from: userAddress, value: 100});
      let channelID = res.receipt.logs[0].args[6];
      let messageHash = web3.utils.soliditySha3(myOnchainPayment.address, channelID, 1, 9999);
      let psignature = myEcsign(messageHash, providerPrivateKey);
      let rsignature = myEcsign(messageHash, regulatorPrivateKey);
      await myOnchainPayment.providerDeposit('0x0000000000000000000000000000000000000000', 0, {from: providerAddress, value: 19999});
      res = await myOnchainPayment.cooperativeSettle(channelID, 1, 9999, psignature, rsignature, {from: userAddress});
      let channel = await myOnchainPayment.channelMap.call(channelID);
      assert.equal(channel.status.toNumber(), 0, "channel status error");
      res = await myOnchainPayment.openChannel(userAddress, userAddress, 5, '0x0000000000000000000000000000000000000000', 0, {from: userAddress, value: 100});
  });

  it("token cooperative settle channel", async()=>{
    await myOnchainPayment.providerDeposit(myToken.address, 8888, {from: providerAddress});
    let res = await myOnchainPayment.openChannel(userAddress, userAddress, 1, myToken.address, 88, {from: userAddress});
    let channelID = res.receipt.logs[0].args[6];
    let messageHash = web3.utils.soliditySha3(myOnchainPayment.address, channelID, 8, 888);
    let providerSig = myEcsign(messageHash, providerPrivateKey);
    let regulatorSig = myEcsign(messageHash, regulatorPrivateKey);
    res = await myOnchainPayment.cooperativeSettle(channelID, 8, 888, providerSig, regulatorSig, {from: userAddress});
    let channel = await myOnchainPayment.channelMap.call(channelID);
    assert.equal(channel.status.toNumber(), 0, "channel status error");
  });

  // it("eth close and settle channel should success", async()=>{
  //   let res = await myOnchainPayment.openChannel(userAddress, userAddress, 1, '0x0000000000000000000000000000000000000000', 0, {from: userAddress, value: 100});
  //   let channelID = res.receipt.logs[0].args[6];
  //   //console.log(channelID, myOnchainPayment.address);

  //   res = await myOnchainPayment.closeChannel(channelID, 0, 0, "0x0", "0x0", 0, 0, "0x0", "0x0", {from: userAddress});
  //   console.log(res.receipt.logs[0])

  //   await OnchainPayment.new(regulatorAddress, providerAddress, 1, 9, 1, {from: providerAddress});

  //   res = await myOnchainPayment.settleChannel(channelID);

  // });


  // it("token close and settle channel should success", async()=>{
  //   await myToken.approve(myOnchainPayment.address, 888, {from: userAddress});

  //   let res = await myOnchainPayment.openChannel(userAddress, userAddress, 1, myToken.address, 88, {from: userAddress});
  //   let channelID = res.receipt.logs[0].args[6];
  //   console.log(channelID, myOnchainPayment.address);

  //   res = await myOnchainPayment.closeChannel(channelID, 0, 0, "0x0", "0x0", 0, 0, "0x0", "0x0", {from: userAddress});
  //   console.log(res.receipt.logs[0])

  //   let channelData = await myOnchainPayment.channels.call(channelID);
  //   console.log("channel data:", channelData);

  //   await OnchainPayment.new(regulatorAddress, providerAddress, 1, 9, 1, {from: providerAddress});

  //   res = await myOnchainPayment.settleChannel(channelID);

  // });

});