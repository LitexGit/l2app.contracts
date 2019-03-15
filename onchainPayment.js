const Web3 = require('web3');
const web3 = new Web3(Web3.givenProvider || 'http://54.250.21.165:8545');
const Tx = require('ethereumjs-tx');
const ethUtil = require('ethereumjs-util');

const user = '0x430195EBc99c0e2Fe3caA7B7dC8De8491Cf04fA9';
const userPK = Buffer.from('C84795FFCFEA582F50AB364A76270A3131826F4F01DC592F3335B71CA31E939B', 'hex');
const provider = '0xa08105d7650Fe007978a291CcFECbB321fC21ffe';
const providerPK = Buffer.from('6A22D7D5D87EFC4A1375203B7E54FBCF35FAA84975891C5E3D12BE86C579A6E5', 'hex');
const regulator = '0x4Aa670bCe722B9698A670afc968b1dE5f1553df9';
const regulatorPK = Buffer.from('DDC1738AC05989633A43A49FB8B9FBE77970CCA9F85921768C2BD8FABBFB2E55', 'hex');

const contract = '0x224D32fB0A315ACDE49A6eaDD383977746B59107';

async function openChannel(user, puppet, window, token, amount) {
    let data = web3.eth.abi.encodeFunctionCall({ "constant": false, "inputs": [ { "name": "user", "type": "address" }, { "name": "puppet", "type": "address" }, { "name": "settleWindow", "type": "uint256" }, { "name": "token", "type": "address" }, { "name": "amount", "type": "uint256" } ], "name": "openChannel", "outputs": [], "payable": true, "stateMutability": "payable", "type": "function" }, [user, puppet, window, token, amount]);

    let res = await sendTx(user, contract, data, '0.1', userPK);
    if (res == 'err') {
        console.log('err');
    } else {
        console.log(res);
    }
}

const channelID = '0x195f254b59775e83809e15207f6b16b69df22e405434078f31224c51fccdea66';

async function providerDeposit(token, amount) {
    let data = web3.eth.abi.encodeFunctionCall({ "constant": false, "inputs": [ { "name": "token", "type": "address" }, { "name": "amount", "type": "uint256" } ], "name": "providerDeposit", "outputs": [], "payable": true, "stateMutability": "payable", "type": "function" }, [token, amount]);

    let res = await sendTx(provider, contract, data, '0.1', providerPK);
    if (res == 'err') {
        console.log('err');
    } else {
        console.log(res);
    }
}

async function userWithdraw(channelID, amount, lastCommitBlock, receiver) {
    let messageHash = web3.utils.soliditySha3(contract, channelID, amount, lastCommitBlock);
    let providerSignature = myEcsign(messageHash, providerPK);
    let regulatorSignature = myEcsign(messageHash, regulatorPK);

    let data = web3.eth.abi.encodeFunctionCall({ "constant": false, "inputs": [ { "name": "channelID", "type": "bytes32" }, { "name": "withdraw", "type": "uint256" }, { "name": "lastCommitBlock", "type": "uint256" }, { "name": "providerSignature", "type": "bytes" }, { "name": "regulatorSignature", "type": "bytes" }, { "name": "receiver", "type": "address" } ], "name": "userWithdraw", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }, [channelID, amount, lastCommitBlock, providerSignature, regulatorSignature, receiver]);

    let res = await sendTx(user, contract, data, '0', userPK);
    if (res == 'err') {
        console.log('err');
    } else {
        console.log(res);
    }
}

async function providerWithdraw (token, balance, lastCommitBlock) {
    let messageHash = web3.utils.soliditySha3(contract, token, balance, lastCommitBlock);
    let signature = myEcsign(messageHash, regulatorPK);

    let data = web3.eth.abi.encodeFunctionCall({ "constant": false, "inputs": [ { "name": "token", "type": "address" }, { "name": "balance", "type": "int256" }, { "name": "lastCommitBlock", "type": "uint256" }, { "name": "regulatorSignature", "type": "bytes" } ], "name": "providerWithdraw", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }, [token, balance, lastCommitBlock, signature]);

    let res = await sendTx(provider, contract, data, '0', providerPK);
    if (res == 'err') {
        console.log('err');
    } else {
        console.log(res);
    }
}

async function cooperativeSettle (channelID, balance, lastCommitBlock) {
    let messageHash = web3.utils.soliditySha3(contract, channelID, balance, lastCommitBlock);
    let providerSignature = myEcsign(messageHash, providerPK);
    let regulatorSignature = myEcsign(messageHash, regulatorPK);

    let data = web3.eth.abi.encodeFunctionCall({ "constant": false, "inputs": [ { "name": "channelID", "type": "bytes32" }, { "name": "balance", "type": "uint256" }, { "name": "lastCommitBlock", "type": "uint256" }, { "name": "providerSignature", "type": "bytes" }, { "name": "regulatorSignature", "type": "bytes" } ], "name": "cooperativeSettle", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }, [channelID, balance, lastCommitBlock, providerSignature, regulatorSignature]);

    let res = await sendTx(user, contract, data, '0', userPK);
    if (res == 'err') {
        console.log('err');
    } else {
        console.log(res);
    }
}

openChannel(user, user, 5, '0x0000000000000000000000000000000000000000', 0);

// providerDeposit('0x0000000000000000000000000000000000000000', 0);

// userWithdraw(channelID, web3.utils.toWei('0.01'), 99999999, user);

// providerWithdraw('0x0000000000000000000000000000000000000000', web3.utils.toWei('0.09'), 99999999);

// cooperativeSettle(channelID, web3.utils.toWei('0.04'), 9999999);








async function sendTx(from, to, data, value, privateKey) {
    var nonce = await web3.eth.getTransactionCount(from);
    var txData = {
        nonce: web3.utils.toHex(nonce),
        gasLimit: web3.utils.toHex(5000000),
        gasPrice: web3.utils.toHex(20e9), // 20 Gwei
        from: from,
        to: to,
        data: data,
        value: web3.utils.toHex(web3.utils.toWei(value, 'ether')) 
    }
    const transaction = new Tx(txData)
    transaction.sign(privateKey)
    const serializedTx = transaction.serialize().toString('hex')
    let res = await web3.eth.sendSignedTransaction('0x' + serializedTx)
    if (res && res.status) {
        return res;
    } else {
        return "err";
    }
}

function myEcsign(messageHash, privateKey) {
    messageHash = Buffer.from(messageHash.substr(2), 'hex')
    let signatureObj = ethUtil.ecsign(messageHash, privateKey);
    let signatureHexString = ethUtil.toRpcSig(signatureObj.v, signatureObj.r, signatureObj.s).toString('hex');
    let signatureBytes = web3.utils.hexToBytes(signatureHexString);
    return signatureBytes;
}