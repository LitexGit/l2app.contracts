// 1. provider deposit 10000, rebalance in channel 1000, send 100 to user;(assert userBalance=1100, providerBalance=900)
// 2. set feeRate=1/10000, user deposit 1000, send 500 to provider;(assert userBalance=600, providerChannelBalance=1400)
// 3. provider withdraw 200;(assert providerWithdraw=200, providerOffchainBalance=8795)
// 4. user cooperative settle;(assert channel status=4)
// 5. user onchain cooperative settle;(assert provider balance=10195)

const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
let OffchainPayment = artifacts.require("offchainPayment");

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
  function eipEcsign(messageHash, privateKey) {
    let signatureObj = ethUtil.ecsign(messageHash, privateKey);
    let signatureHexString = ethUtil.toRpcSig(signatureObj.v, signatureObj.r, signatureObj.s).toString('hex');
    let signatureBytes = web3.utils.hexToBytes(signatureHexString);
    return signatureBytes;
  }

  contract('offchain payment', async(accounts)=>{
    const providerAddress = accounts[0];
    const regulatorAddress = accounts[1];
    const userAddress = accounts[2];
    const tokenAddress = accounts[3];
    const providerPrivateKey = Buffer.from("24e13489c83a8f892891075e94953348b9b1c5841a638819e6b062ea87122d4e", 'hex');
    const regulatorPrivateKey = Buffer.from("de0fd81d5044820837c94143a5e32939fcc66e0705536d08ca350739ba34addb", 'hex');
    const userPrivateKey = Buffer.from("d127601a67d8dc42ace4efcdfafa148bc09f3fea52b9df773f8d5bb3e5d71033", 'hex');
    const channelID = web3.utils.soliditySha3("channelID");
    let myOffchainPayment;

    before(async()=>{
        myOffchainPayment = await OffchainPayment.new(providerAddress, providerAddress, regulatorAddress, regulatorAddress, 4, {from: providerAddress});
    });

    it("1", async()=>{
        let amount = 1000;
        await myOffchainPayment.onchainOpenChannel(userAddress, tokenAddress, channelID, amount, { from: regulatorAddress});
        await myOffchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
        amount = 10000;
        await myOffchainPayment.onchainProviderDeposit(tokenAddress, amount, { from: regulatorAddress});
        let messageHash = web3.utils.soliditySha3(providerAddress, channelID, 1000, 1);
        let signature = myEcsign(messageHash, providerPrivateKey);
        await myOffchainPayment.proposeRebalance(channelID, 1000, 1, signature, {from: providerAddress});
        signature = myEcsign(messageHash, regulatorPrivateKey);
        await myOffchainPayment.confirmRebalance(messageHash, signature, {from: regulatorAddress});

        typedData.message.channelID = channelID;
        typedData.message.balance = 100;
        typedData.message.nonce = 1;
        typedData.message.additionalHash = channelID;
        let paySig = eipEcsign(signHash(), providerPrivateKey);
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
        let paySig = eipEcsign(signHash(), userPrivateKey);
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