import * as crypto from "node:crypto";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import ECPairFactory, { type ECPairInterface } from "ecpair";
import * as bip68 from "bip68";

import { Client, ECDSA, LedgerEntry, Wallet, xrpToDrops } from "xrpl";

import { createCryptoCondition, RIPPLE_EPOCH_OFFSET } from "./util";
import { RpcClient } from "./rpc";
import config from "./config";
import { KeyInfo, UTXO } from "./types";
import assert from "node:assert";
import { typeforce } from "bitcoinjs-lib/src/types";

export const ECPair = ECPairFactory(ecc);

// TODO add version that builds scripts with TWC

abstract class Swap {
  public abstract getLockTime(): number;
  public abstract createKeyPair(): Promise<KeyInfo> | KeyInfo;

  public createSecret() {
    const raw = crypto.randomBytes(32);
    const [hash, condition, fulfillment] = createCryptoCondition(raw);

    return {
      raw,
      hash,
      condition,
      fulfillment,
    };
  }
}

export class SwapBTC extends Swap {
  private network: bitcoin.Network;
  private fee: number;

  constructor(network: bitcoin.Network, fee: number = 0.00001) {
    super();
    this.network = network;
    this.fee = fee;
  }

  public createKeyPair(wif?: string): KeyInfo {
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
      pubkey: keyPair.publicKey,
      privkey: keyPair.privateKey,
    };
  }

  public getLockTime(): number {
    // TODO
    return bip68.encode({ blocks: 2 });
  }

  private getKeyId(pubkey: Buffer): Buffer {
    return bitcoin.crypto.hash160(pubkey);
  }

  // Examples: https://github.com/bitcoinjs/bitcoinjs-lib/blob/master/test/integration/csv.spec.ts
  public getRedeemScript(
    secretHash: string,
    refundPubkey: Buffer,
    swapPubkey: Buffer,
    locktime: number
  ): Buffer {
    const script = bitcoin.script.fromASM(
      `
      OP_IF
          OP_SHA256
          ${secretHash}
          OP_EQUALVERIFY
          OP_DUP
          OP_HASH160
          ${this.getKeyId(swapPubkey).toString("hex")}
          OP_EQUALVERIFY
          OP_CHECKSIG
      OP_ELSE
          ${bitcoin.script.number.encode(locktime).toString("hex")}
          OP_CHECKSEQUENCEVERIFY
          OP_DROP
          OP_DUP
          OP_HASH160
          ${this.getKeyId(refundPubkey).toString("hex")}
          OP_EQUALVERIFY
          OP_CHECKSIG
      OP_ENDIF
    `
        .trim()
        .replace(/\s+/g, " ")
    );

    return script;
  }

  /**
   * Compute script hash address
   * @param script
   * @returns address
   */
  public getRedeemAddress(script: Buffer): string {
    const p2sh = bitcoin.payments.p2sh({
      redeem: {
        output: script,
      },
      network: this.network,
    });

    if (!p2sh.address) {
      throw Error("Failed to derive p2sh HTLC address");
    }

    return p2sh.address;
  }
  public extractSecret(tx: Record<string, any>): Buffer {
    const chunks = bitcoin.script.decompile(
      Buffer.from(tx.vin[0].scriptSig.hex, "hex")
    );

    if (!chunks || chunks.length < 2) {
      throw Error("Failed to decompile tx scriptSig");
    }

    if (!(chunks[2] instanceof Buffer)) {
      throw Error("Failed to decompile tx scriptSig (unexpected type)");
    }

    return chunks[2];
  }

  /**
   * Build a transaction to unlock the HTLC using the secret (preimage)
   * @param address - receiver address, send everything to this address
   * @param redeemScript - HTLC script
   * @param key - signer key
   * @param utxo - funding transaction output
   * @param secret - HTLC secret (preimage)
   * @returns raw transaction hex
   */
  public buildSwapTx(
    address: string,
    redeemScript: Buffer,
    key: KeyInfo,
    utxo: UTXO,
    secret: Buffer
  ): string {
    const signer = ECPair.fromPrivateKey(key.privkey);

    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.addInput(Buffer.from(utxo.txid, "hex").reverse(), utxo.n);
    tx.addOutput(
      bitcoin.address.toOutputScript(address, this.network),
      Math.floor((utxo.amount - this.fee) * 100000000)
    );

    const signatureHash = tx.hashForSignature(
      0, // input index
      redeemScript,
      bitcoin.Transaction.SIGHASH_ALL
    );

    const redeemScriptSig = bitcoin.payments.p2sh({
      network: this.network,
      redeem: {
        network: this.network,
        output: redeemScript,
        input: bitcoin.script.compile([
          bitcoin.script.signature.encode(
            signer.sign(signatureHash),
            bitcoin.Transaction.SIGHASH_ALL
          ),
          key.pubkey,
          secret,
          bitcoin.opcodes.OP_TRUE, // for OP_IF
        ]),
      },
    }).input;

    tx.setInputScript(0, redeemScriptSig!);

    return tx.toHex();
  }

  /**
   * Build a transaction to refund the expired HTLC
   * @param address - receiver address, send everything to this address
   * @param redeemScript - HTLC script
   * @param key - signer key
   * @param utxo - funding transaction output
   * @param sequence - locktime sequence number (needs to match the number used in the redeem script)
   * @returns raw transaction hex
   */
  public buildRefundTx(
    address: string,
    redeemScript: Buffer,
    key: KeyInfo,
    utxo: UTXO,
    sequence: number
  ): string {
    const signer = ECPair.fromPrivateKey(key.privkey);

    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.addInput(Buffer.from(utxo.txid, "hex").reverse(), utxo.n, sequence);
    tx.addOutput(
      bitcoin.address.toOutputScript(address, this.network),
      Math.floor((utxo.amount - this.fee) * 100000000)
    );

    const signatureHash = tx.hashForSignature(
      0, // input index
      redeemScript,
      bitcoin.Transaction.SIGHASH_ALL
    );

    const redeemScriptSig = bitcoin.payments.p2sh({
      network: this.network,
      redeem: {
        network: this.network,
        output: redeemScript,
        input: bitcoin.script.compile([
          bitcoin.script.signature.encode(
            signer.sign(signatureHash),
            bitcoin.Transaction.SIGHASH_ALL
          ),
          key.pubkey,
          bitcoin.opcodes.OP_0, // for OP_IF
        ]),
      },
    }).input;

    tx.setInputScript(0, redeemScriptSig!);

    return tx.toHex();
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

  public createKeyPair(fund?: boolean): KeyInfo {
    const wallet = Wallet.generate(ECDSA.secp256k1);

    return {
      address: wallet.classicAddress,
      pubkey: Buffer.from(wallet.publicKey, "hex"),
      privkey: Buffer.from(wallet.privateKey, "hex"),
    };
  }
}
