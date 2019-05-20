const fs = require('fs')
const eth_deploy = require('./eth_deploy.js')
const operator_deploy = require('./operator_deploy')
const cita_deploy = require('./cita_deploy.js')
const token_deploy = require('./token_deploy')
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
        // result.push(res);
        // console.log("result:"+result)
    //     return token_deploy.deploy() //deploy token
    // })
    // .then(res => {
    //     console.log("token_contractAddress:" + res)
    //     if(res == null){
    //         res = '';
    //     }
    //     res = {
    //         "token_contractAddress": res
    //     };
    //     result = Object.assign(result, res);
        // result.push(res);
        // console.log("result:"+result)
        return eth_deploy.deploy(); //deploy eth
    })
    .then(res => {
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
            ethPpcUrl: config.eth.provider,
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
        fs.writeFile('./ouput.json', result_write, (err) => {
            if (err) {
                console.error(err);
            } else {
                console.log('add output succeed')
            }
        })
    })