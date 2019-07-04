# l2app.contracts

## Overview

l2app.contracts includes a series of smart contracts for l2app framework. With these contracts and other tools, a layer2 based decentralized application can be built. Currently Ethereum can handle around 15 transactions per second. Different from ethereum, l2app can support a large number of concurrent access from user. Besides, l2app can ensure the safty of the user's assets as the same as Ethereum.

For more information about l2app, please refer to l2.app

## Solidity Version

Solidity ^0.4.24 or above is required for l2app

## Code sturcture

The following is the structure of l2app.contracts:

### contract folder

- **lib** libraries for contracts
  - Address.sol
  - ECDSA.sol 
  - ERC20.sol
  - MultiSignInterface.sol
  - Ownable.sol
  - RLPReader.sol  
- **OnchainPayment_1.0.sol** payment channel contract for user and cp, including open/deposit/close/withdraw interface. It should be deployed on ethereum.
- **OffchainPayment.sol** contract for payment channel, including data not only from ethereum, but also offchain transaction data. It should be deployed on cita.
- **Session.sol** contract for game message, players and cp send message to each other when playing game. the message include game actions and payment infomation. It should be deployed on cita too.
- **MultiSigWallet.sol** contract for operator to sync ethereum state to cita. The operator watch the event from onchainPayment all the time, then submit it to MultiSigWallet immediately, other operator will review the submition and confirm/reject it. It should be deployed on cita.

### test folder
- **utils**
  - helper.js: signature functions
  - keys.js: address/key pair generate functions for test
  - typedData.js: Sign_TypedData V3 validation functions
- some test scripts for l2app.contracts

### deploy folder
- **deploy.js** deploy main entry
- **eth_deploy.js** deploy script for OnchainPayment_1.0.sol
- **cita_deploy.js** deploy script for OffchainPayment.sol
- **session_deploy.js** deploy script for Session.sol
- **operator_deploy.js** deploy script for MultiSigWallet.sol

## Test and Deploy

### how to test

1. Install node v10
2. Go to project root directory and install dependencies
```
npm install
```
3. Install truffle suite
```
npm install -g truffle ganache-cli
```
4. start ganache-cli
```
ganache-cli -l 8000000
```
5. copy ganache's mnemonic, replace mnemonic in test/utils/keys.js
```
const mnemonic =
  "member guess canvas moment boring tragic find thumb cart identify above dutch"; // put your ganache mnemonic here.

const bip39 = require("bip39");
const hdkey = require("ethereumjs-wallet/hdkey");
const wallet = require("ethereumjs-wallet");
```
6. Run truffle test
```
truffle test
```

### how to deploy
1. Go to project root direct and install node dependencies
```
npm install
```
2. Go to deploy/ directory, copy conf.json.rinkeby to conf.json
```
cd deploy
```
```
cp conf.json.rinkeby conf.json
```
3. modify conf.json with your own configurations
```JSON
{
  "eth": {
    "provider": "http://39.96.8.192:8545",   // ethereum rpc endpoint
    "privateKey": "0xC2D37C42FBAEBC5CAB122A05B49414C4C0C446365AAE224CBF81ED018AE83F0A"      // private key to deploy ethereum contract
  },
  "cita": {
    "provider": "http://39.106.71.164:1337",     // cita rpc endpoint
    "privateKey": "0x3D241518B9406184C13795CD228FBC04B0AEF26A31738B6DEE47F68C1E9B8CB5"   // private to deploy cita contract
  },
  "onchain_constructArgs": {
    "regulator": "0x0546C39255789663648b3116Bf116FD2078FFDb9",                          //use your own regulator address
    "provider": "0x236639F73ED3C3d6d40cDC10663Fea4B9FD78931",                           // use your own cp address
    "settleWindowMin": 1,                                                               // minimum settle window for user force-close state channel
    "settleWindowMax": 250,                                                             // max settle window for user force-close state channel
    "chainID": 4                                                                        // ethereum's chainID
  },
  "operator_constructArgs": {
    "owners": ["0x4Aa670bCe722B9698A670afc968b1dE5f1553df9"],                           // operator's address
    "required": 1                                                                       // the required number of multiSig operator contract
  },
  "cita_constructArgs": {
    "provider": "0x236639F73ED3C3d6d40cDC10663Fea4B9FD78931",                           // regulator address, the same as onchain_constructArgs.regulator
    "regulator": "0x0546C39255789663648b3116Bf116FD2078FFDb9",                          //cp address, the same as onchain_constructArgs.provider
    "chainID": 4                                                                        // ethereum's chainID
  },
  "gasPrice": {
    "onchain": 3.1,                                                                     // gas price used when deploy onchain payment contract
    "token": 3.1                                                                        // gas price used when dploy onchain token contract
  },
  "gasLimit": {
    "onchain": 6666666,                                                                 
    "token": 6666666
  }
}

```
4. Run deploy.js to deploy contracts
```
node deploy.js
```
5. Get address of deployed contracts from output.json. (deploy.js will write all contracts related infomation to output.json)
