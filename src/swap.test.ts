import assert from "node:assert/strict";

import * as crypto from "node:crypto";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import ECPairFactory from "ecpair";
import * as bip68 from "bip68";
import util from "util";

import { SwapBTC } from "./swap";
import { RpcClient } from "./rpc";

const MIN_BLOCKS = 101;

describe("swap classes", () => {
  const regtest = bitcoin.networks.regtest;
  const client = new RpcClient("haruka", "password", "localhost", 18443);
  const swap = new SwapBTC(regtest);

  const ECPair = ECPairFactory(ecc);

  const alice = swap.createKeyPair(
    "cScfkGjbzzoeewVWmU2hYPUHeVGJRDdFt7WhmrVVGkxpmPP8BHWe"
  );
  const bob = swap.createKeyPair(
    "cMkopUXKWsEzAjfa1zApksGRwjVpJRB3831qM9W4gKZsLwjHXA9x"
  );

  beforeAll(async () => {
    try {
      await client.createWallet("default");
    } catch (err) {
      // pass
    }

    // ensure we have available coins to spend
    const count = await client.getBlockCount();
    if (count < MIN_BLOCKS) {
      const address = await client.getNewAddress();
      await client.generateToAddress(MIN_BLOCKS - count, address);
    }
  });

  test("swap addresses", async () => {
    expect(alice.address).toBe("mrG31vZtaj3WW8xzGz3ZjiCW6gaAtD6rMN");
    expect(alice.privkey).toBe(
      "9632f11629d05bbb9a3aef95d330b3fab6630d8133bed3efe0cc8b19191c53a9"
    );

    expect(bob.address).toBe("n4he3WuSAKJdY58ReeXtC8cMse6ip6GL1S");
    expect(bob.privkey).toBe(
      "0532f8eee64d878e051cb2a330428f193c6650da12a03f302c8eac826388a9a1"
    );
  });

  test("htlc unlock with secret", async () => {
    // 5 blocks from now
    const sequence = bip68.encode({ blocks: 5 });

    const target = swap.createKeyPair();

    const secret = swap.createSecret();
    const redeemScript = swap.getRedeemScript(
      secret.hash,
      alice.pubkey,
      bob.pubkey,
      sequence
    );
    const address = swap.getRedeemAddress(redeemScript);

    const value = 0.17;
    const fee = 0.0001;
    const txid = await client.sendToAddress(address, value);
    console.log(txid);

    const txInfo = await client.getRawTransaction(txid);
    const vout = txInfo.vout.find(
      (x: any) => x.scriptPubKey.address == address
    );
    assert(vout);

    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.addInput(Buffer.from(txid, "hex").reverse(), vout.n, sequence);
    tx.addOutput(
      bitcoin.address.toOutputScript(target.address, regtest),
      Math.floor((value - fee) * 100000000)
    );

    const signatureHash = tx.hashForSignature(
      0, // input index
      redeemScript,
      bitcoin.Transaction.SIGHASH_ALL
    );

    const signer = ECPair.fromPrivateKey(Buffer.from(bob.privkey, "hex"));

    const redeemScriptSig = bitcoin.payments.p2sh({
      network: regtest,
      redeem: {
        network: regtest,
        output: redeemScript,
        input: bitcoin.script.compile([
          bitcoin.script.signature.encode(
            signer.sign(signatureHash),
            bitcoin.Transaction.SIGHASH_ALL
          ),
          Buffer.from(secret.secret, "hex"),
          bitcoin.opcodes.OP_TRUE, // for the OP_IF
        ]),
      },
    }).input;

    tx.setInputScript(0, redeemScriptSig!);
    // TODO set sequence

    // TODO why do we have to do that
    await client.generateToAddress(5, alice.address);

    console.log(bitcoin.script.toASM(redeemScript));
    console.log(redeemScript.toString("hex"));
    console.log(bitcoin.script.toASM(tx.ins[0].script));

    console.log(tx);
    console.log(tx.toHex());

    const result = await client.sendRawTransaction(tx.toHex());
    console.log(result);

    await client.generateToAddress(1, alice.address);

    // TODO verify
    console.log(await client.getRawTransaction(result));

    // await regtestUtils.verify({
    //   txId: tx.getId(),
    //   address: regtestUtils.RANDOM_ADDRESS,
    //   vout: 0,
    //   value: 7e4,
    // });
  });

  test("htlc unlock with refund", async () => {
    // 5 blocks from now
    const sequence = bip68.encode({ blocks: 5 });

    const target = swap.createKeyPair();

    const secret = swap.createSecret();
    const redeemScript = swap.getRedeemScript(
      secret.hash,
      alice.pubkey,
      bob.pubkey,
      sequence
    );
    const address = swap.getRedeemAddress(redeemScript);

    const value = 0.15;
    const fee = 0.0001;
    const txid = await client.sendToAddress(address, value);
    console.log(txid);

    const txInfo = await client.getRawTransaction(txid);
    const vout = txInfo.vout.find(
      (x: any) => x.scriptPubKey.address == address
    );
    assert(vout);

    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.addInput(Buffer.from(txid, "hex").reverse(), vout.n, sequence);
    tx.addOutput(
      bitcoin.address.toOutputScript(target.address, regtest),
      Math.floor((value - fee) * 100000000)
    );

    const signatureHash = tx.hashForSignature(
      0, // input index
      redeemScript,
      bitcoin.Transaction.SIGHASH_ALL
    );

    const signer = ECPair.fromPrivateKey(Buffer.from(alice.privkey, "hex"));

    const redeemScriptSig = bitcoin.payments.p2sh({
      network: regtest,
      redeem: {
        network: regtest,
        output: redeemScript,
        input: bitcoin.script.compile([
          bitcoin.script.signature.encode(
            signer.sign(signatureHash),
            bitcoin.Transaction.SIGHASH_ALL
          ),
          bitcoin.opcodes.OP_0, // for the OP_IF
        ]),
      },
    }).input;

    tx.setInputScript(0, redeemScriptSig!);
    // TODO set sequence

    // TODO why do we have to do that
    await client.generateToAddress(5, alice.address);

    console.log(bitcoin.script.toASM(redeemScript));
    console.log(redeemScript.toString("hex"));
    console.log(bitcoin.script.toASM(tx.ins[0].script));

    console.log(tx);
    console.log(tx.toHex());

    const result = await client.sendRawTransaction(tx.toHex());
    console.log(result);

    await client.generateToAddress(1, alice.address);

    // TODO verify
    console.log(await client.getRawTransaction(result));

    // await regtestUtils.verify({
    //   txId: tx.getId(),
    //   address: regtestUtils.RANDOM_ADDRESS,
    //   vout: 0,
    //   value: 7e4,
    // });
  });
});
