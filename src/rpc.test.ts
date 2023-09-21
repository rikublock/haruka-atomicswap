import { RpcClient } from "./rpc";

describe("btc rpc client", () => {
  const client = new RpcClient("haruka", "password", "localhost", 18443);

  beforeAll(async () => {
    try {
      await client.createWallet("default");
    } catch (err) {
      // pass
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
    console.log(result);
  });

  // test("rpc getTransaction", async () => {
  //   const result = await client.getTransaction(hash);
  //   console.log(result);
  // });

  // test("rpc sendRawTransaction", async () => {
  //   const result = await client.sendRawTransaction(hash);
  //   console.log(result);
  // });
});
