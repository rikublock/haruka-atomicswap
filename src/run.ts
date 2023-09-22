import * as crypto from "node:crypto";
import assert from "node:assert/strict";

import * as bitcoin from "bitcoinjs-lib";
import * as bip68 from "bip68";
import { BaseTransaction, Client, Wallet, xrpToDrops } from "xrpl";

import { BITCOIN_MIN_BLOCKS, RIPPLE_EPOCH_OFFSET } from "./util";
import { RpcClient } from "./rpc";
import config from "./config";
import { SwapBTC, SwapXRP } from "./swap";
import { UTXO } from "./types";

async function main() {
  const timelock = 120; // 2 mins

  // setup swap instances
  const swapBTC = new SwapBTC(bitcoin.networks.regtest);
  const swapXRP = new SwapXRP();

  // Exchange amounts
  const amountXRP = "45.29";
  const amountBTC = "0.14";

  // setup Bitcoin blockchain client
  console.log("Setting up blockchains...");
  const clientBTC = new RpcClient(
    config.btc.username,
    config.btc.password,
    config.btc.host,
    config.btc.port
  );

  try {
    await clientBTC.createWallet();
  } catch {
    // pass
  }

  const count = await clientBTC.getBlockCount();
  const addressMiner = await clientBTC.getNewAddress();
  if (count < BITCOIN_MIN_BLOCKS) {
    await clientBTC.generateToAddress(BITCOIN_MIN_BLOCKS - count, addressMiner);
  }

  // setup XRPL blockchain client
  const clientXRP = new Client(config.xrp.url);
  await clientXRP.connect();

  // setup wallets
  console.log("Setting up wallets...");

  // TEMP
  // const walletAlice = Wallet.generate(ECDSA.secp256k1);
  // await clientXRP.fundWallet(walletAlice);

  const walletAliceXRP = Wallet.fromSeed("shx2iaY1XtMmDqxP8uQopQX5WGB5y"); // rGgC3koNaoRiA4mDhqDQy1scmviLpyAjNh
  console.log("Alice:: XRP wallet address:", walletAliceXRP.classicAddress);
  console.log("Alice:: XRP wallet publicKey:", walletAliceXRP.publicKey);
  console.log("Alice:: XRP wallet privateKey:", walletAliceXRP.privateKey);

  const walletBobXRP = Wallet.fromSeed("ssVXHaqGtmQzwCFBSbAV6WvyyHxQt"); // rfcQ59MEWm2LTzRSurzJGDhH7yyKzkq4k6
  console.log("Bob:: XRP wallet address:", walletBobXRP.classicAddress);
  console.log("Bob:: XRP wallet publicKey:", walletBobXRP.publicKey);
  console.log("Bob:: XRP wallet privateKey:", walletBobXRP.privateKey);

  const walletAliceBTC = swapBTC.createKeyPair();
  console.log("Alice:: BTC wallet address:", walletAliceBTC.address);
  console.log(
    "Alice:: BTC wallet publicKey:",
    walletAliceBTC.pubkey.toString("hex")
  );
  console.log(
    "Alice:: BTC wallet privateKey:",
    walletAliceBTC.privkey.toString("hex")
  );

  const walletBobBTC = swapBTC.createKeyPair();
  console.log("Alice:: BTC wallet address:", walletBobBTC.address);
  console.log(
    "Alice:: BTC wallet publicKey:",
    walletBobBTC.pubkey.toString("hex")
  );
  console.log(
    "Alice:: BTC wallet privateKey:",
    walletBobBTC.privkey.toString("hex")
  );

  // **Alice T_0**
  // create secret
  const secret = swapXRP.createSecret();
  console.log("Alice:: secret:", secret.raw.toString("hex"));
  console.log("Alice:: secret hash:", secret.hash);
  console.log("Alice:: secret condition:", secret.condition);
  console.log("Alice:: secret fulfillment:", secret.fulfillment);

  // create HTLC on XRPL (lock funds)
  console.log("Alice:: creating HTLC on XRPL...");
  const CancelAfter =
    Math.floor(Date.now() / 1000) + timelock - RIPPLE_EPOCH_OFFSET;
  const txCreate = await clientXRP.submitAndWait(
    {
      TransactionType: "EscrowCreate",
      Account: walletAliceXRP.classicAddress,
      Amount: xrpToDrops(amountXRP),
      Destination: walletBobXRP.classicAddress,
      Condition: secret.condition,
      CancelAfter: CancelAfter,
    },
    {
      failHard: true,
      wallet: walletAliceXRP,
    }
  );
  console.debug("txCreate", txCreate);

  // store offer sequence for later use
  const offerSequence = (txCreate.result as BaseTransaction).Sequence;
  assert(offerSequence);

  // Note: Alice would send the tx hash to Bob, who would then
  // verify that the HTLC exists and is correctly configured.

  // **Bob T_1**
  // Note: Bob only knows the secret hash or condition
  // create HTLC on BTC (lock funds)
  console.log("Bob:: creating HTLC on BTC...");
  const sequence = bip68.encode({ blocks: 5 });
  const redeemScript = swapBTC.getRedeemScript(
    secret.hash,
    walletBobBTC.pubkey,
    walletAliceBTC.pubkey,
    sequence
  );
  const address = swapBTC.getRedeemAddress(redeemScript);

  // fund HTLC address
  const txid = await clientBTC.sendToAddress(address, amountBTC);
  await clientBTC.generateToAddress(1, addressMiner);

  // store utxo info for later use
  const txInfo = await clientBTC.getRawTransaction(txid);
  const vout = txInfo.vout.find((x: any) => x.scriptPubKey.address == address);
  assert(vout);

  const utxo: UTXO = {
    txid,
    n: vout.n,
    amount: vout.value,
  };

  // Note: Bob would send the tx hash to Alice, who would then
  // verify that the HTLC exists and is correctly configured.

  // **Alice T_3**
  // swap on BTC, thereby revealing the secret
  console.log("Alice:: claiming HTLC on BTC (reveal secret)...");
  const swapTx = swapBTC.buildSwapTx(
    walletAliceBTC.address,
    redeemScript,
    walletAliceBTC,
    utxo,
    secret.raw
  );

  // submit transaction
  const swapTxid = await clientBTC.sendRawTransaction(swapTx);
  await clientBTC.generateToAddress(1, addressMiner);

  // Note: Bob would monitor the blockchain and wait for Alice to
  // spend the HTLC output. Once detected, he extracts the secret.

  // **Bob T_2**
  // extract secret
  console.log("Bob:: extracting secret...");
  const swapTxInfo = await clientBTC.getRawTransaction(swapTxid);

  const revealedSecret = swapBTC.extractSecret(swapTxInfo);
  assert(Buffer.compare(revealedSecret, secret.raw) === 0);

  // Note: Bob can now compute the crypto condition.

  // swap on XRP, finish the escrow
  console.log("Bob:: claiming HTLC on XRP...");
  const txFinish = await clientXRP.submitAndWait(
    {
      TransactionType: "EscrowFinish",
      Account: walletBobXRP.classicAddress,
      Owner: walletAliceXRP.classicAddress,
      OfferSequence: offerSequence,
      Condition: secret.condition,
      Fulfillment: secret.fulfillment,
    },
    {
      failHard: true,
      wallet: walletBobXRP,
    }
  );
  console.debug("txFinish", txFinish);

  // close clients
  await clientXRP.disconnect();
}

main();
