#!/bin/bash

protoc --sol_out=./ ./transfer.proto 
protoc --js_out=import_style=commonjs,binary:./ ./transfer.proto 