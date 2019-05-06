const {
    default: CITASDK
  } = require('@cryptape/cita-sdk')
  
  const {
    abi,
    bytecode
  } = require('./build/contracts/Session.json')
  // } = require('./cita_compiled.js');
  
  let constructArgs = [];
  
  let config = {
    // chain: 'https://node.cryptape.com',
  // chain: 'http://13.113.50.143:1337',
  // chain: 'http://121.196.200.225:1337',
    chain: 'http://54.64.76.19:1337',
    privateKey: '0xDDC1738AC05989633A43A49FB8B9FBE77970CCA9F85921768C2BD8FABBFB2E55',
  }
  
  
  
  var cita = CITASDK(config.chain);
  const account = cita.base.accounts.privateKeyToAccount(config.privateKey); // create account by private key from config
  cita.base.accounts.wallet.add(account); // add account to cita
  
  let defaultAddress = cita.base.accounts.wallet[0].address;
  
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
  