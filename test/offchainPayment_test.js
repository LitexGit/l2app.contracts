const ethUtil = require('ethereumjs-util');
var OffchainPayment = artifacts.require("OffchainPayment");
var Session = artifacts.require("Session");
const abi = require('ethereumjs-abi');
var protobuf = require("protobufjs");
protobuf.common('google/protobuf/descriptor.proto', {})
let rlp = require("rlp");

let { typedData, signHash } = require("./utils/typedData");
const { tEcsign, myEcsign, personalSign } = require("./utils/helper");
const { getPrivateKeys } = require("./utils/keys");

contract('OffchainPayment', (accounts) => {

  console.log('accounts', accounts);

  const providerAddress = accounts[0];
  const regulatorAddress = accounts[1];
  const userAddress = accounts[2];
  const tokenAddress = accounts[3];
  const puppetAddress = accounts[4];
  const puppetAddress2 = accounts[5];
  const puppetAddress3 = accounts[6];
  let providerPrivateKey, regulatorPrivateKey, userPrivateKey;
  before(async () => {
    let keys = await getPrivateKeys();
    providerPrivateKey = keys.providerPrivateKey;
    regulatorPrivateKey = keys.regulatorPrivateKey;
    userPrivateKey = keys.userPrivateKey;
  });

  beforeEach(async ()=>{
    this.offchainPayment = await OffchainPayment.new(providerAddress, providerAddress, regulatorAddress, regulatorAddress, 4, {from: providerAddress});
    typedData.domain.verifyingContract = providerAddress;
    typedData.domain.chainId = 4;
  });

  it("should onchainAddPuppet successfully", async() =>{
    await this.offchainPayment.onchainAddPuppet(userAddress, puppetAddress, {from: regulatorAddress})
    await this.offchainPayment.onchainAddPuppet(userAddress, puppetAddress2, {from: regulatorAddress})
    await this.offchainPayment.onchainAddPuppet(userAddress, puppetAddress3, {from: regulatorAddress})
    let puppetData = await this.offchainPayment.puppets.call(userAddress, 0);
    console.log("puppetData", puppetData);
    puppetData = await this.offchainPayment.puppets.call(userAddress, 1);
    console.log("puppetData", puppetData);

  });
  it("should onchainDisablePuppet successfully", async() => {
    await this.offchainPayment.onchainAddPuppet(userAddress, puppetAddress, {from: regulatorAddress})
    await this.offchainPayment.onchainDisablePuppet(userAddress, puppetAddress, {from: regulatorAddress})
    let puppetData = await this.offchainPayment.puppets.call(userAddress, 0);
    console.log("puppetData", puppetData);
  });

  it("should onchainOpenChannel successfully", async ()=>{
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 10000;
    await this.offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress} );

    let pnData = await this.offchainPayment.paymentNetworkMap.call(tokenAddress)
    //console.log("pyamentNetworkMap data", pnData);
    let channelData = await this.offchainPayment.channelMap.call(channelID);
    //console.log("channelMap data", channelData);
    assert.equal(channelData.user, userAddress, "address should be equal");
    assert.equal(channelData.userDeposit, amount, "amount should be equal");
    assert.equal(channelData.status, 1, "status should be open")
  });


  it("should onchainUserDeposit successfully", async() =>{
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 10000;
    // console.log("channelID is ", channelID);
    await this.offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress} );

    let depositAmount = 10000;
    await this.offchainPayment.onchainUserDeposit( channelID, userAddress, amount + depositAmount, { from: regulatorAddress} );

    let pnData = await this.offchainPayment.paymentNetworkMap.call(tokenAddress)
    // console.log("pyamentNetworkMap data", pnData);
    let channelData = await this.offchainPayment.channelMap.call(channelID);
    // console.log("channelMap data", channelData);

    assert.equal(channelData.userDeposit, amount + depositAmount, "deposit should be equal");
    assert.equal(pnData.userTotalDeposit, amount + depositAmount, "userTotalDeposit shoule be equal");

  });

  it("should onchainProviderDeposit successfully", async()=>{
    let amount = 20000;
    await this.offchainPayment.onchainProviderDeposit(tokenAddress, amount, { from: regulatorAddress});
    let pnData = await this.offchainPayment.paymentNetworkMap.call(tokenAddress)
    assert.equal(pnData.providerDeposit, amount, "providerDeposit shoule be equal");
    assert.equal(pnData.providerBalance, amount, "providerBalance shoule be equal");
  });

  it("should transfer and submit fee successfully", async()=>{
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 100000;
    await this.offchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
    await this.offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress} );
    await this.offchainPayment.setFeeRate(tokenAddress, 1, {from: regulatorAddress});
    let balance = 10000;
    let nonce = 1;
    let additionalHash = channelID;
    typedData.message.channelID = channelID;
    typedData.message.balance = balance;
    typedData.message.nonce = nonce;
    typedData.message.additionalHash = additionalHash;
    let signature = tEcsign(signHash(), userPrivateKey);
    await this.offchainPayment.transfer(providerAddress, channelID, balance, nonce, additionalHash, signature, {from: userAddress});
    let balanceProofData = await this.offchainPayment.arrearBalanceProofMap.call(channelID);
    // console.log("balance proof: ", balanceProofData);
    assert.equal(balanceProofData.nonce.toNumber(), nonce, "nonce should be right");

    amount = 1;
    nonce = 2;
    messageHash = web3.utils.soliditySha3(providerAddress, tokenAddress, amount, nonce);
    signature = myEcsign(messageHash, providerPrivateKey);
    await this.offchainPayment.submitFee(channelID, tokenAddress, amount, nonce, signature, {from: providerAddress});
    let feeProofData = await this.offchainPayment.feeProofMap.call(tokenAddress);
    // console.log("fee proof: ", feeProofData);
    assert.equal(feeProofData.nonce.toNumber(), nonce, "nonce should be right");
  });

  it("should transfer and guard balance proof successfully", async()=>{
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 100000;
    await this.offchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
    await this.offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress} );
    await this.offchainPayment.onchainProviderDeposit(tokenAddress, amount, { from: regulatorAddress});
    amount = 8;
    let nonce = 888;
    let messageHash = web3.utils.soliditySha3(providerAddress, web3.utils.sha3('rebalanceIn'), channelID, amount, nonce);
    let signature = myEcsign(messageHash, providerPrivateKey);
    await this.offchainPayment.proposeRebalance(channelID, amount, nonce, signature, {from: providerAddress});
    signature = myEcsign(messageHash, regulatorPrivateKey);
    await this.offchainPayment.confirmRebalance(messageHash, signature, {from: regulatorAddress});

    let balance = 2;
    nonce = 1;
    let additionalHash = channelID;
    typedData.message.channelID = channelID;
    typedData.message.balance = balance;
    typedData.message.nonce = nonce;
    typedData.message.additionalHash = additionalHash;
    signature = personalSign(signHash(), providerPrivateKey);
    await this.offchainPayment.transfer(userAddress, channelID, balance, nonce, additionalHash, signature, {from: providerAddress});


    messageHash = web3.utils.soliditySha3(providerAddress, channelID, balance, nonce, additionalHash);
    csignature = myEcsign(messageHash, providerPrivateKey);
    let res = await this.offchainPayment.guardBalanceProof(channelID, balance, nonce, additionalHash, signature, csignature, {from: userAddress});
    let balanceProofData = await this.offchainPayment.balanceProofMap.call(channelID, userAddress);
    assert.equal(balanceProofData.consignorSignature, web3.utils.bytesToHex(csignature), "consignorSignature should be right");
  });


  it("should user propose withdraw and confirmed successfully", async()=>{
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 100000;
    await this.offchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
    await this.offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress} );

    amount = 8;
    let receiver = userAddress;
    let lastCommitBlock = 888;
    await this.offchainPayment.userProposeWithdraw(channelID, amount, receiver, lastCommitBlock, {from: userAddress});
    let userWithdrawProofData = await this.offchainPayment.userWithdrawProofMap.call(channelID);

    // console.log("user withdraw proof: ", userWithdrawProofData);
    assert.equal(userWithdrawProofData.lastCommitBlock.toNumber(), lastCommitBlock, "last commit block should be right");

    let messageHash = web3.utils.soliditySha3(providerAddress, channelID, amount, lastCommitBlock);

    let providerSignature = myEcsign(messageHash, providerPrivateKey);
    await this.offchainPayment.confirmUserWithdraw(channelID, providerSignature, {from: providerAddress});
    userWithdrawProofData = await this.offchainPayment.userWithdrawProofMap.call(channelID);
    assert.equal(userWithdrawProofData.providerSignature, web3.utils.bytesToHex(providerSignature), "provider signature should be right");

    let regulatorSignature = myEcsign(messageHash, regulatorPrivateKey);
    await this.offchainPayment.confirmUserWithdraw(channelID, regulatorSignature, {from: regulatorAddress});
    userWithdrawProofData = await this.offchainPayment.userWithdrawProofMap.call(channelID);
    assert.equal(userWithdrawProofData.regulatorSignature, web3.utils.bytesToHex(regulatorSignature), "regulator signature should be right");
    assert.equal(userWithdrawProofData.isConfirmed, true, "is confirmed should be true");
  });


  it("should provider propose withdraw and confirmed successfully", async()=>{
    let amount = 20000;
    await this.offchainPayment.onchainProviderDeposit(tokenAddress, amount, { from: regulatorAddress});
    await this.offchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
    let balance = 8;
    let lastCommitBlock = 888;
    await this.offchainPayment.providerProposeWithdraw(tokenAddress, balance, lastCommitBlock, {from: providerAddress});
    let providerWithdrawProofData = await this.offchainPayment.providerWithdrawProofMap.call(tokenAddress);
    // console.log("provider withdraw proof: ", providerWithdrawProofData);
    assert.equal(providerWithdrawProofData.amount.toNumber(), balance, "balance should be right");

    let messageHash = web3.utils.soliditySha3(providerAddress, tokenAddress, balance, lastCommitBlock);
    let signature = myEcsign(messageHash, regulatorPrivateKey);
    await this.offchainPayment.confirmProviderWithdraw(tokenAddress, signature, {from: regulatorAddress});
    providerWithdrawProofData = await this.offchainPayment.providerWithdrawProofMap.call(tokenAddress);
    // console.log("provider withdraw proof: ", providerWithdrawProofData);
    assert.equal(providerWithdrawProofData.signature, web3.utils.bytesToHex(signature), "signature should be right");
  });

  it("should propose cooperative settle and confirmed successfully", async()=>{ 
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 100000;
    await this.offchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
    await this.offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress} );
    let balance = 8;
    let lastCommitBlock = 888;
    await this.offchainPayment.proposeCooperativeSettle(channelID, balance, lastCommitBlock, {from: userAddress});
    let cooperativeSettleProofData = await this.offchainPayment.cooperativeSettleProofMap.call(channelID);
    // console.log("cooperative settle proof data: ", cooperativeSettleProofData);
    assert.equal(cooperativeSettleProofData.lastCommitBlock.toNumber(),  lastCommitBlock, "last commit block should be right");

    let messageHash = web3.utils.soliditySha3(providerAddress, channelID, balance, lastCommitBlock);
    let providerSignature = myEcsign(messageHash, providerPrivateKey);
    await this.offchainPayment.confirmCooperativeSettle(channelID, providerSignature, {from: providerAddress});
    cooperativeSettleProofData = await this.offchainPayment.cooperativeSettleProofMap.call(channelID);
    assert.equal(cooperativeSettleProofData.providerSignature, web3.utils.bytesToHex(providerSignature));

    let regulatorSignature = myEcsign(messageHash, regulatorPrivateKey);
    await this.offchainPayment.confirmCooperativeSettle(channelID, regulatorSignature, {from: regulatorAddress});
    cooperativeSettleProofData = await this.offchainPayment.cooperativeSettleProofMap.call(channelID);
    assert.equal(cooperativeSettleProofData.regulatorSignature, web3.utils.bytesToHex(regulatorSignature));
    assert.equal(cooperativeSettleProofData.isConfirmed, true);
  });

  it("should proposeRebalance successfully", async()=>{
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 100000;
    await this.offchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
    await this.offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress} );

    amount = 20000;
    await this.offchainPayment.onchainProviderDeposit(tokenAddress, amount, { from: regulatorAddress});


    amount = 8;
    let nonce = 888;
    let messageHash = web3.utils.soliditySha3(providerAddress, web3.utils.sha3('rebalanceIn'), channelID, amount, nonce);
    let signature = myEcsign(messageHash, providerPrivateKey);
    await this.offchainPayment.proposeRebalance(channelID, amount, nonce, signature, {from: providerAddress});
    let rebalanceProofData = await this.offchainPayment.proposeRebalanceProofMap.call(messageHash);

    // console.log("rebalance proof data: ", rebalanceProofData);
    assert.equal(rebalanceProofData.nonce.toNumber(), nonce);
    assert.equal(rebalanceProofData.providerSignature, web3.utils.bytesToHex(signature));

    signature = myEcsign(messageHash, regulatorPrivateKey);
    await this.offchainPayment.confirmRebalance(messageHash, signature, {from: regulatorAddress});
    rebalanceProofData = await this.offchainPayment.rebalanceProofMap.call(channelID);

    // console.log("rebalance proof data after confirmed: ", rebalanceProofData);
    assert.equal(rebalanceProofData.regulatorSignature, web3.utils.bytesToHex(signature));
  });


  it("should onchainUserWithdraw successfully", async() => {
    await this.offchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
      let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
      let amount = 10000;
      // console.log("channelID is ", channelID);
      await this.offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress} );

      let withdrawAmount = 100;
      let lastCommitBlock = await web3.eth.getBlockNumber();
      await this.offchainPayment.onchainUserWithdraw(channelID, withdrawAmount, withdrawAmount, lastCommitBlock, { from: regulatorAddress});



      let pnData = await this.offchainPayment.paymentNetworkMap.call(tokenAddress)
      // console.log("pyamentNetworkMap data", pnData);
      let channelData = await this.offchainPayment.channelMap.call(channelID);
      // console.log("channelMap data", channelData);

      // assert.equal(channelData.userBalance.toNumber(), amount - withdrawAmount, "userBalance should be equal");
      // assert.equal(channelData.userWithdraw, withdrawAmount, "userWithdraw should be equal");
      assert.equal(pnData.userTotalWithdraw, withdrawAmount, "userTotalWithdraw shoule be equal");

  });


  it("should onchainCooperativeSettleChannel successfully", async()=>{
    await this.offchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 10000;
    // console.log("channelID is ", channelID);
    await this.offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress} );
    
    let balance = 1000;
    let lastCommitBlock = 888;
    await this.offchainPayment.proposeCooperativeSettle(channelID, 1000, 888, {from: userAddress});
    let messageHash = web3.utils.soliditySha3(providerAddress, channelID, balance, lastCommitBlock);
    let providerSignature = myEcsign(messageHash, providerPrivateKey);
    await this.offchainPayment.confirmCooperativeSettle(channelID, providerSignature, {from: providerAddress});
    let regulatorSignature = myEcsign(messageHash, regulatorPrivateKey);
    await this.offchainPayment.confirmCooperativeSettle(channelID, regulatorSignature, {from: regulatorAddress});

    await this.offchainPayment.onchainCooperativeSettleChannel(channelID, userAddress, balance, 9000, lastCommitBlock, { from: regulatorAddress});


      let pnData = await this.offchainPayment.paymentNetworkMap.call(tokenAddress)
      // console.log("pyamentNetworkMap data", pnData);
      let channelData = await this.offchainPayment.channelMap.call(channelID);
      // console.log("channelMap data", channelData);

      assert.equal(channelData.status, 3, "channel status should be equal");
      assert.equal(pnData.providerTotalSettled.toNumber(), amount - balance, "providerTotalSettled shoule be equal");
      assert.equal(pnData.providerBalance.toNumber(), amount - balance, "providerBalance shoule be equal");

  });

  it("should onchain force close channel successfully", async() => {

    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 10000;
    // console.log("channelID is ", channelID);
    await this.offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress} );

    await this.offchainPayment.onchainCloseChannel(channelID, userAddress, 20000, 1, 10000, { from: regulatorAddress});

    await this.offchainPayment.onchainPartnerUpdateProof(channelID,  20000, 1, 5000, 1, { from: regulatorAddress});

    await this.offchainPayment.onchainSettleChannel(channelID, 5000, 5000, { from: regulatorAddress});

    let closingData = await this.offchainPayment.closingChannelMap.call(channelID);
    console.log("closingData", closingData);

  });



})
