const Web3 = require('web3');
//Factory.json file contains my compiled Factory.sol file
const OnchainPayment = require('./build/contracts/OnchainPayment.json');
const constructArgs = ['0x4Aa670bCe722B9698A670afc968b1dE5f1553df9', '0xa08105d7650Fe007978a291CcFECbB321fC21ffe', 1, 9];


var Tx = require('ethereumjs-tx');

const privateKey = "0xDDC1738AC05989633A43A49FB8B9FBE77970CCA9F85921768C2BD8FABBFB2E55";

const web3 = new Web3(Web3.givenProvider || 'http://54.250.21.165:8545');
const account = web3.eth.accounts.privateKeyToAccount(privateKey) // create account by private key from config

web3.eth.accounts.wallet.add(account) // add account to cita


const deploy = async () => {
    console.log("start deploy");
    let address = web3.eth.accounts.wallet[0].address;

    let balance = await web3.eth.getBalance(address);
    console.log("balance is ", balance);


    console.log('Attempting to deploy from account: ', address);
    const MyContract = new web3.eth.Contract(OnchainPayment.abi);
    // console.log("MyContract is ", MyContract);


    const bytecodeWithParam = await MyContract.deploy({
      data: OnchainPayment.bytecode,
      arguments: constructArgs,
    }).encodeABI();   // console.log("abi is ", result);

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
        "gasLimit": web3.utils.toHex(7000000),
        // "to": contractAddress,
        // "value": "0x0",
        "data": bytecodeWithParam,
        // "chainId": chainId
      };


      var privKey = new Buffer(privateKey.substr(2), 'hex');
      var tx = new Tx(rawTransaction);
      tx.sign(privKey);

      var serializedTx = tx.serialize();

      web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'), function(err, hash) {
        if (!err){

            console.log(hash); // "0x7f9fade1c0d57a7af66ab4ead79fade1c0d57a7af66ab4ead7c2c2eb7b11a91385"

        }else{
            console.log('error', err);
        }
      });
}


console.log("start");
deploy();
