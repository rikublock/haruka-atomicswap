import axios from "axios";

// var RpcClient = require('');

// var config = {
//   protocol: 'http',
//   user: 'user',
//   pass: 'pass',
//   host: '127.0.0.1',
//   port: '18332',
// };

/**
 * Minimalistic Bitcoin RPC client
 */
export class RpcClient {
  private username: string;
  private password: string;
  private url: string;
  private timeout: number;
  private counter: number;

  constructor(
    username: string,
    password: string,
    host: string,
    port: number | string,
    timeout: number = 30000
  ) {
    this.username = username;
    this.password = password;
    this.url = `http://${host}:${port}`;
    this.timeout = timeout;
    this.counter = 0;
  }

  public async request(method: string, params: Record<string, any>) {
    const body = {
      jsonrpc: "2.0",
      method: method,
      id: this.counter++,
      params: params,
    };

    try {
      const response = await axios.post(this.url, body, {
        auth: {
          username: this.username,
          password: this.password,
        },
        responseType: "json",
        timeout: this.timeout,
      });

      return response.data.result;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.debug(err.response?.data);
        throw Error(err.response?.data.error.message);
      }
      throw err;
    }
  }

  public async getBlockChainInfo(): Promise<Record<string, any>> {
    return await this.request("getblockchaininfo", []);
  }

  public async getBlockCount(): Promise<number> {
    return (await this.request("getblockcount", [])) as number;
  }

  public async getBlockHash(height: number): Promise<string> {
    return (await this.request("getblockhash", [height])) as string;
  }

  public async getBlock(
    hash: string,
    verbosity: number = 1
  ): Promise<Record<string, any>> {
    return await this.request("getblock", [hash, verbosity]);
  }

  public async createWallet(
    name: string = "default"
  ): Promise<Record<string, string>> {
    return await this.request("createwallet", [name]);
  }

  public async getNewAddress(
    label: string = "",
    address_type: string = "legacy"
  ): Promise<string> {
    return (await this.request("getnewaddress", [
      label,
      address_type,
    ])) as string;
  }

  public async listUnspent(
    minconf: number = 1,
    maxconf: number = 9999999,
    addresses: string[] = []
  ): Promise<Record<string, any>> {
    return await this.request("listunspent", [
      minconf,
      maxconf,
      addresses,
      true,
    ]);
  }

  public async generateToAddress(
    nblocks: number,
    address: string,
    maxTries: number = 1000000
  ): Promise<string[]> {
    return (await this.request("generatetoaddress", [
      nblocks,
      address,
      maxTries,
    ])) as string[];
  }

  public async getRawTransaction(
    txid: string,
    verbose: boolean = true
  ): Promise<Record<string, any>> {
    return await this.request("getrawtransaction", [txid, verbose]);
  }

  public async sendRawTransaction(hexstring: string): Promise<string> {
    return (await this.request("sendrawtransaction", [hexstring])) as string;
  }

  public async sendToAddress(
    address: string,
    amount: number | string
  ): Promise<string> {
    return (await this.request("sendtoaddress", [address, amount])) as string;
  }
}
