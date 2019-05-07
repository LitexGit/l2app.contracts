const Web3 = require('web3');
//Factory.json file contains my compiled Factory.sol file
const OnchainPayment = require('./build/contracts/Etherscan.json');
const constructArgs = [];


var Tx = require('ethereumjs-tx');

const privateKey = "0xDDC1738AC05989633A43A49FB8B9FBE77970CCA9F85921768C2BD8FABBFB2E55";

const web3 = new Web3(Web3.givenProvider || 'http://39.96.8.192:8545');
const account = web3.eth.accounts.privateKeyToAccount(privateKey) // create account by private key from config

web3.eth.accounts.wallet.add(account) // add account to cita


const deploy = async () => {
    //console.log("start deploy");
    let address = web3.eth.accounts.wallet[0].address;

    let balance = await web3.eth.getBalance(address);
    //console.log("balance is ", balance);


    //console.log('Attempting to deploy from account: ', address);
    //const MyContract = new web3.eth.Contract(OnchainPayment.abi);
    // console.log("MyContract is ", MyContract);


    const bytecodeWithParam = OnchainPayment.bytecode;

    const nonce = await web3.eth.getTransactionCount(address);
    await executeTransaction(bytecodeWithParam, nonce);

    //This will display the address to which your contract was deployed
    // console.log('Contract deployed to: ', result.options.address);
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

      // web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'), function(err, hash) {
      //   if (!err){

      //       //console.log("jj", hash); // "0x7f9fade1c0d57a7af66ab4ead79fade1c0d57a7af66ab4ead7c2c2eb7b11a91385"

      //   }else{
      //       //console.log('error', err);
      //   }
      // });
      web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex')).on('receipt', function(receipt){console.log(receipt.contractAddress)});
}

//web3.eth.isSyncing().then(console.log);

//console.log("start");
deploy();