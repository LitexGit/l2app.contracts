/**
 * 1. 用户协商关请求提交成功后，针对该通道的transfer以及withdraw请求将无法提交
    2. 用户协商关请求提交成功后，超过指定的lastCommitBlock后，可以调用相应的unlock进行解锁
    3. 用户取现请求提交后，用户马上进行转账操作(转账金额位于【取现成功后金额，取现前余额】之间)，provider/regulator提交审核时应该不予通过
    4. 用户取现请求提交成功后，超过指定的lastCommitBlock后，可以调用响应的unlock进行解锁
    5. 手续费测试：用户和CP在通道余额均为10，用户转账5，provider未提交submitFee，provider提交给用户转账12的请求，请求被合约revert
    6. 手续费率设置测试，regulator有权限修改当前系统的手续费率，支付合约中每个token对应一个手续费率
    regulator设置当前手续费率为0.001, 用户给CP转账1后（CP提交submitFee），regulator更改当前手续费为0.002, 用户再给CP转账1后（CP提交submitFee），此时收到的总手续费应该为 1*0.001 + 1*0.002 = 0.003
 */
const ethUtil = require('ethereumjs-util');
const BigNumber = web3.BigNumber;
var OffchainPayment = artifacts.require("offchainPayment");
var offchainPayment;
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
    messageHash = Buffer.from(messageHash.substr(2), 'hex')
    let signatureObj = ethUtil.ecsign(messageHash, privateKey);
    let signatureHexString = ethUtil.toRpcSig(signatureObj.v, signatureObj.r, signatureObj.s).toString('hex');
    let signatureBytes = web3.utils.hexToBytes(signatureHexString);
    return signatureBytes;
  }
  function mEcsign(messageHash, privateKey) {
    let signatureObj = ethUtil.ecsign(messageHash, privateKey);
    let signatureHexString = ethUtil.toRpcSig(signatureObj.v, signatureObj.r, signatureObj.s).toString('hex');
    let signatureBytes = web3.utils.hexToBytes(signatureHexString);
    return signatureBytes;
  }


contract('offchain payment', (accounts) => {
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
    offchainPayment = await OffchainPayment.new(providerAddress, providerAddress, regulatorAddress, regulatorAddress, 4, {from: providerAddress});
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
    let signature = mEcsign(signHash(), userPrivateKey);
    await offchainPayment.transfer(providerAddress, channelID, balance, nonce, additionalHash, signature, {from: userAddress});
    amount = 1;
    let receiver = userAddress;
    lastCommitBlock = 888;
    await offchainPayment.userProposeWithdraw(channelID, amount, receiver, lastCommitBlock, {from: userAddress});
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
    let signature = mEcsign(signHash(), userPrivateKey);
    await offchainPayment.transfer(providerAddress, channelID, balance, nonce, additionalHash, signature, {from: userAddress});

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
    let messageHash = web3.utils.soliditySha3(providerAddress, channelID, amount, nonce);
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
    signature = mEcsign(signHash(), userPrivateKey);
    await offchainPayment.transfer(providerAddress, channelID, balance, nonce, additionalHash, signature, {from: userAddress});

    balance = 12;
    nonce = 1;
    additionalHash = channelID;
    typedData.message.channelID = channelID;
    typedData.message.balance = balance;
    typedData.message.nonce = nonce;
    typedData.message.additionalHash = additionalHash;
    signature = mEcsign(signHash(), userPrivateKey);
    await offchainPayment.transfer(userAddress, channelID, balance, nonce, additionalHash, signature, {from: providerAddress});
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
    signature = mEcsign(signHash(), userPrivateKey);
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
    signature = mEcsign(signHash(), userPrivateKey);
    await offchainPayment.transfer(providerAddress, channelID, balance, nonce, additionalHash, signature, {from: userAddress});

    messageHash = web3.utils.soliditySha3(providerAddress, tokenAddress, 3, 2);
    signature = myEcsign(messageHash, providerPrivateKey);   
    await offchainPayment.submitFee(channelID, tokenAddress, 3, 2, signature);
  })

})
