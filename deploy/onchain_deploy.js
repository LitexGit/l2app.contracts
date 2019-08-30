const { Contracts, SimpleProject, ZWeb3,Transactions } = require('openzeppelin-sdk/upgrade');
const config = require('./conf.json');

const chain = config.mainchain;
const privateKey = chain.privateKey;
let constructArgs = config.onchain_constructArgs;
constructArgs = [
  constructArgs.regulator,
  constructArgs.provider,
  constructArgs.settleWindowMin,
  constructArgs.settleWindowMax,
  constructArgs.chainID
];

ZWeb3.initialize(chain.provider);
Transactions.setPrivateKey(privateKey)
Transactions.gasPrice = config.gasPrice.onchain;
Transactions.gasLimit = config.gasLimit.onchain;
// console.log(`gasPrice: ${Transactions.gasPrice},gasLimit: ${Transactions.gasLimit}`)
const OnchainPayment_v0 = Contracts.getFromLocal('OnchainPayment_v0');


const deploy = async () => {
  console.log("start main net deploy");
  let creatorAddress = ZWeb3.eth().accounts.privateKeyToAccount(privateKey).address;
  // console.log("creatorAddress",creatorAddress);

  const litexProject = new SimpleProject('LitexProject', null,{ from: creatorAddress });
  // console.log(litexProject)
  //creat Proxy
  let instance = await litexProject.createProxy(OnchainPayment_v0,{initArgs:constructArgs})
  // console.log('Contract\'s address:'+instance.address);
  // console.log('Contract\'s provider:' + (await instance.methods.provider().call()).toString() + '\n');
  return instance.address;

}

module.exports = {
  deploy
}
// deploy()
