var protobuf = require("protobufjs");  //npm i protobufjs
protobuf.common('google/protobuf/descriptor.proto', {})

// path of your file.proto
let transferPB = await protobuf.load("/Users/vincent/Develop/l2ContractTruffle/contracts/proto/transfer.proto");
  
// Obtain a message type, TransferData is package in file.proto, Transfer is message in file.proto
var Transfer = transferPB.lookupType("TransferData.Transfer");

// Exemplary payload
// web3.utils.hexToBytes => solType(bytes32), [number] => solType(uint256), web3.utils.hexToBytes => solType(address)
var payload = {channelID: web3.utils.hexToBytes(channelID), balance: [1], nonce: [8], amount: [1], additionalHash: web3.utils.hexToBytes(additionalHash)};
// Verify the payload if necessary (i.e. when possibly incomplete or invalid)
var errMsg = Transfer.verify(payload);
if (errMsg)
    throw Error(errMsg);

// Create a new message
var message = Transfer.create(payload); // or use .fromObject if conversion is necessary

// Encode a message to an Uint8Array (browser) or Buffer (node)
var buffer = Transfer.encode(message).finish().toJSON().data; // bytes generated