import * as bitcoin from "bitcoinjs-lib";
import * as bip68 from "bip68";

import { SwapBTC } from "./swap";
import { RpcClient } from "./rpc";
import { UTXO } from "./types";

const MIN_BLOCKS = 101;

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
      secret.secret
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
