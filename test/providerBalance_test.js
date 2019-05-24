// 1. provider deposit 10000, rebalance in channel 1000, send 100 to user;(assert userBalance=1100, providerBalance=900)
// 2. set feeRate=1/10000, user deposit 1000, send 500 to provider;(assert userBalance=600, providerChannelBalance=1400)
// 3. provider withdraw 200;(assert providerWithdraw=200, providerOffchainBalance=8795)
// 4. user cooperative settle;(assert channel status=4)
// 5. user onchain cooperative settle;(assert provider balance=10195)

const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
let OffchainPayment = artifacts.require("offchainPayment");

const { getPrivateKeys } = require("./utils/keys");

let { typedData, signHash } = require("./utils/typedData");
const { tEcsign, myEcsign, personalSign } = require("./utils/helper");


  contract('offchain payment', async(accounts)=>{
    const providerAddress = accounts[0];
    const regulatorAddress = accounts[1];
    const userAddress = accounts[2];
    const tokenAddress = accounts[3];

    const channelID = web3.utils.soliditySha3("channelID");
    let myOffchainPayment;
    let providerPrivateKey, regulatorPrivateKey, userPrivateKey;
    before(async () => {
      let keys = await getPrivateKeys();
      providerPrivateKey = keys.providerPrivateKey;
      regulatorPrivateKey = keys.regulatorPrivateKey;
      userPrivateKey = keys.userPrivateKey;
  

        myOffchainPayment = await OffchainPayment.new(providerAddress, providerAddress, regulatorAddress, regulatorAddress, 4, {from: providerAddress});
        typedData.domain.verifyingContract = providerAddress;
        typedData.domain.chainId = 4;
    });

    it("1", async()=>{
        let amount = 1000;
        await myOffchainPayment.onchainOpenChannel(userAddress, tokenAddress, channelID, amount, { from: regulatorAddress});
        await myOffchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
        amount = 10000;
        await myOffchainPayment.onchainProviderDeposit(tokenAddress, amount, { from: regulatorAddress});
        let messageHash = web3.utils.soliditySha3(providerAddress, web3.utils.sha3('rebalanceIn'), channelID, 1000, 1);
        let signature = myEcsign(messageHash, providerPrivateKey);
        await myOffchainPayment.proposeRebalance(channelID, 1000, 1, signature, {from: providerAddress});
        signature = myEcsign(messageHash, regulatorPrivateKey);
        await myOffchainPayment.confirmRebalance(messageHash, signature, {from: regulatorAddress});

        typedData.message.channelID = channelID;
        typedData.message.balance = 100;
        typedData.message.nonce = 1;
        typedData.message.additionalHash = channelID;
        let paySig = tEcsign(signHash(), providerPrivateKey);
        await myOffchainPayment.transfer(userAddress, channelID, 100, 1, channelID, paySig);
        let res = await myOffchainPayment.channelMap.call(channelID);
        assert.equal(res.userBalance.toNumber(), 1100, "error: user balance");
        assert.equal(res.providerBalance.toNumber(), 900, "error: provider balance");
        //console.log("1111111111111111", res);
    })

    it("2", async()=>{
        await myOffchainPayment.setFeeRate(tokenAddress, 100, {from: regulatorAddress});
        typedData.message.channelID = channelID;
        typedData.message.balance = 500;
        typedData.message.nonce = 1;
        typedData.message.additionalHash = channelID;
        let paySig = tEcsign(signHash(), userPrivateKey);
        await myOffchainPayment.transfer(providerAddress, channelID, 500, 1, channelID, paySig);
        let messageHash = web3.utils.soliditySha3(providerAddress, tokenAddress, 5, 1);
        let sig = myEcsign(messageHash, providerPrivateKey);
        await myOffchainPayment.submitFee(channelID, tokenAddress, 5, 1, sig, {from: providerAddress});
        let res = await myOffchainPayment.channelMap.call(channelID);
        assert.equal(res.userBalance.toNumber(), 600, "error: user balance");
        assert.equal(res.providerBalance.toNumber(), 1400, "error: provider balance");
        //console.log("22222222222222222", res);
    })

    it("3", async()=>{
        await myOffchainPayment.providerProposeWithdraw(tokenAddress, 200, 888, {from: providerAddress});
        let messageHash = web3.utils.soliditySha3(providerAddress, tokenAddress, 200, 888);
        let signature = myEcsign(messageHash, regulatorPrivateKey);
        await myOffchainPayment.confirmProviderWithdraw(tokenAddress, signature);
        await myOffchainPayment.onchainProviderWithdraw(tokenAddress, 200, 9800, 888, {from: regulatorAddress});
        let res = await myOffchainPayment.paymentNetworkMap.call(tokenAddress);
        //console.log("3", res);
        assert.equal(res.providerWithdraw.toNumber(), 200, "error: provider withdraw");
        assert.equal(res.providerBalance.toNumber(), 8795, "error: provider balance");
    })

    it("4", async()=>{
        await myOffchainPayment.proposeCooperativeSettle(channelID, 600, 888, {from: userAddress});
        let messageHash = web3.utils.soliditySha3(providerAddress, channelID, 600, 888);
        let sig = myEcsign(messageHash, providerPrivateKey);
        await myOffchainPayment.confirmCooperativeSettle(channelID, sig, {from: providerAddress});
        sig = myEcsign(messageHash, regulatorPrivateKey);
        await myOffchainPayment.confirmCooperativeSettle(channelID, sig, {from: regulatorAddress});
        let res = await myOffchainPayment.channelMap.call(channelID);
        assert.equal(res.status, 4, "error: channel status");
    })

    it("5", async()=>{
        await myOffchainPayment.onchainCooperativeSettleChannel(channelID, userAddress, 600, 400, 888, {from: regulatorAddress});
        let res = await myOffchainPayment.paymentNetworkMap.call(tokenAddress);
        //console.log(res);
        assert.equal(res.providerBalance.toNumber(), 10195, "error: providerBalance");
    })
  });