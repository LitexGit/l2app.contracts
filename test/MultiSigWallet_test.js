const BigNumber = web3.BigNumber;

var MultiSigWallet = artifacts.require("MultiSigWallet");

contract('MultiSigWallet', (accounts) => {

  console.log('accounts', accounts);

  const operator1 = accounts[0];
  const operator2 = accounts[1];
  const operator3 = accounts[2];
  const operator4 = accounts[3];

  beforeEach(async()=>{
    this.multiSigWallet = await MultiSigWallet.new([operator1, operator2, operator3, operator4], 3);
  });

  it("should change requirements successfully", async()=>{


    let currentRequired = await this.multiSigWallet.required.call();
    console.log('currentRequired ', currentRequired );
    console.log('web3Version', web3.version)
    // console.log('method', this.multiSigWallet.changeRequirement(4));


    let txHash = web3.utils.sha3("hello world");
    let ethBlockNumber = await web3.eth.getBlockNumber();
    let destination= this.multiSigWallet.address;
    let value = 0;
    let data = this.multiSigWallet.contract.methods.changeRequirement(4).encodeABI();
    let execResult = await this.multiSigWallet.submitTransaction(txHash, ethBlockNumber, destination, value, data, {from: operator1});
    let transactionId =  execResult.logs[0].args.transactionId;

    currentRequired = await this.multiSigWallet.required.call();
    console.log('currentRequired ', currentRequired );

    await this.multiSigWallet.confirmTransaction(transactionId, {from: operator2});
    currentRequired = await this.multiSigWallet.required.call();
    console.log('currentRequired ', currentRequired );

    await this.multiSigWallet.confirmTransaction(transactionId, {from: operator3});
    currentRequired = await this.multiSigWallet.required.call();
    console.log('currentRequired ', currentRequired );





  });


});
