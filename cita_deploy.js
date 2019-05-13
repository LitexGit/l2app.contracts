const deploy = function (onchainPayment,operator) {
  console.log("start cita deploy");
  const {
    default: CITASDK
  } = require('@cryptape/cita-sdk')

  const {
    abi,
    bytecode
  } = require('./build/contracts/OffchainPayment.json')

  const config = require("./conf.json");
  const chain = config.cita;
  let cita_constructArgs = config.cita_constructArgs;
  // console.log(cita_constructArgs)
  constructArgs = [
    onchainPayment,
    cita_constructArgs.provider,
    cita_constructArgs.regulator,
    operator,
    cita_constructArgs.chainID
  ];

  var cita = CITASDK(chain.provider);
  const account = cita.base.accounts.privateKeyToAccount(chain.privateKey); // create account by private key from config
  cita.base.accounts.wallet.add(account); // add account to cita

  let transaction = {
    nonce: 999999,
    quota: 8000000,
    chainId: 1,
    version: 1,
    validUntilBlock: 999999,
    value: '0x0',
    from: cita.base.accounts.wallet[0].address,
    privateKey: cita.base.accounts.wallet[0].privateKey,
  }

  transaction = {
    ...transaction,
    from: cita.base.accounts.wallet[0].address
  }

  // contract contract instance
  const myContract = new cita.base.Contract(abi)

  //return Promis of contractAddress
  return new Promise((resolve, reject) => {
    cita.base
      .getBlockNumber()
      .then(current => {
        transaction.validUntilBlock = +current + 88 // update transaction.validUntilBlock
        // deploy contract
        return myContract
          .deploy({
            data: bytecode,
            arguments: constructArgs,
          })
          .send(transaction)
      })
      .then(txRes => {
        if (txRes.hash) {
          // get transaction receipt
          return cita.listeners.listenToTransactionReceipt(txRes.hash)
        } else {
          throw new Error('No Transaction Hash Received')
        }
      })
      .then(res => {
        const {
          contractAddress,
          errorMessage
        } = res
        if (errorMessage) throw new Error(errorMessage)
        //console.log(`contractAddress is: ${contractAddress}`)
        // console.log(contractAddress);
        resolve(contractAddress);
        _contractAddress = contractAddress
        return cita.base.storeAbi(contractAddress, abi, transaction) // store abi on the chain
      })
      .then(res => {
        if (res.errorMessage) throw new Error(res.errorMessage)
        return cita.base.getAbi(_contractAddress, 'pending') //.then(console.log) // get abi from the chain
      })
      .catch(err =>{console.error(err);reject(null)})
  })
}

module.exports = {
  deploy
}
// deploy()