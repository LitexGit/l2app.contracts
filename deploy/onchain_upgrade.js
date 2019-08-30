let args = process.argv;
let version;
const config = require('./conf.json');
if (args.length != 3){
  console.log("should input argument!")
  return;
}else if( version <= 0 || isNaN(args[2])){
  console.log("please input correct argument!")
  return;
}else{
  version = Number(args[2]);
}

const { Contracts, SimpleProject, ZWeb3,Transactions } = require('openzeppelin-sdk/upgrade');
const chain = config.mainchain;
const privateKey = chain.privateKey;
const config = require('./conf.json');
const output = require('./output.json');

const chain = config.mainchain;
const privateKey = chain.privateKey;
ZWeb3.initialize(chain.provider);
Transactions.setPrivateKey(privateKey)
Transactions.gasPrice = config.gasPrice.onchain;
Transactions.gasLimit = config.gasLimit.onchain;
const OnchainPayment = Contracts.getFromLocal('OnchainPayment_v'+args[2]);

const upgrade = async () => {
  console.log("start upgrade contract!")

  let creatorAddress = ZWeb3.eth().accounts.privateKeyToAccount(privateKey).address;
  // console.log("creatorAddress",creatorAddress);
  const litexProject = new SimpleProject('LitexProject', null,{ from: creatorAddress });
  let instance = await litexProject.upgradeProxy(output.ethPNAddress, OnchainPayment);
  console.log("upgrade contract success")
  console.log('Contract\'s address:'+instance.address);
  console.log('Contract\'s provider:' + (await instance.methods.provider().call()).toString() + '\n');
  console.log('Contract\'s receiver:' + (await instance.methods.receiver().call()).toString() + '\n');

}

// module.exports = {
//   deploy
// }

upgrade()