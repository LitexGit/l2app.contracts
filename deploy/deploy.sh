#!/bin/bash

net=rinkeby

if [ ! -n "$1" ] ;then
    net=rinkeby
else
    net=$1
fi

echo "$net"
cp conf.json.$net conf.json

truffle compile
node deploy.js