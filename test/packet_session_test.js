const ethUtil = require('ethereumjs-util');
const BigNumber = web3.BigNumber;
var OffchainPayment = artifacts.require("OffchainPayment");
var Session = artifacts.require("Session");
const abi = require('ethereumjs-abi');
var protobuf = require("protobufjs");
protobuf.common('google/protobuf/descriptor.proto', {})
let rlp = require("rlp");


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
        verifyingContract: '0xd099044e12af61733823161006AD70aB1fAB3635',
    },
    message: {
        channelID: '',
        balance: 0,
        nonce: 0,
        additionalHash: '',
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

  var sessionData = [];

contract('Session', (accounts) => {
  const providerAddress = accounts[0];
  const regulatorAddress = accounts[1];
  const userAddress = accounts[2];
  const tokenAddress = accounts[3];
  const puppetAddrs = [accounts[4], accounts[5], accounts[6], accounts[7], accounts[8]];
  const puppetPrivates = [Buffer.from("4b50d8ec4f6f785fa437a847349660227f589690192545c6a6c4e02cea7b72c2", 'hex'),
  Buffer.from("d94151d7da553e7dc96ff4bff0e9b84b9588990ec7e8bc25bbe3d03f93bfdf13", 'hex'),
  Buffer.from("75b60528a836fc1e3164da326fb93f436632046e1ea295c5604d721dd8fbb1db", 'hex'),
  Buffer.from("dc7402b2e6765cf1b7e4b2b4516b3eebf20469effe6dd56f8840419b1f390615", 'hex'),
  Buffer.from("b0e342b439fddfc37d230713676aaf2829af15a72f70d3b08321e3c8dd75481d", 'hex')];
  const providerPrivateKey = Buffer.from("24e13489c83a8f892891075e94953348b9b1c5841a638819e6b062ea87122d4e", 'hex');
  const regulatorPrivateKey = Buffer.from("de0fd81d5044820837c94143a5e32939fcc66e0705536d08ca350739ba34addb", 'hex');
  const userPrivateKey = Buffer.from("d127601a67d8dc42ace4efcdfafa148bc09f3fea52b9df773f8d5bb3e5d71033", 'hex');

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
    let amount = web3.utils.toWei('10', 'ether');
    for(let i=0; i<puppetAddrs.length; i++) await OffchainPayment.onchainOpenChannel( puppetAddrs[i], tokenAddress, channelIDs[i], amount, { from: regulatorAddress});
    // provider deposit
    await OffchainPayment.onchainProviderDeposit(tokenAddress, amount, { from: regulatorAddress});
    amount = web3.utils.toWei('1', 'ether');;
    let nonce = 8;
    for(let i=0; i<puppetAddrs.length; i++) {
        let messageHash = web3.utils.soliditySha3(providerAddress, channelIDs[i], amount, nonce);
        // console.log("propose rebalance message hash", messageHash);
        let signature = myEcsign(Buffer.from(messageHash.substr(2), 'hex'), providerPrivateKey);
        let res = await OffchainPayment.proposeRebalance(channelIDs[i], amount, nonce, signature, {from: providerAddress});
        // console.log("propose rebalance log", res.receipt.logs[0]);
        signature = myEcsign(Buffer.from(messageHash.substr(2), 'hex'), regulatorPrivateKey);
        await OffchainPayment.confirmRebalance(messageHash, signature, {from: regulatorAddress});
    }
    let transferPB = await protobuf.load("/Users/vincent/Develop/l2ContractTruffle/test/packet.proto");

    // provider send hash random
    let ProviderRandomHash = transferPB.lookupType("PacketData.ProviderRandomHash");
    let payload = {prHash: web3.utils.hexToBytes(web3.utils.soliditySha3(sessionID)), token: web3.utils.hexToBytes(tokenAddress), amount: web3.utils.hexToBytes(web3.utils.numberToHex(web3.utils.toWei('0.01', 'ether')))};
    // Verify the payload if necessary (i.e. when possibly incomplete or invalid)
    let errMsg = ProviderRandomHash.verify(payload);
    if (errMsg)
        throw Error(errMsg);
    // Create a new message
    let message = ProviderRandomHash.create(payload); // or use .fromObject if conversion is necessary
    // Encode a message to an Uint8Array (browser) or Buffer (node)
    let buffer = ProviderRandomHash.encode(message).finish().toJSON().data;
    // console.log("buffer", typeof buffer);
    let hash = web3.utils.soliditySha3(providerAddress, providerAddress, sessionID, {t: 'uint8', v: 1}, {t: 'bytes', v: web3.utils.bytesToHex(buffer)});
    let sig = myEcsign(Buffer.from(hash.substr(2), 'hex'), providerPrivateKey);
    await Session.sendMessage(providerAddress, providerAddress, sessionID, 1, buffer, sig, "0x", {from: providerAddress});

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
        
        // console.log("add hash", addHash);
        typedData.message.channelID = channelIDs[i];
        typedData.message.balance = web3.utils.toWei('0.01', 'ether');
        console.log("to wei", typedData.message.balance);
        console.log("to wei hex", web3.utils.toHex(typedData.message.balance));
        console.log("to wei num to  hex", web3.utils.numberToHex(typedData.message.balance));
        typedData.message.nonce = 1;
        let addHash = web3.utils.soliditySha3({t: 'bytes32', v: hash}, {t: 'uint256', v: typedData.message.balance});
        typedData.message.additionalHash = addHash;
        let paySig = myEcsign(signHash(), puppetPrivates[i])
        let tData = await rlpEncodePayment(channelIDs[i], web3.utils.toHex(typedData.message.balance), 1, web3.utils.toHex(typedData.message.balance), addHash, paySig);
        let res = await Session.sendMessage(puppetAddrs[i], providerAddress, sessionID, 2, buffer, sig, tData, {from: puppetAddrs[i]});
        // console.log(i, '---', res.receipt.status);
        // console.log("user send hash log", res.receipt.logs[0]);
        // console.log("user send hash balance", res.receipt.logs[0].args.balance.toNumber());
        // console.log("user send hash nonce", res.receipt.logs[0].args.nonce.toNumber());
        // console.log("user send hash amount", res.receipt.logs[0].args.amount.toNumber());
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
    await Session.sendMessage(providerAddress, providerAddress, sessionID, 3, buffer, sig, "0x", {from: providerAddress});

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
        let res = await Session.sendMessage(puppetAddrs[i], providerAddress, sessionID, 4, buffer, sig, "0x", {from: puppetAddrs[i]});
        // console.log(i, '---', res.receipt.status);
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
        typedData.message.channelID = channelIDs[i];
        typedData.message.nonce = 1; 
        
        if(i == 4) { // 1176 196
            typedData.message.balance = web3.utils.toWei('0.00196', 'ether');
            addHash = web3.utils.soliditySha3({t: 'bytes32', v: hash}, {t: 'uint256', v: typedData.message.balance});
            typedData.message.additionalHash = addHash;
            let paySig = myEcsign(signHash(), providerPrivateKey)
            tData = await rlpEncodePayment(channelIDs[i], web3.utils.toHex(typedData.message.balance), 1,  web3.utils.toHex(typedData.message.balance), addHash, paySig);
            
            // typedData.message.balance = 1960;
        } else {
            typedData.message.balance = web3.utils.toWei('0.01176', 'ether');
            addHash = web3.utils.soliditySha3({t: 'bytes32', v: hash}, {t: 'uint256', v: typedData.message.balance});
            typedData.message.additionalHash = addHash;
            let paySig = myEcsign(signHash(), providerPrivateKey)
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
    console.log("session data", sessionData);
    let rlpencoded = rlp.encode(sessionData).toString('hex');
    console.log("rlp encoded ", rlpencoded);

  })
});