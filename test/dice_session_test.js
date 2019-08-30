const Session = artifacts.require('Session');
let Off = artifacts.require("OffchainPayment");
let rlp = require("rlp");
const BN = require("bn.js");
const { getPrivateKeys } = require("./utils/keys");
const {tEcsign,myEcsign,personalSign} = require("./utils/helper");
const {rlpEncodeUserRandom, rlpEncodeProviderSettle} = require("./utils/message");
let { typedData, signHash } = require("./utils/typedData");

contract("Session",(accounts) => {
    const providerAddress = accounts[0];
    const regulatorAddress = accounts[1];
    const userAddress = accounts[2];
    const tokenAddress = accounts[3];
    const puppetAddress = accounts[4];
    const puppetAddress2 = accounts[5];
    const puppetAddress3 = accounts[6];
    const puppetAddress4 = accounts[7];
    const puppetAddress5 = accounts[8];
    let regulatorPrivateKey,providerPrivateKey, userPrivateKey;
    let SessionContract,OffchainPayment;

    before( async () => {
        let keys = await getPrivateKeys();
        providerPrivateKey = keys.providerPrivateKey;
        userPrivateKey = keys.userPrivateKey;
        regulatorPrivateKey = keys.regulatorPrivateKey;
    });
    beforeEach(async () => {
        OffchainPayment = await Off.new(providerAddress, providerAddress, regulatorAddress, regulatorAddress, 4, {from: userAddress,gasPrice:"1",gas: '999999999999999' });
        // console.log(OffchainPayment.address)
        typedData.domain.verifyingContract = providerAddress;
        typedData.domain.chainId = 4;
        SessionContract = await Session.new({from:providerAddress});
        await OffchainPayment.onchainAddPuppet(userAddress, userAddress, {from: regulatorAddress});
        await OffchainPayment.onchainAddPuppet(userAddress, puppetAddress, {from: regulatorAddress});
    })

    it("should play game success ", async () => {

        const sessionID = web3.utils.soliditySha3("ok");
        let res = await SessionContract.initSession(sessionID,providerAddress,providerAddress,[userAddress,puppetAddress],OffchainPayment.address,"0x0");
        res = await SessionContract.joinSession(sessionID,puppetAddress2,{from:providerAddress});

        //user content
        const providerRandom = accounts[5];
        const token = "0x0000000000000000000000000000000000000000";
        const providerRandomHash = web3.utils.soliditySha3(providerRandom);
        const CPHash = web3.utils.soliditySha3(token,sessionID,providerRandomHash);
        const providerSignature = tEcsign(Buffer.from(CPHash.substr(2), "hex"), providerPrivateKey);
        const userRandom = accounts[6];
        const modulo = 100;
        const betMask = 20;
        
        //user send message
        let buffer = rlpEncodeUserRandom(token,providerRandomHash,providerSignature,userRandom,modulo,betMask);
        // console.log(sessionID)
        let hash =  web3.utils.soliditySha3(
            {t:'address',v:userAddress},
            {t:'address',v:providerAddress},
            {t:'bytes32',v:sessionID},
            {t:"uint8",v:1}, 
            {t:"bytes",v:buffer});
        
        const puppetSig = tEcsign(Buffer.from(hash.substr(2),"hex"),userPrivateKey);
        // const puppet = await OffchainPayment.isPuppet(userAddress,userAddress,{from:userAddress});
        // console.log("puppet",puppet);

        //user transfer message
        let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
        let balance = 10000;
        let nonce = 1000;
        let amount = 1000000;
        let additionalHash = web3.utils.soliditySha3(hash, amount);
        await OffchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, 10000000000, { from: regulatorAddress});
        typedData.message.channelID = channelID;
        typedData.message.additionalHash = additionalHash;
        typedData.message.balance = balance;
        typedData.message.nonce = nonce;
        let signature = web3.utils.bytesToHex(tEcsign(signHash(), userPrivateKey));
        let paymentData = [channelID, balance,nonce,amount,additionalHash,signature];
        let rlpcode = "0x" + rlp.encode(paymentData).toString("hex")
        // console.log("rlpcode",rlpcode,"rlpcode",rlp.encode(paymentData))
        
        //sendMessage
        res = await SessionContract.sendMessage(userAddress,providerAddress,sessionID,1,buffer,puppetSig,rlpcode,{from:userAddress});
        // console.log(res)
       // verify providerRandomHash
        let messages = await SessionContract.exportSession(sessionID);
        // console.log("messages",messages);
        assert.equal(messages[0].mType,1,"mType should 1");
        let content = messages[0].content;
        content = rlp.decode(Buffer.from(content.substr(2),'hex'));
        // console.log("content",content);
        assert.equal("0x"+content[0].toString("hex"),providerRandomHash,"provider R should equal");


        //send settle messages
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

    })

    it("should cancel game", async ()=> {
        const sessionID = web3.utils.soliditySha3("ok");
        let res = await SessionContract.initSession(sessionID,providerAddress,providerAddress,[userAddress,puppetAddress],OffchainPayment.address,"0x0");
        res = await SessionContract.joinSession(sessionID,puppetAddress2,{from:providerAddress});

        //user content
        const providerRandom = accounts[5];
        const token = "0x0000000000000000000000000000000000000000";
        const providerRandomHash = web3.utils.soliditySha3(providerRandom);
        const CPHash = web3.utils.soliditySha3(token,sessionID,providerRandomHash);
        const providerSignature = tEcsign(Buffer.from(CPHash.substr(2), "hex"), providerPrivateKey);
        const userRandom = accounts[6];
        const userHash = web3.utils.soliditySha3(sessionID,userRandom);
        const modulo = 100;
        const betMask = 20;
        
        //user send message
        let buffer = rlpEncodeUserRandom(token,userHash,providerSignature,userRandom,modulo,betMask);
        // console.log(sessionID)
        let hash =  web3.utils.soliditySha3(
            {t:'address',v:userAddress},
            {t:'address',v:providerAddress},
            {t:'bytes32',v:sessionID},
            {t:"uint8",v:1}, 
            {t:"bytes",v:buffer});
        
        const puppetSig = tEcsign(Buffer.from(hash.substr(2),"hex"),userPrivateKey);
        // const puppet = await OffchainPayment.isPuppet(userAddress,userAddress,{from:userAddress});
        // console.log("puppet",puppet);

        //user transfer message
        let channelID = web3.utils.soliditySha3({t: 'address', v: providerAddress}, {t: 'address', v: userAddress});
        let balance = 10000;
        let nonce = 1000;
        let amount = 1000000;
        let additionalHash = web3.utils.soliditySha3(hash, amount);
        await OffchainPayment.onchainOpenChannel( userAddress, tokenAddress, channelID, 10000000000, { from: regulatorAddress});
        typedData.message.channelID = channelID;
        typedData.message.additionalHash = additionalHash;
        typedData.message.balance = balance;
        typedData.message.nonce = nonce;
        let signature = web3.utils.bytesToHex(tEcsign(signHash(), userPrivateKey));
        let paymentData = [channelID, balance,nonce,amount,additionalHash,signature];
        let rlpcode = "0x" + rlp.encode(paymentData).toString("hex")
        // console.log("rlpcode",rlpcode,"rlpcode",rlp.encode(paymentData))
        
        //sendMessage
        res = await SessionContract.sendMessage(userAddress,providerAddress,sessionID,1,buffer,puppetSig,rlpcode,{from:userAddress});
        // console.log(res)
       // verify providerRandomHash
        let messages = await SessionContract.exportSession(sessionID);
        // console.log("messages",messages);
        assert.equal(messages[0].mType,1,"mType should 1");
        let content = messages[0].content;
        content = rlp.decode(Buffer.from(content.substr(2),'hex'));
        // console.log("content",content);

        //refund
        if("0x"+content[0].toString("hex") != providerRandomHash){

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
        }



    })
})