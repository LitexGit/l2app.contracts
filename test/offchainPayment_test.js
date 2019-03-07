const BigNumber = web3.BigNumber;

var OffchainPayment = artifacts.require("OffchainPayment");

contract('OffchainPayment', (accounts) => {

  console.log('accounts', accounts);

  const providerAddress = accounts[0];
  const regulatorAddress = accounts[1];
  const userAddress = accounts[2];
  const tokenAddress = accounts[3];

  beforeEach(async ()=>{
    this.offchainPayment = await OffchainPayment.new(providerAddress, providerAddress, regulatorAddress, {from: providerAddress});
  });


  it("should open channel successfully", async ()=>{

    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 10000;

    console.log("channelID is ", channelID);
    await this.offchainPayment.onchainOpenChannel(
      userAddress,
      tokenAddress,
      channelID,
      amount,
      { from: regulatorAddress}
    );

    let pnData = await this.offchainPayment.paymentNetworkMap.call(tokenAddress)
    console.log("pyamentNetworkMap data", pnData);
    let channelData = await this.offchainPayment.channelMap.call(channelID);
    console.log("channelMap data", channelData);

    assert.equal(channelData.user, userAddress, "address should be equal");
    assert.equal(channelData.userDeposit, amount, "amount should be equal");
    assert.equal(channelData.status, 1, "status should be open")

    // let userProofData = await this.offchainPayment.balanceProofMap.call(channelID, userAddress);
    // console.log("userProofData", userProofData);
    // console.log("offchainPayment", this.offchainPayment);
  });


})
