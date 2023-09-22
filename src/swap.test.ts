import assert from "assert/strict";

import * as bitcoin from "bitcoinjs-lib";
import * as bip68 from "bip68";

import { SwapBTC } from "./swap";
import { RpcClient } from "./rpc";
import { UTXO } from "./types";
import { BITCOIN_MIN_BLOCKS } from "./util";

describe("swap classes", () => {
  const fee = 0.00001;
  const client = new RpcClient("haruka", "password", "localhost", 18443);
  const swap = new SwapBTC(bitcoin.networks.regtest, fee);

  const alice = swap.createKeyPair(
    "cScfkGjbzzoeewVWmU2hYPUHeVGJRDdFt7WhmrVVGkxpmPP8BHWe"
  );
  const bob = swap.createKeyPair(
    "cMkopUXKWsEzAjfa1zApksGRwjVpJRB3831qM9W4gKZsLwjHXA9x"
  );
  const miner = swap.createKeyPair(
    "cMkopUXKWsEzAjfa1zApksGRwjVpJRB3831qM9W4gKZsMSb4Ubnf"
  );

  beforeAll(async () => {
    try {
      await client.createWallet("default");
    } catch (err) {
      // pass
    }

    // ensure we have available coins to spend
    const count = await client.getBlockCount();
    if (count < BITCOIN_MIN_BLOCKS) {
      const address = await client.getNewAddress();
      await client.generateToAddress(BITCOIN_MIN_BLOCKS - count, address);
    }
  });

  test("swap addresses", async () => {
    expect(alice.address).toBe("mrG31vZtaj3WW8xzGz3ZjiCW6gaAtD6rMN");
    expect(alice.privkey).toStrictEqual(
      Buffer.from(
        "9632f11629d05bbb9a3aef95d330b3fab6630d8133bed3efe0cc8b19191c53a9",
        "hex"
      )
    );

    expect(bob.address).toBe("n4he3WuSAKJdY58ReeXtC8cMse6ip6GL1S");
    expect(bob.privkey).toStrictEqual(
      Buffer.from(
        "0532f8eee64d878e051cb2a330428f193c6650da12a03f302c8eac826388a9a1",
        "hex"
      )
    );
  });

  test("htlc extract secret", async () => {
    const secret =
      "0088cdc3069c55309682b8019b4c346ba31d49d246955d088c0713eb0f4435fb"; // hash 2E5E98B15782C7AD8F6EE0AA3F214CBD916FC66F323AAA56688CE661D2EE4996
    const scriptSigHex =
      "47304402201ad1c0b8c33016f26a7f2244be4f78c42bb1c7a458e6aab01c774ac080bdb55a02200ad2c7444b0d75e33288e8ba53d6d136275c526bf1711b77abc74ae5c5443fb30121038f0248cc0bebc425eb55af1689a59f88119c69430a860c6a05f340e445c417d7200088cdc3069c55309682b8019b4c346ba31d49d246955d088c0713eb0f4435fb514c5b63a8202e5e98b15782c7ad8f6ee0aa3f214cbd916fc66f323aaa56688ce661d2ee49968876a914fe503bd5e237c4a6bbd0a30c104b4a9302e0013e88ac6755b27576a91475d715f9a84555e752772c9ad62be90b3b7bb88a88ac68";

    const chunks = bitcoin.script.decompile(Buffer.from(scriptSigHex, "hex"));
    expect(chunks).toBeDefined();
    assert(chunks);
    expect(chunks[2]).toStrictEqual(Buffer.from(secret, "hex"));
  });

  test("htlc unlock with secret", async () => {
    // 5 blocks from now
    const sequence = bip68.encode({ blocks: 5 });

    const secret = swap.createSecret();
    const redeemScript = swap.getRedeemScript(
      secret.hash,
      alice.pubkey,
      bob.pubkey,
      sequence
    );
    const address = swap.getRedeemAddress(redeemScript);

    // fund HTLC
    const value = 0.02;
    const txid = await client.sendToAddress(address, value);

    // mine it
    let mined = await client.generateToAddress(1, miner.address);
    expect(mined?.length).toBe(1);

    // get the UTXO
    const txInfo = await client.getRawTransaction(txid);
    const vout = txInfo.vout.find(
      (x: any) => x.scriptPubKey.address == address
    );
    expect(vout).toBeDefined();
    expect(vout).toHaveProperty("n");
    expect(vout).toHaveProperty("value", value);

    const utxo: UTXO = {
      txid,
      n: vout.n,
      amount: vout.value,
    };

    // receiver address
    const target = swap.createKeyPair();

    const tx = swap.buildSwapTx(
      target.address,
      redeemScript,
      bob,
      utxo,
      secret.raw
    );

    // submit transaction
    const swapTxid = await client.sendRawTransaction(tx);
    expect(swapTxid).toBeDefined();

    // mint it
    mined = await client.generateToAddress(1, miner.address);
    expect(mined?.length).toBe(1);

    // verify
    const swapTxInfo = await client.getRawTransaction(swapTxid);
    expect(swapTxInfo).toBeDefined();
    expect(swapTxInfo.vout.length).toBe(1);
    expect(swapTxInfo.vout[0].value).toBe(value - fee);

    // verify extract secret
    const revealedSecret = swap.extractSecret(swapTxInfo);
    expect(revealedSecret).toStrictEqual(secret.raw);
  });

  test("htlc unlock with refund", async () => {
    // 5 blocks from now
    const sequence = bip68.encode({ blocks: 5 });

    const secret = swap.createSecret();
    const redeemScript = swap.getRedeemScript(
      secret.hash,
      alice.pubkey,
      bob.pubkey,
      sequence
    );
    const address = swap.getRedeemAddress(redeemScript);

    // fund HTLC
    const value = 0.02;
    const txid = await client.sendToAddress(address, value);

    // mine it
    let mined = await client.generateToAddress(1, miner.address);
    expect(mined?.length).toBe(1);

    // get the UTXO
    const txInfo = await client.getRawTransaction(txid);
    const vout = txInfo.vout.find(
      (x: any) => x.scriptPubKey.address == address
    );
    expect(vout).toBeDefined();
    expect(vout).toHaveProperty("n");
    expect(vout).toHaveProperty("value", value);

    const utxo: UTXO = {
      txid,
      n: vout.n,
      amount: vout.value,
    };

    // receiver address
    const target = swap.createKeyPair();

    const tx = swap.buildRefundTx(
      target.address,
      redeemScript,
      alice,
      utxo,
      sequence
    );

    // should not allow early refund
    await expect(async () => {
      await client.sendRawTransaction(tx);
    }).rejects.toThrow("non-BIP68-final");

    // mint until unlocked
    mined = await client.generateToAddress(4, miner.address);
    expect(mined?.length).toBe(4);

    // submit transaction
    const swapTxid = await client.sendRawTransaction(tx);
    expect(swapTxid).toBeDefined();

    // mint it
    mined = await client.generateToAddress(1, miner.address);
    expect(mined?.length).toBe(1);

    // verify
    const swapTxInfo = await client.getRawTransaction(swapTxid);
    expect(swapTxInfo).toBeDefined();
    expect(swapTxInfo.vout.length).toBe(1);
    expect(swapTxInfo.vout[0].value).toBe(value - fee);
  });
});
