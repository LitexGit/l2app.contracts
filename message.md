### message struct
```javascript
struct Message {
    address from;
    address to;
    bytes32 sessionID;
    uint mType;
    bytes content;
    bytes signature;

    bytes32 channelID;
    uint256 balance;
    uint256 nonce;

    uint256 amount;
    bytes32 additionalHash;
    bytes paymentSignature;
}
```

### message type
1. 用户发送CP的hash(R)、CP的signature、自己的R、下注modulo、下注betMask、并对自己自己发送内容签名，还需发送transfer相关信息(channelID,balance,nonce,amount,additionHash)，并对其签名
> content:
{
bytes32 providerRandomHash,
bytes32 providerSignature,
uint userRandom,
uint modulo,
uint betMask
}

```javascript
const sessionID = web3.utils.soliditySha3("ok");
let res = await SessionContract.initSession(sessionID,providerAddress,providerAddress,[userAddress,puppetAddress],OffchainPayment.address,"0x0");
res = await SessionContract.joinSession(sessionID,puppetAddress2,{from:userAddress});

//user content
const providerRandom = accounts[5];
const providerRandomHash = web3.utils.soliditySha3(providerRandom);
const CPHash = web3.utils.soliditySha3(sessionID,providerRandomHash);
const providerSignature = tEcsign(Buffer.from(CPHash.substr(2), "hex"), providerPrivateKey);
const userRandom = accounts[6];
const modulo = 100;
const betMask = 20;

//user send message
let buffer = rlpEncodeUserRandom(providerRandomHash,providerSignature,userRandom,modulo,betMask);
let hash = web3.utils.soliditySha3(userAddress,providerAddress,sessionID,{t:"uint8",v:1}, {t:"bytes",v:buffer});
const puppetSig = tEcsign(Buffer.from(hash.substr(2),"hex"),userPrivateKey);

//user transfer message
let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
let balance = 10000;
let nonce = 1000;
let amount = 1000000;
let additionalHash = web3.utils.soliditySha3(hash, amount);
await OffchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, amount, { from: regulatorAddress}); 
typedData.message.channelID = channelID;
typedData.message.additionalHash = additionalHash;
typedData.message.balance = balance;
typedData.message.nonce = nonce;
let signature = tEcsign(signHash(), userPrivateKey);
const paymentData = [channelID, balance,nonce,amount,additionalHash,signature];
const rlpcode = "0x" + rlp.encode(paymentData).toString("hex")
//sendMessage
res = await SessionContract.sendMessage(userAddress,providerAddress,sessionID,1,buffer,puppetSig,rlpcode,{from:userAddress});
console.log(res)
```
2. cp开奖，将开奖结果和CP的R发送给玩家，还需发送transfer相关信息(channelID,balance,nonce,amount,additionHash)，并对其签名
> content: privideRandom
```javascript
buffer = rlpEncodeProviderSettle(providerRandom);
hash =  web3.utils.soliditySha3({t:'address',v:providerAddress},{t:'address',v:userAddress},{t:'bytes32',v:sessionID},{t:"uint8",v:2}, {t:"bytes",v:buffer});
let cpSig = tEcsign(Buffer.from(hash.substr(2),"hex"),providerPrivateKey);
additionalHash = web3.utils.soliditySha3(hash, amount);
typedData.message.channelID = channelID;
typedData.message.additionalHash = additionalHash;
typedData.message.balance = balance;
typedData.message.nonce = nonce;
signature = web3.utils.bytesToHex(tEcsign(signHash(), providerPrivateKey));
paymentData = [channelID, balance,nonce,amount,additionalHash,signature];
rlpcode = "0x" + rlp.encode(paymentData).toString("hex")
res = await SessionContract.sendMessage(providerAddress,userAddress,sessionID,2,buffer,cpSig,rlpcode,{from:providerAddress});
```

3. cp检测用户上传的hash异常，结束游戏，还需发送transfer相关信息(channelID,balance,nonce,amount,additionHash)，并对其签名，执行退款
> content: provideRandom
```javascript
buffer = rlpEncodeProviderSettle(providerRandom);
hash =  web3.utils.soliditySha3({t:'address',v:providerAddress},{t:'address',v:userAddress},{t:'bytes32',v:sessionID},{t:"uint8",v:3}, {t:"bytes",v:buffer});
let cpSig = tEcsign(Buffer.from(hash.substr(2),"hex"),providerPrivateKey);
additionalHash = web3.utils.soliditySha3(hash, amount);
typedData.message.channelID = channelID;
typedData.message.additionalHash = additionalHash;
typedData.message.balance = balance;
typedData.message.nonce = nonce;
signature = web3.utils.bytesToHex(tEcsign(signHash(), providerPrivateKey));
paymentData = [channelID, balance,nonce,amount,additionalHash,signature];
rlpcode = "0x" + rlp.encode(paymentData).toString("hex")
res = await SessionContract.sendMessage(providerAddress,userAddress,sessionID,3,buffer,cpSig,rlpcode,{from:providerAddress});
```