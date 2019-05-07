const {
  default: CITASDK
} = require('@cryptape/cita-sdk')

const {
  abi,
  bytecode
} = require('./build/contracts/OffchainPayment.json')

let constructArgs = ["0x8ea85d87d62d79ce11e420cf1e9d9f31d9b5c5b8", '0xa08105d7650Fe007978a291CcFECbB321fC21ffe', '0x4Aa670bCe722B9698A670afc968b1dE5f1553df9', "0xA214041fFDE8c9b8623aBD6216F13fb2ED809DB6",
4];

let config = require("./conf.json");
config = config.cita;

var cita = CITASDK(config.provider);
const account = cita.base.accounts.privateKeyToAccount(config.privateKey); // create account by private key from config
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
    console.log(contractAddress);
    _contractAddress = contractAddress
    return cita.base.storeAbi(contractAddress, abi, transaction) // store abi on the chain
  })
  .then(res => {
    if (res.errorMessage) throw new Error(res.errorMessage)
    return cita.base.getAbi(_contractAddress, 'pending')//.then(console.log) // get abi from the chain
  })
  .catch(err => console.error(err))
