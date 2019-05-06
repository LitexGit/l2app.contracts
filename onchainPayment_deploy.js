const Web3 = require('web3');
const OnchainPayment = require('./build/contracts/OnchainPayment.json');
const config = require('./conf.json');
const chain = config.rinkeby;
const constructArgs = ['0x4Aa670bCe722B9698A670afc968b1dE5f1553df9', '0xa08105d7650Fe007978a291CcFECbB321fC21ffe', 1, 9, 4];
var Tx = require('ethereumjs-tx');

const privateKey = chain.privateKey;
const web3 = new Web3(Web3.givenProvider || chain.provider);
const account = web3.eth.accounts.privateKeyToAccount(privateKey) // create account by private key from config
web3.eth.accounts.wallet.add(account) // add account to cita

const deploy = async () => {
    let address = web3.eth.accounts.wallet[0].address;
    let balance = await web3.eth.getBalance(address);
    const MyContract = new web3.eth.Contract(OnchainPayment.abi);
    const bytecodeWithParam = await MyContract.deploy({
      data: OnchainPayment.bytecode,
      arguments: constructArgs,
    }).encodeABI();   
    const nonce = await web3.eth.getTransactionCount(address);
    await executeTransaction(bytecodeWithParam, nonce);
};

async function executeTransaction(bytecodeWithParam, nonce){
    var rawTransaction = {
        "from": account.address,
        "nonce": "0x" + nonce.toString(16),
        "gasPrice": web3.utils.toHex(50 * 1e9),
        "gasLimit": web3.utils.toHex(6666666),
        // "to": contractAddress,
        // "value": "0x0",
        "data": bytecodeWithParam,
        // "chainId": chainId
      };
      var privKey = Buffer.from(privateKey.substr(2), 'hex');
      var tx = new Tx(rawTransaction);
      tx.sign(privKey);
      var serializedTx = tx.serialize();
      web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex')).on('receipt', function(receipt){console.log(receipt.contractAddress)});
}

web3.eth.isSyncing().then(console.log);
deploy();
