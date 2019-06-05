const Web3 = require('web3');
const OnchainPayment = require('../build/contracts/OnchainPayment.json');
const fs = require('fs');
const config = require('./conf.json');
const [gasprice,gaslimit] =[config.gasPrice.onchain,config.gasLimit.onchain];
const chain = config.eth;
let constructArgs = config.onchain_constructArgs;
constructArgs = [
  constructArgs.regulator,
  constructArgs.provider,
  constructArgs.settleWindowMin,
  constructArgs.settleWindowMax,
  constructArgs.chainID
];
var Tx = require('ethereumjs-tx');

const privateKey = chain.privateKey;
const web3 = new Web3(Web3.givenProvider || chain.provider);
const account = web3.eth.accounts.privateKeyToAccount(privateKey) // create account by private key from config
web3.eth.accounts.wallet.add(account) // add account to cita

const deploy = async () => {
  console.log("start eth deploy");
  let address = web3.eth.accounts.wallet[0].address;
  let balance = await web3.eth.getBalance(address);
  const MyContract = new web3.eth.Contract(OnchainPayment.abi);
  const bytecodeWithParam = await MyContract.deploy({
    data: OnchainPayment.bytecode,
    arguments: constructArgs,
  }).encodeABI();
  const nonce = await web3.eth.getTransactionCount(address);
  // get transactionHash to find contractAddress
  let transactionHash = await executeTransaction(bytecodeWithParam, nonce);
  // console.log('transactionHash:', transactionHash);
  let receipt;
  let repeatTime = 0;
  while (true) {
    try {
      receipt = await web3.eth.getTransactionReceipt(transactionHash);
      if (receipt != null) {
        break;
      }
    } catch (error) {

    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if(receipt != null){
    return receipt.contractAddress;
  }
};


async function executeTransaction(bytecodeWithParam, nonce) {
  let a;
  var rawTransaction = {
    "from": account.address,
    "nonce": "0x" + nonce.toString(16),
    "gasPrice": web3.utils.toHex(gasprice * 1e9),
    "gasLimit": web3.utils.toHex(gaslimit),
    // "to": contractAddress,
    // "value": "0x0",
    "data": bytecodeWithParam,
    // "chainId": chainId
  };
  var privKey = Buffer.from(privateKey.substr(2), 'hex');
  var tx = new Tx(rawTransaction);
  tx.sign(privKey);
  var serializedTx = tx.serialize();
  console.log('serializedTx', serializedTx);

  return new Promise((resolve, reject) => {
    web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'))
      .on('transactionHash', (transactionHash => {
        resolve(transactionHash)
      }))
      .on('error', (err) => {
        reject(err);
      });
  });
}


// web3.eth.isSyncing().then(console.log);
// deploy();
module.exports = {
  deploy
}

// deploy();