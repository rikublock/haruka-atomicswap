import { BITCOIN_MIN_BLOCKS } from "./util";
import { RpcClient } from "./rpc";

describe("btc rpc client", () => {
  const client = new RpcClient("haruka", "password", "localhost", 18443);

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

  test("rpc getBlockChainInfo", async () => {
    const result = await client.getBlockChainInfo();
    expect(result.chain).toBe("regtest");
  });

  test("rpc getBlockCount", async () => {
    const result = await client.getBlockCount();
    expect(result).toBeGreaterThanOrEqual(0);
  });

  test("rpc getBlockHash", async () => {
    const result = await client.getBlockHash(0);
    expect(result).toBe(
      "0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206"
    );
  });

  test("rpc getBlock", async () => {
    const hash = await client.getBlockHash(0);
    const result = await client.getBlock(hash);
    expect(result.hash).toBe(
      "0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206"
    );
  });

  test("rpc getNewAddress", async () => {
    const result = await client.getNewAddress();
    console.log(result);
  });

  test("rpc generateToAddress", async () => {
    const address = await client.getNewAddress();
    const result = await client.generateToAddress(1, address);
    expect(result.length).toBe(1);
  });

  // test("rpc getTransaction", async () => {
  //   const address = await client.getNewAddress();
  //   const hashes = await client.generateToAddress(1, address);
  //   const result = await client.getTransaction(hashes[0]);
  //   console.log(result);
  //   expect(result).toBeDefined();
  // });

  // test("rpc sendRawTransaction", async () => {
  //   const result = await client.sendRawTransaction(hash);
  //   console.log(result);
  // });

  test("rpc sendToAddress", async () => {
    const address = await client.getNewAddress();
    const result = await client.sendToAddress(address, 0.22);
    console.log(result);
  });
});
