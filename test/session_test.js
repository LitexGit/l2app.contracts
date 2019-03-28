const ethUtil = require('ethereumjs-util');
const BigNumber = web3.BigNumber;
var OffchainPayment = artifacts.require("OffchainPayment");
var Session = artifacts.require("Session");
const abi = require('ethereumjs-abi');
var transferPB = require('./transfer_pb');
var protobuf = require("protobufjs");
protobuf.common('google/protobuf/descriptor.proto', {})

var typedData = {
    types: {
        EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
        ],
        Transfer: [
            { name: 'channelID', type: 'bytes32' },
            { name: 'balance', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'additionalHash', type: 'bytes32' }
        ],
    },
    primaryType: 'Transfer',
    domain: {
        name: 'litexlayer2',
        version: '1',
        chainId: 4,
        verifyingContract: '0x7C765426aB9d7BCCf151C3d8D03f1368c50c9408',
    },
    message: {
        channelID: '',
        balance: 1,
        nonce: 8,
        additionalHash: ''
    },
  };
  
  
  const types = typedData.types;
  function dependencies(primaryType, found = []) {
    if (found.includes(primaryType)) {
        return found;
    }
    if (types[primaryType] === undefined) {
        return found;
    }
    found.push(primaryType);
    for (let field of types[primaryType]) {
        for (let dep of dependencies(field.type, found)) {
            if (!found.includes(dep)) {
                found.push(dep);
            }
        }
    }
    return found;
  }
  
  function encodeType(primaryType) {
    // Get dependencies primary first, then alphabetical
    let deps = dependencies(primaryType);
    deps = deps.filter(t => t != primaryType);
    deps = [primaryType].concat(deps.sort());
  
    // Format as a string with fields
    let result = '';
    for (let type of deps) {
        result += `${type}(${types[type].map(({ name, type }) => `${type} ${name}`).join(',')})`;
    }
    return result;
  }
  
  function typeHash(primaryType) {
    return ethUtil.keccak256(encodeType(primaryType));
  }
  
  function encodeData(primaryType, data) {
    let encTypes = [];
    let encValues = [];
  
    // Add typehash
    encTypes.push('bytes32');
    encValues.push(typeHash(primaryType));
  
    // Add field contents
    for (let field of types[primaryType]) {
        let value = data[field.name];
        if (field.type == 'string' || field.type == 'bytes') {
            encTypes.push('bytes32');
            value = ethUtil.keccak256(value);
            encValues.push(value);
        } else if (types[field.type] !== undefined) {
            encTypes.push('bytes32');
            value = ethUtil.keccak256(encodeData(field.type, value));
            encValues.push(value);
        } else if (field.type.lastIndexOf(']') === field.type.length - 1) {
            throw 'TODO: Arrays currently unimplemented in encodeData';
        } else {
            encTypes.push(field.type);
            encValues.push(value);
        }
    }
  
    return abi.rawEncode(encTypes, encValues);
  }
  
  function structHash(primaryType, data) {
    return ethUtil.keccak256(encodeData(primaryType, data));
  }
  
  function signHash() {
    return ethUtil.keccak256(
        Buffer.concat([
            Buffer.from('1901', 'hex'),
            structHash('EIP712Domain', typedData.domain),
            structHash(typedData.primaryType, typedData.message),
        ]),
    );
  }
  
  function myEcsign(messageHash, privateKey) {
   // messageHash = Buffer.from(messageHash.substr(2), 'hex')
    let signatureObj = ethUtil.ecsign(messageHash, privateKey);
    let signatureHexString = ethUtil.toRpcSig(signatureObj.v, signatureObj.r, signatureObj.s).toString('hex');
    let signatureBytes = web3.utils.hexToBytes(signatureHexString);
    return signatureBytes;
  }

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

  const providerPrivateKey = Buffer.from("a5f37d95f39a584f45f3297d252410755ced72662dbb886e6eb9934efb2edc93", 'hex');
  const regulatorPrivateKey = Buffer.from("2fc8c9e1f94711b52b98edab123503519b6a8a982d38d0063857558db4046d89", 'hex');
  const userPrivateKey = Buffer.from("d01a9956202e7b447ba7e00fe1b5ca8b3f777288da6c77831342dbd2cb022f8f", 'hex');

  beforeEach(async ()=>{
    OffchainPayment = await OffchainPayment.new(providerAddress, providerAddress, regulatorAddress, regulatorAddress, 4, {from: providerAddress});
    Session = await Session.new({from: userAddress});
  });

  // it("init session", async()=>{
  //   let res = await this.Session.initSession(providerAddress, providerAddress, [userAddress, puppetAddress], this.OffchainPayment.address, "0x0");
  //   let sessionID = res.receipt.logs[0].args.sessionID;
  //   // console.log(res.receipt.logs[0].args.sessionID);
  //   let sessionData = await this.Session.sessions.call(sessionID);
  //   //console.log(sessionData);
  //   assert.equal(sessionData.status, 1, "status should be 1");
  // });

  // it("join session", async()=>{
  //   let res = await this.Session.initSession(providerAddress, providerAddress, [userAddress, puppetAddress], this.OffchainPayment.address, "0x0");
  //   let sessionID = res.receipt.logs[0].args.sessionID;
  //   res = await this.Session.joinSession(sessionID, puppetAddress2);
  //   let player = await this.Session.players.call(sessionID, 2);
  //   assert.equal(player, puppetAddress2, "player should join session");
  // })

  it("send message", async()=>{
    let sessionID = web3.utils.soliditySha3("ok");
    let res = await Session.initSession(sessionID, providerAddress, providerAddress, [userAddress, puppetAddress], OffchainPayment.address, "0x0");
    res = await Session.joinSession(sessionID, puppetAddress4);
    await OffchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    console.log("channel id", channelID);
    let amount = 100000;
    await OffchainPayment.onchainOpenChannel(
    userAddress,
    tokenAddress,
    channelID,
    amount,
    { from: regulatorAddress});
    // let balance = '1';
    // let nonce = '8';
    let ispuppet = await OffchainPayment.isPuppet(userAddress, userAddress);
    console.log("is puppet", ispuppet);
    let hash = web3.utils.soliditySha3(userAddress, providerAddress, sessionID, {t: 'uint8', v: 2}, {t: 'bytes', v: "0x14791057"});
    let puppetSig = myEcsign(Buffer.from(hash.substr(2), 'hex'), userPrivateKey);
    let additionalHash = web3.utils.soliditySha3(hash, 1);
    typedData.message.channelID = channelID;
    typedData.message.additionalHash = additionalHash;
    console.log("additon hash", additionalHash);
    let signature = myEcsign(signHash(), userPrivateKey)
    //console.log("sss", signature);


    let transferPB = await protobuf.load("/Users/vincent/Develop/l2ContractTruffle/contracts/proto/transfer.proto");
  
    // Obtain a message type
    var Transfer = transferPB.lookupType("TransferData.Transfer");

    // Exemplary payload
    //var payload = { channelID: "0x46c58114b911a44e571f6fbc181d2b50edde7033c96c7408fec77dce054694b1", balance: "0x1", nonce: "0x2", amount: "0x1", additionalHash: "0x46c58114b911a44e571f6fbc181d2b50edde7033c96c7408fec77dce054694b1" };
    var payload = {channelID: web3.utils.hexToBytes(channelID), balance: [1], nonce: [8], amount: [1], additionalHash: web3.utils.hexToBytes(additionalHash)};
    // Verify the payload if necessary (i.e. when possibly incomplete or invalid)
    var errMsg = Transfer.verify(payload);
    if (errMsg)
        throw Error(errMsg);

    // Create a new message
    var message = Transfer.create(payload); // or use .fromObject if conversion is necessary

    // Encode a message to an Uint8Array (browser) or Buffer (node)
    var buffer = Transfer.encode(message).finish().toJSON().data;
    // ... do something with buffer
    //console.log("buffer", buffer);

    res = await Session.sendMessage(userAddress, providerAddress, sessionID, 2, "0x14791057", puppetSig, buffer, signature, {from: userAddress});
    console.log("res", res.logs[0]);
      // this.Session.sendMessage(userAddress, providerAddress, sessionID, 2, "0x0", "0x0", buffer, signature, {from: userAddress}).then(
      //   console.log
      // );
      // console.log("res", res);

      // Decode an Uint8Array (browser) or Buffer (node) to a message
      // var message = AwesomeMessage.decode(buffer);
      // // ... do something with message
  
      // // If the application uses length-delimited buffers, there is also encodeDelimited and decodeDelimited.
  
      // // Maybe convert the message back to a plain object
      // var object = AwesomeMessage.toObject(message, {
      //     longs: String,
      //     enums: String,
      //     bytes: String,
      //     // see ConversionOptions
      // });

    // let testPD = web3.utils.hexToBytes("0x46c58114b911a44e571f6fbc181d2b50edde7033c96c7408fec77dce054694b10a2046c58114b911a44e571f6fbc181d2b50edde7033c96c7408fec77dce054694b1");
    // console.log(testPD);
    // res = await this.Session.sendMessage(userAddress, providerAddress, sessionID, 2, "0x0", "0x0", "0x46c58114b911a44e571f6fbc181d2b50edde7033c96c7408fec77dce054694b10a2046c58114b911a44e571f6fbc181d2b50edde7033c96c7408fec77dce054694b1", signature, {from: userAddress});
    // console.log(res);
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