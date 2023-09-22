import * as crypto from "node:crypto";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import ECPairFactory, { type ECPairInterface } from "ecpair";
import * as bip68 from "bip68";

import { Client, ECDSA, LedgerEntry, Wallet, xrpToDrops } from "xrpl";

import { createCryptoCondition, RIPPLE_EPOCH_OFFSET } from "./util";
import { RpcClient } from "./rpc";
import config from "./config";
import { KeyInfo } from "./types";

abstract class Swap {
  public abstract createHTLC(): Promise<boolean>;
  public abstract getLockTime(): number;
  public abstract createKeyPair(): Promise<KeyInfo> | KeyInfo;

  public createSecret() {
    const secret = crypto.randomBytes(32);
    const [hash, condition, fulfillment] = createCryptoCondition(secret);

    return {
      secret: secret.toString("hex").toUpperCase(),
      hash,
      condition,
      fulfillment,
    };
  }
}

export class SwapBTC extends Swap {
  private network: bitcoin.Network;

  constructor(network: bitcoin.Network) {
    super();
    this.network = network;
  }

  public createKeyPair(wif?: string): KeyInfo {
    const ECPair = ECPairFactory(ecc);
    let keyPair: ECPairInterface;
    if (wif) {
      keyPair = ECPair.fromWIF(wif, this.network);
    } else {
      keyPair = ECPair.makeRandom({ network: this.network });
    }

    const { address } = bitcoin.payments.p2pkh({
      pubkey: keyPair.publicKey,
      network: this.network,
    });

    if (!address || !keyPair.privateKey) {
      throw Error("Failed to generate key pair");
    }

    return {
      address,
      pubkey: keyPair.publicKey.toString("hex"),
      privkey: keyPair.privateKey.toString("hex"),
    };
  }

  public getLockTime(): number {
    // TODO
    return bip68.encode({ blocks: 2 });
  }

  // TODO possibly make private
  // TODO See https://github.com/bitcoinjs/bitcoinjs-lib/blob/master/test/integration/csv.spec.ts
  public getRedeemScript(
    secretHash: string,
    refundPubkey: string,
    swapPubkey: string,
    locktime: number
  ): Buffer {
    const script = bitcoin.script.fromASM(
      `
      OP_IF
          OP_SHA256
          ${secretHash}
          OP_EQUALVERIFY
          ${swapPubkey}
          OP_CHECKSIG
      OP_ELSE
          ${bitcoin.script.number.encode(locktime).toString("hex")}
          OP_CHECKSEQUENCEVERIFY
          OP_DROP
          ${refundPubkey}
          OP_CHECKSIG
      OP_ENDIF
    `
        .trim()
        .replace(/\s+/g, " ")
    );

    return script;
  }

  public getRedeemAddress(script: Buffer): string {
    const p2sh = bitcoin.payments.p2sh({
      redeem: {
        output: script,
      },
      network: this.network,
    });

    if (!p2sh.address) {
      throw Error("Failed to derive p2sh address");
    }

    return p2sh.address;
  }

  /**
   * Generate input script for refund
   * Spends from HTLC redeem script
   */

  // getRefundInputScript(redeemScript: Buffer) {
  //   const inputRefund = new this.Script();

  //   inputRefund.pushInt(0); // signature placeholder
  //   inputRefund.pushInt(0);
  //   inputRefund.pushData(redeemScript.toRaw());
  //   inputRefund.compile();

  //   return inputRefund;
  // }

  // public test() {
  // create a partially signed bitcoin transaction
  //   const tx = new bitcoin.Psbt({ network: this.network })
  //     .setVersion(2)
  //     .addInput({
  //       hash: unspent.txId,
  //       index: unspent.vout,
  //       sequence,
  //       redeemScript: p2sh.redeem!.output!,
  //       nonWitnessUtxo,
  //     })
  //     .addOutput({
  //       address: regtestUtils.RANDOM_ADDRESS,
  //       value: 7e4,
  //     })
  //     .signInput(0, alice)
  //     .finalizeInput(0, csvGetFinalScripts) // See csvGetFinalScripts below
  //     .extractTransaction();
  // }

  // TODO
  public buildRefundTx() {
    return null;
  }

  public async createHTLC(): Promise<boolean> {
    return false;
  }
}

export class SwapXRP extends Swap {
  constructor() {
    super();
  }

  public getLockTime(): number {
    // TODO
    return 20 * 60; // 20 mins
  }

  public createKeyPair(): KeyInfo {
    const wallet = Wallet.generate(ECDSA.secp256k1);

    return {
      address: wallet.classicAddress,
      pubkey: wallet.publicKey,
      privkey: wallet.privateKey,
    };
  }

  public async createHTLC(): Promise<boolean> {
    return false;
  }
}
