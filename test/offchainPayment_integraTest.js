/**
 * 1. 用户协商关请求提交成功后，针对该通道的transfer以及withdraw请求将无法提交
    2. 用户协商关请求提交成功后，超过指定的lastCommitBlock后，可以调用相应的unlock进行解锁
    3. 用户取现请求提交后，用户马上进行转账操作(转账金额位于【取现成功后金额，取现前余额】之间)，provider/regulator提交审核时应该不予通过
    4. 用户取现请求提交成功后，超过指定的lastCommitBlock后，可以调用响应的unlock进行解锁
    5. 手续费测试：用户和CP在通道余额均为10，用户转账5，provider未提交submitFee，provider提交给用户转账12的请求，请求被合约revert
    6. 手续费率设置测试，regulator有权限修改当前系统的手续费率，支付合约中每个token对应一个手续费率
    regulator设置当前手续费率为0.001, 用户给CP转账1后（CP提交submitFee），regulator更改当前手续费为0.002, 用户再给CP转账1后（CP提交submitFee），此时收到的总手续费应该为 1*0.001 + 1*0.002 = 0.003
 */
const { expectRevert } = require('openzeppelin-test-helpers');
const ethUtil = require('ethereumjs-util');
const BigNumber = web3.BigNumber;
var OffchainPayment = artifacts.require("offchainPayment");
var offchainPayment;
var Session = artifacts.require("Session");
const abi = require('ethereumjs-abi');
var protobuf = require("protobufjs");
protobuf.common('google/protobuf/descriptor.proto', {})
let rlp = require("rlp");

let {typedData, signHash} = require('./utils/typedData');
const { getPrivateKeys } = require("./utils/keys");


const { tEcsign, myEcsign, personalSign } = require("./utils/helper");


contract('offchain payment', (accounts) => {
  const providerAddress = accounts[0];
  const regulatorAddress = accounts[1];
  const userAddress = accounts[2];
  const tokenAddress = accounts[3];

  let providerPrivateKey, regulatorPrivateKey, userPrivateKey;

  before(async () => {
    let keys = await getPrivateKeys();
    providerPrivateKey = keys.providerPrivateKey;
    regulatorPrivateKey = keys.regulatorPrivateKey;
    userPrivateKey = keys.userPrivateKey;
  });

  beforeEach(async ()=>{
    offchainPayment = await OffchainPayment.new(providerAddress, providerAddress, regulatorAddress, regulatorAddress, 4, {from: providerAddress});
    typedData.domain.verifyingContract = providerAddress;
    typedData.domain.chainId = 4;
  });


  it("integration 1 should success", async ()=>{
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 100000;
    offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress});
    await offchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
    let balance = 8;
    let lastCommitBlock = 888;
    await offchainPayment.proposeCooperativeSettle(channelID, balance, lastCommitBlock, {from: userAddress});
    let messageHash = web3.utils.soliditySha3(providerAddress, channelID, balance, lastCommitBlock);
    let providerSignature = myEcsign(messageHash, providerPrivateKey);
    await offchainPayment.confirmCooperativeSettle(channelID, providerSignature, {from: providerAddress});
    let regulatorSignature = myEcsign(messageHash, regulatorPrivateKey);
    await offchainPayment.confirmCooperativeSettle(channelID, regulatorSignature, {from: regulatorAddress});

    balance = 1;
    let nonce = 1;
    let additionalHash = channelID;
    typedData.message.channelID = channelID;
    typedData.message.balance = 1;
    typedData.message.nonce = 1;
    typedData.message.additionalHash = additionalHash;
    let signature = tEcsign(signHash(), userPrivateKey);
    expectRevert(offchainPayment.transfer(providerAddress, channelID, balance, nonce, additionalHash, signature, {from: userAddress}), 'channel should be open');
    // amount = 1;
    // let receiver = userAddress;
    // lastCommitBlock = 888;
    // await offchainPayment.userProposeWithdraw(channelID, amount, receiver, lastCommitBlock, {from: userAddress});
  });

  it("integration 2 should success", async()=>{
    await offchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 100000;
    offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress});
    let balance = 8;
    let lastCommitBlock = 888;
    await offchainPayment.proposeCooperativeSettle(channelID, balance, lastCommitBlock, {from: userAddress});
    let messageHash = web3.utils.soliditySha3(providerAddress, channelID, balance, lastCommitBlock);
    let providerSignature = myEcsign(messageHash, providerPrivateKey);
    await offchainPayment.confirmCooperativeSettle(channelID, providerSignature, {from: providerAddress});
    let regulatorSignature = myEcsign(messageHash, regulatorPrivateKey);
    await offchainPayment.confirmCooperativeSettle(channelID, regulatorSignature, {from: regulatorAddress});

    // await offchainPayment.unlockCooperativeSettle(channelID);
    // let channelData = await offchainPayment.channelMap.call(channelID);
    // assert.equal(channelData.status.toNumber(), 1, "channel status should be recovered"); 
  })

  it("integration 3 should success", async ()=>{
    await offchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 100000;
    offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress});

    amount = 100;
    let receiver = userAddress;
    let lastCommitBlock = 888;
    await offchainPayment.userProposeWithdraw(channelID, amount, receiver, lastCommitBlock, {from: userAddress});

    let messageHash = web3.utils.soliditySha3(providerAddress, channelID, amount, lastCommitBlock);
    let providerSignature = myEcsign(messageHash, providerPrivateKey);
    await offchainPayment.confirmUserWithdraw(channelID, providerSignature, {from: providerAddress});
    let regulatorSignature = myEcsign(messageHash, regulatorPrivateKey);
    await offchainPayment.confirmUserWithdraw(channelID, regulatorSignature, {from: regulatorAddress});

    // let channelData = await offchainPayment.channelMap.call(channelID);
    // console.log("vvv", channelData.userBalance.toNumber());

    let balance = 99999;
    let nonce = 1;
    let additionalHash = channelID;
    // messageHash = web3.utils.soliditySha3(providerAddress, channelID, balance, nonce, additionalHash);
    typedData.message.channelID = channelID;
    typedData.message.balance = balance;
    typedData.message.nonce = nonce;
    typedData.message.additionalHash = additionalHash;
    let signature = tEcsign(signHash(), userPrivateKey);
    await expectRevert(offchainPayment.transfer(providerAddress, channelID, balance, nonce, additionalHash, signature, {from: userAddress}), 'user insufficient funds');

  });

  it("integration 4 should be success", async ()=> {
    await offchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 100000;
    offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress});

    amount = 100;
    let receiver = userAddress;
    let lastCommitBlock = 888;
    await offchainPayment.userProposeWithdraw(channelID, amount, receiver, lastCommitBlock, {from: userAddress});

    let messageHash = web3.utils.soliditySha3(providerAddress, channelID, amount, lastCommitBlock);
    let providerSignature = myEcsign(messageHash, providerPrivateKey);
    await offchainPayment.confirmUserWithdraw(channelID, providerSignature, {from: providerAddress});
    let regulatorSignature = myEcsign(messageHash, regulatorPrivateKey);
    await offchainPayment.confirmUserWithdraw(channelID, regulatorSignature, {from: regulatorAddress});

    // await offchainPayment.unlockUserWithdrawProof(channelID);

    // let channelData = await offchainPayment.channelMap.call(channelID);
    // assert.equal(channelData.userBalance.toNumber(), 100000, "unlock failed");
  })

  it("integration 5 should success", async ()=> {
    await offchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 10;
    offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress});
    amount = 20000;
    await offchainPayment.onchainProviderDeposit(tokenAddress, amount, { from: regulatorAddress});

    amount = 10;
    let nonce = 888;
    let messageHash = web3.utils.soliditySha3(providerAddress, web3.utils.sha3('rebalanceIn'), channelID, amount, nonce);
    let signature = myEcsign(messageHash, providerPrivateKey);
    await offchainPayment.proposeRebalance(channelID, amount, nonce, signature, {from: providerAddress});
    signature = myEcsign(messageHash, regulatorPrivateKey);
    await offchainPayment.confirmRebalance(messageHash, signature, {from: regulatorAddress});

    await offchainPayment.setFeeRate(tokenAddress, 1, {from: regulatorAddress});

    // let channelData = await offchainPayment.channelMap.call(channelID);
    // console.log("vvv", channelData.providerBalance.toNumber());

    let balance = 5;
    nonce = 1;
    let additionalHash = channelID;
    // messageHash = web3.utils.soliditySha3(providerAddress, channelID, balance, nonce, additionalHash);

    typedData.message.channelID = channelID;
    typedData.message.balance = balance;
    typedData.message.nonce = nonce;
    typedData.message.additionalHash = additionalHash;
    signature = tEcsign(signHash(), userPrivateKey);
    await offchainPayment.transfer(providerAddress, channelID, balance, nonce, additionalHash, signature, {from: userAddress});

    balance = 12;
    nonce = 1;
    additionalHash = channelID;
    typedData.message.channelID = channelID;
    typedData.message.balance = balance;
    typedData.message.nonce = nonce;
    typedData.message.additionalHash = additionalHash;
    signature = tEcsign(signHash(), userPrivateKey);
    expectRevert(offchainPayment.transfer(userAddress, channelID, balance, nonce, additionalHash, signature, {from: providerAddress}), 'user insufficient funds');
  })

  it("integration 6 should success", async()=>{
    await offchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 1000000;
    offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress});

    // amount = 20000;
    // await offchainPayment.onchainProviderDeposit(tokenAddress, amount, { from: regulatorAddress});

    // amount = 10;
    // let nonce = 888;
    // let messageHash = web3.utils.soliditySha3(providerAddress, channelID, amount, nonce);
    // let signature = myEcsign(messageHash, providerPrivateKey);
    // await offchainPayment.proposeRebalance(channelID, amount, nonce, signature, {from: providerAddress});
    // signature = myEcsign(messageHash, regulatorPrivateKey);
    // await offchainPayment.confirmRebalance(messageHash, signature, {from: regulatorAddress});

    // let channelData = await offchainPayment.channelMap.call(channelID);
    // console.log("vvv", channelData.providerBalance.toNumber());

    await offchainPayment.setFeeRate(tokenAddress, 1, {from: regulatorAddress});

    let balance = 10000;
    nonce = 1;
    let additionalHash = channelID;
    typedData.message.channelID = channelID;
    typedData.message.balance = balance;
    typedData.message.nonce = nonce;
    typedData.message.additionalHash = additionalHash;
    signature = tEcsign(signHash(), userPrivateKey);
    await offchainPayment.transfer(providerAddress, channelID, balance, nonce, additionalHash, signature, {from: userAddress});

    let feeData = await offchainPayment.feeProofMap.call(tokenAddress);
    console.log("vv fee amount", feeData.amount.toNumber());

    messageHash = web3.utils.soliditySha3(providerAddress, tokenAddress, 1, 1);
    signature = myEcsign(messageHash, providerPrivateKey);   
    await offchainPayment.submitFee(channelID, tokenAddress, 1, 1, signature);

    await offchainPayment.setFeeRate(tokenAddress, 2, {from: regulatorAddress});

    balance = 20000;
    nonce = 2;
    additionalHash = channelID;
    typedData.message.channelID = channelID;
    typedData.message.balance = balance;
    typedData.message.nonce = nonce;
    typedData.message.additionalHash = additionalHash;
    signature = tEcsign(signHash(), userPrivateKey);
    await offchainPayment.transfer(providerAddress, channelID, balance, nonce, additionalHash, signature, {from: userAddress});

    messageHash = web3.utils.soliditySha3(providerAddress, tokenAddress, 3, 2);
    signature = myEcsign(messageHash, providerPrivateKey);   
    await offchainPayment.submitFee(channelID, tokenAddress, 3, 2, signature);
  })

})
