const BigNumber = web3.BigNumber;

var OffchainPayment = artifacts.require("OffchainPayment");

contract('OffchainPayment', (accounts) => {

  console.log('accounts', accounts);

  const providerAddress = accounts[0];
  const regulatorAddress = accounts[1];
  const userAddress = accounts[2];
  const tokenAddress = accounts[3];
  const puppetAddress = accounts[4];
  const puppetAddress2 = accounts[5];
  const puppetAddress3 = accounts[6];

  beforeEach(async ()=>{
    this.offchainPayment = await OffchainPayment.new(providerAddress, providerAddress, regulatorAddress, {from: providerAddress});
  });

  it("should onchainAddPuppet successfully", async() =>{

    await this.offchainPayment.onchainAddPuppet(userAddress, puppetAddress, {from: regulatorAddress})
    await this.offchainPayment.onchainAddPuppet(userAddress, puppetAddress2, {from: regulatorAddress})
    await this.offchainPayment.onchainAddPuppet(userAddress, puppetAddress3, {from: regulatorAddress})

    let puppetData = await this.offchainPayment.puppets.call(userAddress, 0);
    console.log("puppetData", puppetData);
    puppetData = await this.offchainPayment.puppets.call(userAddress, 1);
    console.log("puppetData", puppetData);

  });


  it("should onchainDisablePuppet successfully", async() => {

    await this.offchainPayment.onchainAddPuppet(userAddress, puppetAddress, {from: regulatorAddress})
    await this.offchainPayment.onchainDisablePuppet(userAddress, puppetAddress, {from: regulatorAddress})

    let puppetData = await this.offchainPayment.puppets.call(userAddress, 0);
    console.log("puppetData", puppetData);


  });

  it("should onchainOpenChannel successfully", async ()=>{

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

    let balanceProofData = await this.offchainPayment.contract.methods.balanceProofMap(channelID, userAddress).call({from: userAddress});
    console.log("balanceProofData", balanceProofData);

    assert.equal(channelData.user, userAddress, "address should be equal");
    assert.equal(channelData.userDeposit, amount, "amount should be equal");
    assert.equal(channelData.status, 1, "status should be open")

    // let userProofData = await this.offchainPayment.balanceProofMap.call(channelID, userAddress);
    // console.log("userProofData", userProofData);


    // console.log("offchainPayment", this.offchainPayment);
  });


  it("should onchainUserDeposit successfully", async() =>{

    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 10000;
    // console.log("channelID is ", channelID);
    await this.offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress} );

    let depositAmount = 10000;
    await this.offchainPayment.onchainUserDeposit( channelID, userAddress, amount + depositAmount, { from: regulatorAddress} );

    let pnData = await this.offchainPayment.paymentNetworkMap.call(tokenAddress)
    // console.log("pyamentNetworkMap data", pnData);
    let channelData = await this.offchainPayment.channelMap.call(channelID);
    // console.log("channelMap data", channelData);

    assert.equal(channelData.userDeposit, amount + depositAmount, "deposit should be equal");
    assert.equal(pnData.userTotalDeposit, amount + depositAmount, "userTotalDeposit shoule be equal");

  });

  it("should onchainProviderDeposit successfully", async()=>{

    let amount = 20000;
    await this.offchainPayment.onchainProviderDeposit(tokenAddress, amount, { from: regulatorAddress});

    let pnData = await this.offchainPayment.paymentNetworkMap.call(tokenAddress)

    assert.equal(pnData.providerDeposit, amount, "providerDeposit shoule be equal");
    assert.equal(pnData.providerBalance, amount, "providerBalance shoule be equal");

  });


  it("should onchainUserWithdraw successfully", async() => {

      let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
      let amount = 10000;
      // console.log("channelID is ", channelID);
      await this.offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress} );

      let withdrawAmount = 100;
      let lastCommitBlock = await web3.eth.getBlockNumber();
      await this.offchainPayment.onchainUserWithdraw(channelID, withdrawAmount, withdrawAmount, lastCommitBlock, { from: regulatorAddress});



      let pnData = await this.offchainPayment.paymentNetworkMap.call(tokenAddress)
      // console.log("pyamentNetworkMap data", pnData);
      let channelData = await this.offchainPayment.channelMap.call(channelID);
      // console.log("channelMap data", channelData);

      assert.equal(channelData.userBalance, amount - withdrawAmount, "userBalance should be equal");
      assert.equal(channelData.userWithdraw, withdrawAmount, "userWithdraw should be equal");
      assert.equal(pnData.userTotalWithdraw, withdrawAmount, "userTotalWithdraw shoule be equal");

  });

  it("should onchainUserWithdraw unlockAsset successfully", async()=>{

  });


  it("should onchainProviderWithdraw successfully", async() => {

    let amount = 20000;
    await this.offchainPayment.onchainProviderDeposit(tokenAddress, amount, { from: regulatorAddress});

    let withdrawAmount = 100;
    let lastCommitBlock = await web3.eth.getBlockNumber();
    await this.offchainPayment.onchainProviderWithdraw(tokenAddress, withdrawAmount, withdrawAmount , lastCommitBlock, { from: regulatorAddress});


    let pnData = await this.offchainPayment.paymentNetworkMap.call(tokenAddress);

    assert.equal(pnData.providerWithdraw, withdrawAmount, "providerWithdraw should be equal");
    assert.equal(pnData.providerBalance, amount - withdrawAmount, "providerBalance should be equal");

  });

  it("should onchainProviderWithdraw unlockAsset successfully", async()=>{

  });


  it("should onchainCooperativeSettleChannel successfully", async()=>{


    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 10000;
    // console.log("channelID is ", channelID);
    await this.offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress} );

    let balance = 1000;
    let lastCommitBlock = await web3.eth.getBlockNumber();
    await this.offchainPayment.onchainCooperativeSettleChannel(channelID, userAddress, balance, lastCommitBlock, { from: regulatorAddress});


      let pnData = await this.offchainPayment.paymentNetworkMap.call(tokenAddress)
      // console.log("pyamentNetworkMap data", pnData);
      let channelData = await this.offchainPayment.channelMap.call(channelID);
      // console.log("channelMap data", channelData);

      assert.equal(channelData.status, 3, "channel status should be equal");
      assert.equal(pnData.providerTotalSettled, amount - balance, "providerTotalSettled shoule be equal");
      assert.equal(pnData.providerBalance, amount - balance, "providerBalance shoule be equal");

  });

  it("should onchain force close channel successfully", async() => {

    let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
    let amount = 10000;
    // console.log("channelID is ", channelID);
    await this.offchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress} );

    await this.offchainPayment.onchainCloseChannel(channelID, userAddress, 20000, 1, 10000, { from: regulatorAddress});

    await this.offchainPayment.onchainPartnerUpdateProof(channelID,  20000, 1, 5000, 1, { from: regulatorAddress});

    await this.offchainPayment.onchainSettleChannel(channelID, 5000, 5000, { from: regulatorAddress});

    let closingData = await this.offchainPayment.closingChannelMap.call(channelID);
    console.log("closingData", closingData);

  });



})
