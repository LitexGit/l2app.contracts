// const web3 = "eth-web3";
// result is achieved from sdk
function  getPacketBytes(result) {
    let sessionData = [];
    for(let k=0; k<result.length; k++){
        let m = result[k];
        sessionData.push([m[0], m[1], m[2], web3.utils.toBN(m[3]), m[4], m[5], m[6], web3.utils.toBN(m[7]), web3.utils.toBN(m[8]), web3.utils.toBN(m[9]), m[10], m[11]]);
    }
    return '0x' + rlp.encode(sessionData).toString('hex');
}
