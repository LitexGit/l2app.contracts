const ethUtil = require('ethereumjs-util');
const { expectRevert, time } = require('openzeppelin-test-helpers');
var OnchainPayment = artifacts.require("OnchainPayment");
var LiteXToken = artifacts.require("LiteXToken");
var TetherToken = artifacts.require("TetherToken");

const { tEcsign, myEcsign, personalSign } = require("./utils/helper");
const { getPrivateKeys } = require("./utils/keys");
let { typedData, signHash } = require("./utils/typedData");

contract('OnchainPayment', (accounts) => {
  const providerAddress = accounts[0];
  const regulatorAddress = accounts[1];
  const userAddress = accounts[2];
  let myOnchainPayment;
  let myToken;
  let providerPrivateKey, regulatorPrivateKey, userPrivateKey;
  before(async () => {
    let keys = await getPrivateKeys();
    providerPrivateKey = keys.providerPrivateKey;
    regulatorPrivateKey = keys.regulatorPrivateKey;
    userPrivateKey = keys.userPrivateKey;
  });

  beforeEach(async ()=>{
    myOnchainPayment = await OnchainPayment.new(regulatorAddress, providerAddress, 1, 9, 1, {from: providerAddress});
    typedData.domain.verifyingContract = myOnchainPayment.address;
    typedData.domain.chainId = 1;
    myToken = await LiteXToken.new({from: userAddress});
    // myToken = await TetherToken.new(100000000*10**6, 'TetherToken', 'USDT', 6, {from: userAddress});
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

  // it("user withdraw eth", async()=>{
  //   let res = await myOnchainPayment.openChannel(userAddress, userAddress, 5, '0x0000000000000000000000000000000000000000', 0, {from: userAddress, value: 100});
  //   let channelID = res.receipt.logs[0].args[6];
  //   res = await myOnchainPayment.userDeposit(channelID, 0, {value: 100});
  //   let hash = web3.utils.soliditySha3(myOnchainPayment.address, channelID, 80, 1000000);
  //   let pSig = myEcsign(hash, providerPrivateKey);
  //   let rSig = myEcsign(hash, regulatorPrivateKey);
  //   res = await myOnchainPayment.userWithdraw(channelID, 80, 1000000, pSig, rSig, userAddress, {from: userAddress});
  //   let channel = await myOnchainPayment.channelMap.call(channelID);
  //   assert.equal(channel.withdraw.toNumber(), 80, "channel withdraw error");
  // });

  // it("user withdraw token", async()=>{
  //   let res = await myOnchainPayment.openChannel(userAddress, userAddress, 5, myToken.address, 100, {from: userAddress});
  //   let channelID = res.receipt.logs[0].args[6];
  //   res = await myOnchainPayment.userDeposit(channelID, 100, {from: userAddress});
  //   let hash = web3.utils.soliditySha3(myOnchainPayment.address, channelID, 80, 1000000);
  //   let pSig = myEcsign(hash, providerPrivateKey);
  //   let rSig = myEcsign(hash, regulatorPrivateKey);
  //   res = await myOnchainPayment.userWithdraw(channelID, 80, 1000000, pSig, rSig, userAddress, {from: userAddress});
  //   let channel = await myOnchainPayment.channelMap.call(channelID);
  //   assert.equal(channel.withdraw.toNumber(), 80, "channel withdraw error");
  // });

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
    let messageHash = web3.utils.soliditySha3(myOnchainPayment.address, channelID, 8, 888888);
    let providerSig = myEcsign(messageHash, providerPrivateKey);
    let regulatorSig = myEcsign(messageHash, regulatorPrivateKey);
    res = await myOnchainPayment.cooperativeSettle(channelID, 8, 888888, providerSig, regulatorSig, {from: userAddress});
    let channel = await myOnchainPayment.channelMap.call(channelID);
    assert.equal(channel.status.toNumber(), 0, "channel status error");
  });

  it("eth close and settle channel should success", async()=>{
    let depositAmount = 100;
    let res = await myOnchainPayment.openChannel(userAddress, userAddress, 1, '0x0000000000000000000000000000000000000000', depositAmount, {from: userAddress, value: depositAmount});
    let channelID = res.receipt.logs[0].args[6];
    //console.log(channelID, myOnchainPayment.address);

    res = await myOnchainPayment.closeChannel(channelID, 0, 0, "0x0", "0x0", 0, 0, "0x0", "0x0", {from: userAddress});
    // console.log(res.receipt.logs[0])

    await time.advanceBlock();

    res = await myOnchainPayment.settleChannel(channelID);
    // console.log(res.receipt.logs[0]);

    let { args: event } = res.receipt.logs[0];
    assert.equal(event.transferToUserAmount.toNumber(), depositAmount);
    assert.equal(event.providerRegain.toNumber(), 0);

  });

  async function tokenForceClose(userDeposit, providerDeposit, userTransferredAmount, providerTransferredAmount, rebalanceInAmount){
    let res = await myOnchainPayment.openChannel(userAddress, userAddress, 2, myToken.address, userDeposit, {from: userAddress, value: 0,});
    if(providerDeposit > 0){
      await myOnchainPayment.providerDeposit(myToken.address, providerDeposit, {from: providerAddress});
    }
    let channelID = res.receipt.logs[0].args.channelID;
    //console.log(channelID, myOnchainPayment.address);
    let additionalHash = '0x0'

    //Build provider's transfer message
    let providerTransferredNonce = 0; 
    let providerSignature = '0x0'; 
    if(providerTransferredAmount > 0){
      providerTransferredNonce = 1;
      typedData.message.channelID = channelID;
      typedData.message.balance = providerTransferredAmount;
      typedData.message.nonce = providerTransferredNonce;
      typedData.message.additionalHash = additionalHash;
      providerSignature = web3.utils.bytesToHex(tEcsign(signHash(), providerPrivateKey));
    }
    //Build rebalanceIn message
    let rebalanceInNonce = 0;
    let inProviderSignature = '0x0';
    let inRegulatorSignature = '0x0';
    if(rebalanceInAmount > 0){
      rebalanceInNonce = 1;
      let flag = web3.utils.soliditySha3({v: 'rebalanceIn', t: 'string'});
      let mHash = web3.utils.soliditySha3(
        {v: myOnchainPayment.address, t:'address'}, 
        {v: flag, t: 'bytes32'},
        {v: channelID, t: 'bytes32'}, 
        {v: rebalanceInAmount, t: 'uint256'},
        {v: rebalanceInNonce, t: 'uint256'});
      inProviderSignature = myEcsign(mHash, providerPrivateKey);
      inRegulatorSignature = myEcsign(mHash, regulatorPrivateKey); 

    }


    res = await myOnchainPayment.closeChannel(channelID, providerTransferredAmount, providerTransferredNonce, additionalHash, providerSignature, rebalanceInAmount, rebalanceInNonce,  inRegulatorSignature, inProviderSignature, {from: userAddress});

    // Build user's transfer message
    let userTransferredNonce = 0;
    let userSignature = '0x0';
    let consignorSignature = '0x0';
    if(userTransferredAmount > 0){
      userTransferredNonce = 1;
      typedData.message.channelID = channelID;
      typedData.message.balance = userTransferredAmount;
      typedData.message.nonce = userTransferredNonce;
      typedData.message.additionalHash = additionalHash;
      userSignature = web3.utils.bytesToHex(tEcsign(signHash(), userPrivateKey));
      let messageHash = web3.utils.soliditySha3(myOnchainPayment.address, channelID, userTransferredAmount, userTransferredNonce, {v: additionalHash, t: 'bytes32'}, {v: userSignature, t: 'bytes'});
      consignorSignature = myEcsign(messageHash, providerPrivateKey);
    }

    res = await myOnchainPayment.partnerUpdateProof(channelID, userTransferredAmount, userTransferredNonce, additionalHash, userSignature, consignorSignature, {from: providerAddress});

    await time.advanceBlock();
    await time.advanceBlock();

    res = await myOnchainPayment.settleChannel(channelID);
    // console.log(res.receipt.logs[0]);
    let {args: event} = res.receipt.logs[0];
    
    let channelTotal = userDeposit + rebalanceInAmount;
    let userSettleAmount = userDeposit + providerTransferredAmount - userTransferredAmount;
    userSettleAmount = Math.min(channelTotal, userSettleAmount);
    userSettleAmount = Math.max(0, userSettleAmount);
    let providerRegainAmount = userDeposit - userSettleAmount;

    assert.equal(event.transferToUserAmount.toNumber(), userSettleAmount);
    assert.equal(event.providerRegain.toNumber(), providerRegainAmount);
  }

  it("token close and settle channel should success", async()=>{
    await tokenForceClose(1000, 100, 10, 5, 0);
  });

  it("token close and settle channel with big userTransferAmount should success", async()=>{
    await tokenForceClose(1000, 100, 10001, 1, 0);
  });

  it("token close and settle channel with big rebalanceInAmount should success", async()=>{
    await tokenForceClose(1000, 10000, 10, 10005, 10000);
  });

  it("token close and settle channel with big ProviderTransferAmount should success", async()=>{
    await tokenForceClose(1000, 100, 10001, 20001, 10);
  });

  it("token close and settle channel with RebalanceMsg should success", async()=>{
    await tokenForceClose(1000, 100, 10001, 0, 10000);
  });

  // it("token and eth should be return to owner when contract kill", async()=> {

  //   await myOnchainPayment.openChannel(userAddress, userAddress, 5, '0x0000000000000000000000000000000000000000', 0, {from: userAddress, value: 1e16});
  //   let res = await myOnchainPayment.openChannel(userAddress, userAddress, 5, myToken.address, 100, {from: userAddress});
  //   let channelID = res.receipt.logs[0].args[6];
  //   res = await myOnchainPayment.userDeposit(channelID, 100, {from: userAddress});
  //   let channel = await myOnchainPayment.channelMap.call(channelID);
  //   assert.equal(channel.deposit.toNumber(), 200, "channel deposit error");

  //   let beforeBalance = await myToken.balanceOf(providerAddress, {from: providerAddress});
  //   let beforeProviderEthBalance = await web3.eth.getBalance(providerAddress);
  //   res = await myOnchainPayment.kill({from: providerAddress});

  //   let afterBalance = await myToken.balanceOf(providerAddress, {from: providerAddress});
  //   let contractTokenBalance = await myToken.balanceOf(myOnchainPayment.address, {from: providerAddress});
  //   let contractEthBalance = await web3.eth.getBalance(myOnchainPayment.address);
  //   let afterProviderEthBalance = await web3.eth.getBalance(providerAddress);

  //   console.log(beforeBalance, afterBalance, contractTokenBalance, contractEthBalance);
  //   console.log(beforeProviderEthBalance, afterProviderEthBalance);


  // })

});