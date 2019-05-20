const Web3 = require('web3');
const config = require('./conf.json');
const [gasprice,gaslimit] =[config.gasPrice.token,config.gasLimit.token];
const chain = config.eth;
const OnchainPayment = require('./build/contracts/LiteXToken.json');
const constructArgs = [];
var Tx = require('ethereumjs-tx');
const privateKey = chain.privateKey;
const web3 = new Web3(Web3.givenProvider || chain.provider);
const account = web3.eth.accounts.privateKeyToAccount(privateKey) // create account by private key from config
web3.eth.accounts.wallet.add(account) // add account to cita

const deploy = async () => {
  console.log("start token deploy");
  let address = web3.eth.accounts.wallet[0].address;
  let balance = await web3.eth.getBalance(address);
  const MyContract = new web3.eth.Contract(OnchainPayment.abi);
  const bytecodeWithParam = await MyContract.deploy({
    data: OnchainPayment.bytecode,
    arguments: constructArgs,
  }).encodeABI(); // console.log("abi is ", result);
  const nonce = await web3.eth.getTransactionCount(address);
  let transactionHash = await executeTransaction(bytecodeWithParam, nonce);
  // console.log('transactionHash:', transactionHash);
  let receipt;
  let repeatTime = 0;
  while (repeatTime++ < 100) {
    try {
      receipt = await web3.eth.getTransactionReceipt(transactionHash);
      // console.log(receipt)
      if (receipt != null) {
        break;
      }
    } catch (error) {
      console.err("can't get token receipt")
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  // console.log("receipt:"+receipt);
  // console.log("receipt.contractAddress:"+receipt.contractAddress);
  if(receipt != null){
    return receipt.contractAddress;
  }
};

async function executeTransaction(bytecodeWithParam, nonce) {
  var rawTransaction = {
    "from": account.address,
    "nonce": "0x" + nonce.toString(16),
    "gasPrice": web3.utils.toHex(gasprice * 1e9),
    "gasLimit": web3.utils.toHex(gaslimit),
    "data": bytecodeWithParam,
  };
  var privKey = Buffer.from(privateKey.substr(2), 'hex');
  var tx = new Tx(rawTransaction);
  tx.sign(privKey);
  var serializedTx = tx.serialize();
  return new Promise((resolve, reject) => {
    web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'))
      .on('transactionHash', (transactionHash => {
        // console.log("transactionHash:"+transactionHash);
        resolve(transactionHash);
      }))
      .on('error', (err) => {
        console.error(err);
        reject(err);
      });
  })
}
// deploy();
module.exports = {
  deploy
}