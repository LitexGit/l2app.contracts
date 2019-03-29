const ethUtil = require('ethereumjs-util');
const BigNumber = web3.BigNumber;
var OffchainPayment = artifacts.require("OffchainPayment");
var Session = artifacts.require("Session");
const abi = require('ethereumjs-abi');
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
  async function sessionTransfer(channelID, balance, nonce, amount, additionalHash) {
    let transferPB = await protobuf.load("/Users/vincent/Develop/l2ContractTruffle/contracts/proto/transfer.proto");
    let Transfer = transferPB.lookupType("TransferData.Transfer");
    let payload = {channelID: web3.utils.hexToBytes(channelID), balance: [balance], nonce: [nonce], amount: [amount], additionalHash: web3.utils.hexToBytes(additionalHash)};
    let errMsg = Transfer.verify(payload);
    if (errMsg)
        throw Error(errMsg);
    let message = Transfer.create(payload); // or use .fromObject if conversion is necessary
    return Transfer.encode(message).finish().toJSON().data;
  }

contract('Session', (accounts) => {
  const providerAddress = accounts[0];
  const regulatorAddress = accounts[1];
  const userAddress = accounts[2];
  const tokenAddress = accounts[3];
  const puppetAddrs = [accounts[4], accounts[5], accounts[6], accounts[7], accounts[8]];
  const puppetPrivates = [Buffer.from("7d6e80e14e422aa0fa7a8a09fe5d057b10aec68e2de04136f138212853d3d6d6", 'hex'),
  Buffer.from("5ed11d237517c6b3b61bb2157a182f92ca8203f2ae21eee864d749e44bb65031", 'hex'),
  Buffer.from("6b5fd6774910f142d63c4e75043ce8b677090fd38b09aae8dd3c74c67d5b8eab", 'hex'),
  Buffer.from("045d1ab2a05f596f869f034e3b3c590a1e4608e4526566020f01e72c8bed6c5c", 'hex'),
  Buffer.from("24465bb6e9c0caf65107d3107adb3c4aa033681a968f511dbdcdf2b9054c3fd0", 'hex')];
  const providerPrivateKey = Buffer.from("a5f37d95f39a584f45f3297d252410755ced72662dbb886e6eb9934efb2edc93", 'hex');
  const regulatorPrivateKey = Buffer.from("2fc8c9e1f94711b52b98edab123503519b6a8a982d38d0063857558db4046d89", 'hex');
  const userPrivateKey = Buffer.from("d01a9956202e7b447ba7e00fe1b5ca8b3f777288da6c77831342dbd2cb022f8f", 'hex');

  beforeEach(async ()=>{
    OffchainPayment = await OffchainPayment.new(providerAddress, providerAddress, regulatorAddress, regulatorAddress, 4, {from: providerAddress});
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
    let amount = 10000000;
    for(let i=0; i<puppetAddrs.length; i++) await OffchainPayment.onchainOpenChannel( puppetAddrs[i], tokenAddress, channelIDs[i], amount, { from: regulatorAddress});
    // provider deposit
    await OffchainPayment.onchainProviderDeposit(tokenAddress, amount, { from: regulatorAddress});
    amount = 100000;
    let nonce = 8;
    for(let i=0; i<puppetAddrs.length; i++) {
        let messageHash = web3.utils.soliditySha3(providerAddress, channelIDs[i], amount, nonce);
        let signature = myEcsign(Buffer.from(messageHash.substr(2), 'hex'), providerPrivateKey);
        await OffchainPayment.proposeRebalance(channelIDs[i], amount, nonce, signature, {from: providerAddress});
        signature = myEcsign(Buffer.from(messageHash.substr(2), 'hex'), regulatorPrivateKey);
        await OffchainPayment.confirmRebalance(messageHash, signature, {from: regulatorAddress});
    }
    let transferPB = await protobuf.load("/Users/vincent/Develop/l2ContractTruffle/test/packet.proto");

    // provider send hash random
    let ProviderRandomHash = transferPB.lookupType("PacketData.ProviderRandomHash");
    let payload = {prHash: web3.utils.hexToBytes(web3.utils.soliditySha3(sessionID)), token: web3.utils.hexToBytes(tokenAddress), amount: [1000]};
    // Verify the payload if necessary (i.e. when possibly incomplete or invalid)
    let errMsg = ProviderRandomHash.verify(payload);
    if (errMsg)
        throw Error(errMsg);
    // Create a new message
    let message = ProviderRandomHash.create(payload); // or use .fromObject if conversion is necessary
    // Encode a message to an Uint8Array (browser) or Buffer (node)
    let buffer = ProviderRandomHash.encode(message).finish().toJSON().data;
    console.log("buffer", typeof buffer);
    let hash = web3.utils.soliditySha3(providerAddress, providerAddress, sessionID, {t: 'uint8', v: 1}, {t: 'bytes', v: web3.utils.bytesToHex(buffer)});
    let sig = myEcsign(Buffer.from(hash.substr(2), 'hex'), providerPrivateKey);
    await Session.sendMessage(providerAddress, providerAddress, sessionID, 1, buffer, sig, "0x", "0x", {from: providerAddress});

    // user send random hash
    let UserRandomHash = transferPB.lookupType("PacketData.UserRandomHash");
    payload = {urHash: web3.utils.hexToBytes(web3.utils.soliditySha3(sessionID))};
    // Verify the payload if necessary (i.e. when possibly incomplete or invalid)
    errMsg = UserRandomHash.verify(payload);
    if (errMsg)
        throw Error(errMsg);
    // Create a new message
    message = UserRandomHash.create(payload); // or use .fromObject if conversion is necessary
    // Encode a message to an Uint8Array (browser) or Buffer (node)
    buffer = UserRandomHash.encode(message).finish().toJSON().data;
    // console.log("buffer", typeof buffer);
    for(let i=0; i<puppetAddrs.length; i++) {
        let hash = web3.utils.soliditySha3(puppetAddrs[i], providerAddress, sessionID, {t: 'uint8', v: 2}, {t: 'bytes', v: web3.utils.bytesToHex(buffer)});
        let sig = myEcsign(Buffer.from(hash.substr(2), 'hex'), puppetPrivates[i]);
        let addHash = web3.utils.soliditySha3({t: 'uint256', v: 1000}, hash);
        let tData = await sessionTransfer(channelIDs[i], 1000, 1, 1000, addHash);
        typedData.message.channelID = channelIDs[i];
        typedData.message.balance = 1000;
        typedData.message.nonce = 1;
        typedData.message.additionalHash = addHash;
        let paySig = myEcsign(signHash(), puppetPrivates[i])
        let res = await Session.sendMessage(puppetAddrs[i], providerAddress, sessionID, 2, buffer, sig, tData, paySig, {from: puppetAddrs[i]});
        console.log(i, '---', res.receipt.status);
    }

    // UserHashReady
    let UserHashReady = transferPB.lookupType("PacketData.UserHashReady");
    payload = {user1: web3.utils.hexToBytes(puppetAddrs[0]), user2: web3.utils.hexToBytes(puppetAddrs[1]), user3: web3.utils.hexToBytes(puppetAddrs[2]), user4: web3.utils.hexToBytes(puppetAddrs[3]), user5: web3.utils.hexToBytes(puppetAddrs[4])};
    // Verify the payload if necessary (i.e. when possibly incomplete or invalid)
    errMsg = UserHashReady.verify(payload);
    if (errMsg)
        throw Error(errMsg);
    // Create a new message
    message = UserHashReady.create(payload); // or use .fromObject if conversion is necessary
    // Encode a message to an Uint8Array (browser) or Buffer (node)
    buffer = UserHashReady.encode(message).finish().toJSON().data;
    hash = web3.utils.soliditySha3(providerAddress, providerAddress, sessionID, {t: 'uint8', v: 3}, {t: 'bytes', v: web3.utils.bytesToHex(buffer)});
    sig = myEcsign(Buffer.from(hash.substr(2), 'hex'), providerPrivateKey);
    await Session.sendMessage(providerAddress, providerAddress, sessionID, 3, buffer, sig, "0x", "0x", {from: providerAddress});

    // UserRevealRandom
    let UserRevealRandom = transferPB.lookupType("PacketData.UserRevealRandom");
    payload = {uRandom: web3.utils.hexToBytes(sessionID)};
    // Verify the payload if necessary (i.e. when possibly incomplete or invalid)
    errMsg = UserRevealRandom.verify(payload);
    if (errMsg)
        throw Error(errMsg);
    // Create a new message
    message = UserRevealRandom.create(payload); // or use .fromObject if conversion is necessary
    // Encode a message to an Uint8Array (browser) or Buffer (node)
    buffer = UserRevealRandom.encode(message).finish().toJSON().data;
    // console.log("buffer", typeof buffer);
    for(let i=0; i<puppetAddrs.length; i++) {
        let hash = web3.utils.soliditySha3(puppetAddrs[i], providerAddress, sessionID, {t: 'uint8', v: 4}, {t: 'bytes', v: web3.utils.bytesToHex(buffer)});
        let sig = myEcsign(Buffer.from(hash.substr(2), 'hex'), puppetPrivates[i]);
        // let addHash = web3.utils.soliditySha3(hash, 1000);
        // let tData = await sessionTransfer(channelIDs[i], 1000, 1, 1000, addHash);
        // typedData.message.channelID = channelIDs[i];
        // typedData.message.balance = 1000;
        // typedData.message.nonce = 1;
        // typedData.message.additionalHash = addHash;
        // let paySig = myEcsign(signHash(), puppetPrivates[i])
        let res = await Session.sendMessage(puppetAddrs[i], providerAddress, sessionID, 4, buffer, sig, "0x", "0x", {from: puppetAddrs[i]});
        console.log(i, '---', res.receipt.status);
    }

    // ProviderSettle
    let ProviderSettle = transferPB.lookupType("PacketData.ProviderSettle");
    payload = {pRandom: web3.utils.hexToBytes(sessionID)};
    // Verify the payload if necessary (i.e. when possibly incomplete or invalid)
    errMsg = ProviderSettle.verify(payload);
    if (errMsg)
        throw Error(errMsg);
    // Create a new message
    message = ProviderSettle.create(payload); // or use .fromObject if conversion is necessary
    // Encode a message to an Uint8Array (browser) or Buffer (node)
    buffer = ProviderSettle.encode(message).finish().toJSON().data;
    // console.log("buffer", typeof buffer);
    for(let i=0; i<puppetAddrs.length; i++) {
        let hash = web3.utils.soliditySha3(providerAddress, puppetAddrs[i], sessionID, {t: 'uint8', v: 5}, {t: 'bytes', v: web3.utils.bytesToHex(buffer)});
        let sig = myEcsign(Buffer.from(hash.substr(2), 'hex'), providerPrivateKey);
        let addHash;
        let tData;
        if(i == 4) { // 1176 196
            addHash = web3.utils.soliditySha3({t: 'uint256', v: 1000}, hash);
            tData = await sessionTransfer(channelIDs[i], 1000, 1, 1000, addHash);
            typedData.message.balance = 1000;
        } else {
            addHash = web3.utils.soliditySha3({t: 'uint256', v: 1000}, hash);
            tData = await sessionTransfer(channelIDs[i], 1000, 1, 1000, addHash);
            typedData.message.balance = 1000;
        }
        console.log("addHash", addHash);
        typedData.message.channelID = channelIDs[i];
        typedData.message.nonce = 1;
        typedData.message.additionalHash = addHash;
        let paySig = myEcsign(signHash(), providerPrivateKey)
        let res = await Session.sendMessage(providerAddress, puppetAddrs[i], sessionID, 5, buffer, sig, tData, paySig, {from: providerAddress});
        console.log(i, '---', res.receipt.status);
    }  


    // let balance = '1';
    // let nonce = '8';
    // let ispuppet = await OffchainPayment.isPuppet(userAddress, userAddress);
    // console.log("is puppet", ispuppet);
    // let hash = web3.utils.soliditySha3(userAddress, providerAddress, sessionID, {t: 'uint8', v: 2}, {t: 'bytes', v: "0x14791057"});
    // let puppetSig = myEcsign(Buffer.from(hash.substr(2), 'hex'), userPrivateKey);
    // let additionalHash = web3.utils.soliditySha3(hash, 1);
    // typedData.message.channelID = channelID;
    // typedData.message.additionalHash = additionalHash;
    // console.log("additon hash", additionalHash);
    // let signature = myEcsign(signHash(), userPrivateKey)


    // res = await Session.sendMessage(userAddress, providerAddress, sessionID, 2, "0x14791057", puppetSig, buffer, signature, {from: userAddress});
    // console.log("res", res.logs[0]);
  })
});