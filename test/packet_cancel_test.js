const ethUtil = require('ethereumjs-util');
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
  function rlpEncodeUserRevealRandom(uRandom) {
    let data = [uRandom];
    return '0x' + rlp.encode(data).toString('hex');
  }
  // mType=5
  function rlpEncodeProviderSettle(pRandom) {
    let data = [pRandom];
    return '0x' + rlp.encode(data).toString('hex');
  }
  // mType=6 CancelSession
  // mType=7 Refund

  function  getPacketBytes(result) {
    let sessionData = [];
    for(let k=0; k<result.length; k++){
        let m = result[k];
        sessionData.push([m[0], m[1], m[2], web3.utils.toBN(m[3]), m[4], m[5], m[6], web3.utils.toBN(m[7]), web3.utils.toBN(m[8]), web3.utils.toBN(m[9]), m[10], m[11]]);
    }
    return '0x' + rlp.encode(sessionData).toString('hex');
 }

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
    let buffer = rlpEncodeProviderRandomHash(web3.utils.soliditySha3(sessionID), tokenAddress, web3.utils.toWei('0.1', 'ether'));
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
        typedData.message.balance = web3.utils.toWei('0.1', 'ether');
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

    // // UserRevealRandom

    // Provider cancel
    hash = web3.utils.soliditySha3(providerAddress, providerAddress, sessionID, {t: 'uint8', v: 6}, '0x');
    sig = tEcsign(Buffer.from(hash.substr(2), 'hex'), providerPrivateKey);
    await Session.sendMessage(providerAddress, providerAddress, sessionID, 6, '0x', sig, "0x", {from: providerAddress});

    // Provider refund
    for(let i=0; i<puppetAddrs.length; i++) {
        let hash = web3.utils.soliditySha3(providerAddress, puppetAddrs[i], sessionID, {t: 'uint8', v: 7}, '0x');
        let sig = tEcsign(Buffer.from(hash.substr(2), 'hex'), providerPrivateKey);
        typedData.message.balance = web3.utils.toWei('0.01', 'ether');
        let addHash = web3.utils.soliditySha3({t: 'bytes32', v: hash}, {t: 'uint256', v: typedData.message.balance});
        typedData.message.channelID = channelIDs[i];
        typedData.message.additionalHash = addHash;
        typedData.message.nonce = 2;
        let paySig = tEcsign(signHash(), providerPrivateKey)
        let tData = await rlpEncodePayment(channelIDs[i], web3.utils.toHex(typedData.message.balance), 2, web3.utils.toHex(typedData.message.balance), addHash, paySig);
        await Session.sendMessage(providerAddress, puppetAddrs[i], sessionID, 7, '0x', sig, tData, {from: providerAddress});
    }
    
    res = await Session.exportSession.call(sessionID);
    //sessionData = res;
    //console.log('resssssss', res[0][3], typeof res[0][3]);

    // for(let k=0; k<res.length; k++){
    //     let m = res[k];
    //     sessionData.push([m[0], m[1], m[2], web3.utils.toBN(m[3]), m[4], m[5], m[6], web3.utils.toBN(m[7]), web3.utils.toBN(m[8]), web3.utils.toBN(m[9]), m[10], m[11]]);
    // }
    // // console.log("session data", sessionData);
    // let rlpencoded = rlp.encode(sessionData).toString('hex');
    let rlpencoded = getPacketBytes(res);
    console.log("rlp encoded ", rlpencoded);

  })
});