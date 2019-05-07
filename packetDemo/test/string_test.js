const ethUtil = require('ethereumjs-util');
var testString = artifacts.require("testString");
var RLP = require('rlp');

contract('Session', (accounts) => {
  const providerAddress = accounts[0];
  const regulatorAddress = accounts[1];
  const userAddress = accounts[2];
  const tokenAddress = accounts[3];
  const puppetAddress = accounts[4];
  const puppetAddress2 = accounts[5];
  const puppetAddress3 = accounts[6];
  const puppetAddress4 = accounts[7];
  const puppetAddress5 = accounts[8];

  const providerPrivateKey = Buffer.from("a5f37d95f39a584f45f3297d252410755ced72662dbb886e6eb9934efb2edc93", 'hex');
  const regulatorPrivateKey = Buffer.from("2fc8c9e1f94711b52b98edab123503519b6a8a982d38d0063857558db4046d89", 'hex');
  const userPrivateKey = Buffer.from("d01a9956202e7b447ba7e00fe1b5ca8b3f777288da6c77831342dbd2cb022f8f", 'hex');

  it("test string", async()=>{
    let sContract = await testString.new();
    let id = web3.utils.soliditySha3("asfasf");
    console.log("id", id);
    let res = await sContract.succ.call(accounts[0], id, 88888888);
    console.log("debug", res);
  })
});