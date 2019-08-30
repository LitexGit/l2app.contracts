const fs = require('fs')
const onchain_deploy = require('./onchain_deploy.js')
const operator_deploy = require('./operator_deploy')
const cita_deploy = require('./cita_deploy')
const session_deploy = require('./session_deploy')
const config = require('./conf.json');


let result = {};
let onchainPayment;
let operator;
session_deploy.deploy()
    .then(res => {
        console.log("session_contractAddress:" + res)
        if(res == null){
            res = '';
        }
        res = {
            "appSessionAddress": res
        };
        result = Object.assign(result, res);
        return onchain_deploy.deploy(); //deploy eth
    })
    .then(res => {
        // res = '0x6dDCb2d0e3a2D8A41a1517802f4BbcDd0dC48754';
        console.log("eth_contractAddress:" + res);
        if(res == null){
            res = '';
        }
        onchainPayment = res;
        res = {
            "ethPNAddress": res
        };
        result = Object.assign(result, res);
        // result.push(res);
        // console.log("result:"+result)
        return operator_deploy.deploy() //deploy operator
    })
    .then(res => {
        console.log("operator_contractAddress:" + res)
        if(res == null){
            res = '';
        }
        operator = res;
        res = {
            "appOperatorAddress": res
        };
        result = Object.assign(result, res);
        // console.log("result:" + result)
        if(onchainPayment != '' && operator != ''){
            return cita_deploy.deploy(onchainPayment,operator) //deploy cita
        }else{
            throw "cita_deploy can't get onchainPayment or operator";
        }
    })
    .then(res => {
        console.log("cita_contractAddress:" + res)
        res = {
            "appPNAddress": res,
            ethRpcUrl: config.mainchain.provider,
            appRpcUrl: config.cita.provider,
        };
        result = Object.assign(result, res);
        // console.log("result:"+result)

        //all contractAddress 
        result = {
            "contractAddress": result,
        }

        //read config json
        config.cita_constructArgs.onchainPayment = onchainPayment;
        config.cita_constructArgs.operator = operator;

        //merge conf and contractAddress

        result = Object.assign(result, config);
        //write in ouput.json
        result_write = JSON.stringify(result, null, 4);
        fs.writeFile('./output.json', result_write, (err) => {
            if (err) {
                console.error(err);
            } else {
                console.log('add output succeed')
            }
        })
    })