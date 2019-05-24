const ethUtil = require('ethereumjs-util');
const BN = require('bn.js');
const BigNumber = web3.BigNumber;
var OffchainPayment = artifacts.require("OffchainPayment");
var Session = artifacts.require("Session");
const abi = require('ethereumjs-abi');
var protobuf = require("protobufjs");
protobuf.common('google/protobuf/descriptor.proto', {})
let rlp = require("rlp");
let { typedData, signHash } = require("./utils/typedData");
const { tEcsign, myEcsign, personalSign } = require("./utils/helper");
const { getPrivateKeys, getPuppetAccounts } = require("./utils/keys");

  async function sessionTransfer(channelID, balance, nonce, amount, additionalHash) {
    let transferPB = await protobuf.load("/Users/vincent/Develop/l2ContractTruffle/contracts/proto/transfer.proto");
    let Transfer = transferPB.lookupType("TransferData.Transfer");
    // let payload = {channelID: web3.utils.hexToBytes(channelID), balance: web3.utils.hexToBytes(web3.utils.toHex(balance)), nonce: web3.utils.hexToBytes(web3.utils.toHex(nonce)), amount: web3.utils.hexToBytes(web3.utils.toHex(amount)), additionalHash: web3.utils.hexToBytes(additionalHash)};
    let payload = {channelID: web3.utils.hexToBytes(channelID), balance: balance, nonce: nonce, amount: amount, additionalHash: web3.utils.hexToBytes(additionalHash)};
    let errMsg = Transfer.verify(payload);
    if (errMsg)
        throw Error(errMsg);
    let message = Transfer.create(payload); // or use .fromObject if conversion is necessary
    return Transfer.encode(message).finish().toJSON().data;
  }

  function rlpEncodePayment(channelID, balance, nonce, amount, additionalHash, signature) {
    let paymentData = [channelID, web3.utils.toHex(balance), nonce, amount, additionalHash, web3.utils.bytesToHex(signature)];
    return '0x' + rlp.encode(paymentData).toString('hex');
  }

    // mType=1
  function rlpEncodeProviderRandomHash(prHash, token, amount) {
    let data = [prHash, token, web3.utils.toHex(amount)];
    return '0x' + rlp.encode(data).toString('hex');
  }

  // mType=2
  function rlpEncodeUserRandomHash(urHash) {
    let data = [urHash];
    return '0x' + rlp.encode(data).toString('hex');
  }
  // mType=3
  function rlpEncodeUserHashReady(user1, user2, user3, user4, user5) {
    let data = [user1, user2, user3, user4, user5];
    return '0x' + rlp.encode(data).toString('hex');
  }

  // mType=4
  function rlpEncodeProviderRevealRandom(random1, random2, random3, random4, random5) {
    let data = [random1, random2, random3, random4, random5];
    return '0x' + rlp.encode(data).toString('hex');
  }
  // mType=5
  function rlpEncodeProviderSettle(pRandom) {
    let data = [pRandom];
    return '0x' + rlp.encode(data).toString('hex');
  }
  // mType=6 CancelSession
  // mType=7 Refund

  var sessionData = [];

contract('Session', (accounts) => {
  const providerAddress = accounts[0];
  const regulatorAddress = accounts[1];
  const userAddress = accounts[2];
  const tokenAddress = accounts[3];

  let providerPrivateKey, regulatorPrivateKey, userPrivateKey, puppetAddrs, puppetPrivates;
  before(async () => {
    let keys = await getPrivateKeys();
    providerPrivateKey = keys.providerPrivateKey;
    regulatorPrivateKey = keys.regulatorPrivateKey;
    userPrivateKey = keys.userPrivateKey;

    let puppetKeys = await getPuppetAccounts(accounts);
    puppetAddrs = puppetKeys.puppetAddrs;
    puppetPrivates = puppetKeys.puppetPrivates;

  });

  beforeEach(async ()=>{
    OffchainPayment = await OffchainPayment.new(providerAddress, providerAddress, regulatorAddress, regulatorAddress, 4, {from: providerAddress});
    typedData.domain.verifyingContract = providerAddress;
    typedData.domain.chainId = 4;

    Session = await Session.new({from: userAddress});
  });

  it("send packet message", async()=>{
    let sessionID = web3.utils.soliditySha3("ok");
    let res = await Session.initSession(sessionID, providerAddress, providerAddress, [puppetAddrs[0], puppetAddrs[1], puppetAddrs[2], puppetAddrs[3], puppetAddrs[4]], OffchainPayment.address, "0x0");
    // res = await Session.joinSession(sessionID, puppetAddress4);
    for(let i=0; i<puppetAddrs.length; i++) await OffchainPayment.onchainAddPuppet(puppetAddrs[i], puppetAddrs[i], {from: regulatorAddress});
    let channelIDs = [];
    for(let i=0; i<puppetAddrs.length; i++) channelIDs.push(web3.utils.soliditySha3({t: 'address', v: puppetAddrs[i]}, {t: 'address', v: userAddress}))
    // console.log("channel id", channelID);
    let amount = web3.utils.toWei('10', 'ether');
    for(let i=0; i<puppetAddrs.length; i++) await OffchainPayment.onchainOpenChannel( puppetAddrs[i], tokenAddress, channelIDs[i], amount, { from: regulatorAddress});
    // provider deposit
    await OffchainPayment.onchainProviderDeposit(tokenAddress, amount, { from: regulatorAddress});
    amount = web3.utils.toWei('1', 'ether');;
    let nonce = 8;
    for(let i=0; i<puppetAddrs.length; i++) {
        let messageHash = web3.utils.soliditySha3(providerAddress, web3.utils.sha3('rebalanceIn'), channelIDs[i], amount, nonce);
        // console.log("propose rebalance message hash", messageHash);
        let signature = tEcsign(Buffer.from(messageHash.substr(2), 'hex'), providerPrivateKey);
        let res = await OffchainPayment.proposeRebalance(channelIDs[i], amount, nonce, signature, {from: providerAddress});
        // console.log("propose rebalance log", res.receipt.logs[0]);
        signature = tEcsign(Buffer.from(messageHash.substr(2), 'hex'), regulatorPrivateKey);
        await OffchainPayment.confirmRebalance(messageHash, signature, {from: regulatorAddress});
    }

    // provider send hash random
    let buffer = rlpEncodeProviderRandomHash(web3.utils.soliditySha3(sessionID), tokenAddress, web3.utils.toWei('0.15263752357', 'ether'));
    let hash = web3.utils.soliditySha3(providerAddress, providerAddress, sessionID, {t: 'uint8', v: 1}, {t: 'bytes', v: buffer});
    let sig = tEcsign(Buffer.from(hash.substr(2), 'hex'), providerPrivateKey);
    await Session.sendMessage(providerAddress, providerAddress, sessionID, 1, buffer, sig, "0x", {from: providerAddress});

    // user send random hash
    buffer = rlpEncodeUserRandomHash(web3.utils.soliditySha3(sessionID));
    for(let i=0; i<puppetAddrs.length; i++) {
        let hash = web3.utils.soliditySha3(puppetAddrs[i], providerAddress, sessionID, {t: 'uint8', v: 2}, {t: 'bytes', v:buffer});
        let sig = tEcsign(Buffer.from(hash.substr(2), 'hex'), puppetPrivates[i]);
        
        // console.log("add hash", addHash);
        typedData.message.channelID = channelIDs[i];
        typedData.message.balance = web3.utils.toWei('0.15263752357', 'ether');
        typedData.message.nonce = 1;
        let addHash = web3.utils.soliditySha3({t: 'bytes32', v: hash}, {t: 'uint256', v: typedData.message.balance});
        typedData.message.additionalHash = addHash;
        let paySig = tEcsign(signHash(), puppetPrivates[i])
        let tData = await rlpEncodePayment(channelIDs[i], web3.utils.toHex(typedData.message.balance), 1, web3.utils.toHex(typedData.message.balance), addHash, paySig);
        let res = await Session.sendMessage(puppetAddrs[i], providerAddress, sessionID, 2, buffer, sig, tData, {from: puppetAddrs[i]});
    }

    // UserHashReady
    buffer = rlpEncodeUserHashReady(puppetAddrs[0], puppetAddrs[1], puppetAddrs[2], puppetAddrs[3], puppetAddrs[4]);
    hash = web3.utils.soliditySha3(providerAddress, providerAddress, sessionID, {t: 'uint8', v: 3}, {t: 'bytes', v: buffer});
    sig = tEcsign(Buffer.from(hash.substr(2), 'hex'), providerPrivateKey);
    await Session.sendMessage(providerAddress, providerAddress, sessionID, 3, buffer, sig, "0x", {from: providerAddress});

    // ProviderRevealRandom
    buffer = rlpEncodeProviderRevealRandom(sessionID, sessionID, sessionID, sessionID, sessionID);
    hash = web3.utils.soliditySha3(providerAddress, providerAddress, sessionID, {t: 'uint8', v: 4}, {t: 'bytes', v: buffer});
    sig = tEcsign(Buffer.from(hash.substr(2), 'hex'), providerPrivateKey);
    res = await Session.sendMessage(providerAddress, providerAddress, sessionID, 4, buffer, sig, "0x", {from: providerAddress});

    // ProviderSettle
    buffer = rlpEncodeProviderSettle(sessionID);
    let rate = new BN(web3.utils.toHex(98).substr(2), 16);
    console.log("rate", rate.toString(10));
    let hundred = new BN(web3.utils.toHex(100).substr(2), 16);
    console.log("hundred", hundred.toString(10));
    let stake = web3.utils.toWei('0.15263752357', 'ether');
    console.log("stake", stake);
    stake = web3.utils.toHex(stake).substr(2);
    stake = new BN(stake, 16);
    console.log("555555", (new BN('101', 2)).toString(10));
    let winnerAmount = stake.mul(rate).div(hundred).div(new BN('101', 2)).add(stake.mul(rate).div(hundred));
    let loserAmount = stake.mul(rate).div(hundred).div(new BN('101', 2));
    console.log("winner amount", winnerAmount.toString(10), winnerAmount.toString(16));
    console.log("loser amount", loserAmount.toString(10), loserAmount.toString(16));
    for(let i=0; i<puppetAddrs.length; i++) {
        let hash = web3.utils.soliditySha3(providerAddress, puppetAddrs[i], sessionID, {t: 'uint8', v: 5}, {t: 'bytes', v: buffer});
        let sig = tEcsign(Buffer.from(hash.substr(2), 'hex'), providerPrivateKey);
        let addHash;
        let tData;
        typedData.message.channelID = channelIDs[i];
        typedData.message.nonce = 1; 
        
        if(i == 4) { // 1176 196
            typedData.message.balance = loserAmount.toString(10);
            addHash = web3.utils.soliditySha3({t: 'bytes32', v: hash}, {t: 'uint256', v: typedData.message.balance});
            typedData.message.additionalHash = addHash;
            let paySig = tEcsign(signHash(), providerPrivateKey)
            tData = await rlpEncodePayment(channelIDs[i], web3.utils.toHex(typedData.message.balance), 1,  web3.utils.toHex(typedData.message.balance), addHash, paySig);
            
            // typedData.message.balance = 1960;
        } else {
            typedData.message.balance = winnerAmount.toString(10);
            addHash = web3.utils.soliditySha3({t: 'bytes32', v: hash}, {t: 'uint256', v: typedData.message.balance});
            typedData.message.additionalHash = addHash;
            let paySig = tEcsign(signHash(), providerPrivateKey)
            tData = await rlpEncodePayment(channelIDs[i],  web3.utils.toHex(typedData.message.balance), 1,  web3.utils.toHex(typedData.message.balance), addHash, paySig);
            
            // typedData.message.balance = 11760;
        }
        // console.log("addHash", addHash);
        let res = await Session.sendMessage(providerAddress, puppetAddrs[i], sessionID, 5, buffer, sig, tData, {from: providerAddress});
        // console.log(i, '---', res.receipt.status);
        // res = await Session.exportSessionBytes.call(sessionID);
        // console.log("exports bytes", res);
    }
    
    res = await Session.exportSession.call(sessionID);
    //sessionData = res;
    //console.log('resssssss', res[0][3], typeof res[0][3]);

    for(let k=0; k<res.length; k++){
        let m = res[k];
        sessionData.push([m[0], m[1], m[2], web3.utils.toBN(m[3]), m[4], m[5], m[6], web3.utils.toBN(m[7]), web3.utils.toBN(m[8]), web3.utils.toBN(m[9]), m[10], m[11]]);
    }
    //console.log("session data", sessionData);
    let rlpencoded = rlp.encode(sessionData).toString('hex');
    console.log("rlp encoded ", rlpencoded);

  })
});