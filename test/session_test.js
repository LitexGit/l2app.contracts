const ethUtil = require('ethereumjs-util');
const BigNumber = web3.BigNumber;
const Long = require('long');
var OffchainPayment = artifacts.require("OffchainPayment");
var Session = artifacts.require("Session");
const abi = require('ethereumjs-abi');
var protobuf = require("protobufjs");
let rlp = require("rlp");
protobuf.common('google/protobuf/descriptor.proto', {})

const { getPrivateKeys } = require("./utils/keys");
let { typedData, signHash } = require("./utils/typedData");
const { tEcsign, myEcsign, personalSign } = require("./utils/helper");


contract('Session', (accounts) => {
  const providerAddress = accounts[0];
  const regulatorAddress = accounts[1];
  const userAddress = accounts[2];
  const tokenAddress = accounts[3];
  const puppetAddress = accounts[4];
  const puppetAddress2 = accounts[5];
  const puppetAddress3 = accounts[6];
  const puppetAddress4 = accounts[7];
  const puppetAddress5 = accounts[8];

  let providerPrivateKey, regulatorPrivateKey, userPrivateKey;

  before(async () => {
    let keys = await getPrivateKeys();
    providerPrivateKey = keys.providerPrivateKey;
    regulatorPrivateKey = keys.regulatorPrivateKey;
    userPrivateKey = keys.userPrivateKey;
  });


  beforeEach(async ()=>{
    OffchainPayment = await OffchainPayment.new(providerAddress, providerAddress, regulatorAddress, regulatorAddress, 4, {from: providerAddress});
    typedData.domain.verifyingContract = providerAddress;
    typedData.domain.chainId = 4
    Session = await Session.new({from: userAddress});
  });

  it("send message", async()=>{
    let sessionID = web3.utils.soliditySha3("ok");
    let res = await Session.initSession(sessionID, providerAddress, providerAddress, [userAddress, puppetAddress], OffchainPayment.address, "0x0");
    res = await Session.joinSession(sessionID, puppetAddress4);
    await OffchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    console.log("channel id", channelID);
    let amount = web3.utils.toWei('10', 'ether');
    await OffchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress}); 
    let balance = "42624513554376";
    // let balance = web3.utils.toBN(web3.utils.toWei('1', 'ether'));
    // let balance = web3.utils.toWei('0.012345626', 'ether');
    let nonce = 199;
    amount = 10000000;
    let hash = web3.utils.soliditySha3(userAddress, providerAddress, sessionID, {t: 'uint8', v: 2}, {t: 'bytes', v: "0x14791057"});
    let puppetSig = tEcsign(Buffer.from(hash.substr(2), 'hex'), userPrivateKey);
    let additionalHash = web3.utils.soliditySha3(hash, amount);
    typedData.message.channelID = channelID;
    typedData.message.additionalHash = additionalHash;
    typedData.message.balance = balance;
    typedData.message.nonce = nonce;
    console.log("additon hash", additionalHash);
    let signature = tEcsign(signHash(), userPrivateKey)
    console.log("sss", web3.utils.bytesToHex(signature));
    let paymentData = [channelID, web3.utils.toHex(balance), nonce, amount, additionalHash, web3.utils.bytesToHex(signature)];
    let rlpencode = '0x' + rlp.encode(paymentData).toString('hex');
    res = await Session.sendMessage(userAddress, providerAddress, sessionID, 2, "0x14791057", puppetSig, rlpencode, {from: userAddress});
    console.log("res", res.logs[0]);
    console.log("balance", res.logs[0].args.balance.toNumber());
    console.log("nonce", res.logs[0].args.nonce.toNumber());
    console.log("amount", res.logs[0].args.amount.toNumber());

  })

  // it("export messages", async()=>{
  //   let res = await this.Session.initSession(providerAddress, providerAddress, [userAddress, puppetAddress], this.OffchainPayment.address, "0x0");
  //   let sessionID = res.receipt.logs[0].args.sessionID;
  //   res = await this.Session.joinSession(sessionID, puppetAddress2);


  //   await this.OffchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
  //   let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
  //   let amount = 100000;
  //   await this.OffchainPayment.onchainOpenChannel(
  //   userAddress,
  //   tokenAddress,
  //   channelID,
  //   amount,
  //   { from: regulatorAddress}
  //   );
  //   let balance = 1;
  //   let nonce = 8;
  //   let additionalHash = channelID;
  //   typedData.message.channelID = channelID;
  //   typedData.message.additionalHash = channelID;
  //   //console.log(typedData.message);
  //   let signature = myEcsign(signHash(), userPrivateKey)

  //   //await this.offchainPayment.transfer(providerAddress, channelID, balance, nonce, additionalHash, signature, {from: userAddress});
  //   await this.Session.sendMessage(userAddress, providerAddress, sessionID, "xxoo", "0x0", "0x0", channelID, balance, nonce, channelID, signature);

  //   res = await this.Session.exportSession.call(sessionID);
  //    console.log(res);
  // })

});