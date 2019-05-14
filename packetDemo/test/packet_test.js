const ethUtil = require('ethereumjs-util');
var PacketVerify = artifacts.require("PacketVerify");
var Debug = artifacts.require("Debug");
var RLP = require('rlp');
// const abi = require('ethereumjs-abi');
// var protobuf = require("protobufjs");
// protobuf.common('google/protobuf/descriptor.proto', {})
var rlpedData = require("./rlpedData");

function myEcsign(messageHash, privateKey) {
   // messageHash = Buffer.from(messageHash.substr(2), 'hex')
    let signatureObj = ethUtil.ecsign(messageHash, privateKey);
    let signatureHexString = ethUtil.toRpcSig(signatureObj.v, signatureObj.r, signatureObj.s).toString('hex');
    let signatureBytes = web3.utils.hexToBytes(signatureHexString);
    return signatureBytes;
  }

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

  it("verify regular data should succ", async()=>{
    let instance = await PacketVerify.new();
    // console.log(rlpedData);
    let res = await instance.verify.call(rlpedData.regularData);
    //assert.equal(res.toNumber(), 0, "error: verify regular data failed")
    console.log('res', res);
    // let res = await instance.verify(rlpedData);
    // console.log('res', res.receipt.logs[0]);
  })

  // it("verify wrong balance data should succ", async()=>{
  //   let instance = await PacketVerify.new();
  //   // console.log(rlpedData);
  //   let res = await instance.verify.call(rlpedData.wrongData);
  //   //assert.equal(res.toNumber(), 2001, "error: verify wrong balance data failed");
  //   console.log('res', res);
  //   // let res = await instance.verify(rlpedData);
  //   // console.log('res', res.receipt.logs[0]);
  // })

  // it("verify cancel data should succ", async()=>{
  //   let instance = await PacketVerify.new();
  //   // console.log(rlpedData);
  //   let res = await instance.verify.call(rlpedData.cancelData);
  //   //assert.equal(res.toNumber(), 3001, "error: verify cancel data failed");
  //   console.log('res', res);
  //   // let res = await instance.verify(rlpedData);
  //   // console.log('res', res.receipt.logs[0]);
  // })

  // it("verify appchain data should succ", async()=>{
  //   let instance = await PacketVerify.new();
  //   // console.log(rlpedData);
  //   let res = await instance.verify.call(rlpedData.appchainData);
  //   //assert.equal(res.toNumber(), 3001, "error: verify cancel data failed");
  //   console.log('res', res);

  //   //res = await instance.testRlp.call(rlpedData.appchainData);
  //   //console.log("msmsmsmsmsmsmsms", res);
  //   // let res = await instance.verify(rlpedData);
  //   // console.log('res', res.receipt.logs[0]);
  // })

  // it("debug", async()=>{
  //   let debug = await Debug.new();
  //   let res = await debug.decodePHR.call("0xf86994339c45ddfefd081b243ff6ff2963b59439bc353a94c5ec24a393ad6b3aaf5da2f6d1792cfc9a870b579492888bf647ace96533598db8cffd8aa0bd035b5f94a6a36c17cfa6d86697d693f9d33cbd62c969e942948717e66177bba25a14697e32c097b26b01accdcf");
  //   console.log("debug", res);
  // })
});