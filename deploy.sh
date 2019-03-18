#!/bin/bash

onchainPayment=$(node ./eth_deploy.js)
echo onchainPayment: $onchainPayment

operator=$(node ./operator_deploy.js)
echo operator address: $operator

offchainPayment=$(node ./cita_deploy.js $onchainPayment $operator)
echo offchainPayment: $offchainPayment