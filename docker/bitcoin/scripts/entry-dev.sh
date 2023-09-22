#!/bin/bash

RPC_USER="haruka"
RPC_PASS="password"

bitcoind -txindex -regtest \
  -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS \
  -rpcbind=0.0.0.0 -rpcallowip=0.0.0.0/0 \
  -fallbackfee=0.00001
