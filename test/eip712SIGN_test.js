const ethUtil = require("ethereumjs-util");
const abi = require("ethereumjs-abi");

const BigNumber = web3.BigNumber;

var OffchainPayment = artifacts.require("OffchainPayment");
var eip = artifacts.require("eip712");

let { typedData, signHash } = require("./utils/typedData");
const { getPrivateKeys } = require("./utils/keys");

const { tEcsign, myEcsign, personalSign } = require("./utils/helper");

contract("OffchainPayment", accounts => {
  console.log("accounts", accounts);

  const providerAddress = accounts[0];
  const regulatorAddress = accounts[1];
  const userAddress = accounts[2];
  const tokenAddress = accounts[3];
  const puppetAddress = accounts[4];
  const puppetAddress2 = accounts[5];
  const puppetAddress3 = accounts[6];

  let providerPrivateKey, regulatorPrivateKey, userPrivateKey;

  before(async () => {
    let keys = await getPrivateKeys();
    providerPrivateKey = keys.providerPrivateKey;
    regulatorPrivateKey = keys.regulatorPrivateKey;
    userPrivateKey = keys.userPrivateKey;
  });

  beforeEach(async () => {
    this.offchainPayment = await OffchainPayment.new(
      providerAddress,
      providerAddress,
      regulatorAddress,
      regulatorAddress,
      1,
      { from: providerAddress }
    );
  });

  it("eip should succ", async () => {
    this.eip = await eip.new(1, { from: providerAddress });

    let channelID =
      "0x195f254b59775e83809e15207f6b16b69df22e405434078f31224c51fccdea66";
    let balance = 1;
    let nonce = 8;

    typedData.domain.verifyingContract = this.eip.address;
    typedData.message.channelID = channelID;
    typedData.message.additionalHash = channelID;

    console.log(typedData);

    let sig = tEcsign(signHash(), userPrivateKey);
    let res = await this.eip.transfer(
      channelID,
      balance,
      nonce,
      channelID,
      sig,
      { from: userAddress }
    );
    console.log("res", res.receipt.logs[0]);
    assert.equal(
      res.receipt.logs[0].args.r.toLowerCase(),
      userAddress.toLowerCase()
    );
  });
});
