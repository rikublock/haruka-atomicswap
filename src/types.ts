export type KeyInfo = {
  address: string;
  pubkey: Buffer;
  privkey: Buffer;
};

export type UTXO = {
  txid: string;
  n: number;
  amount: number;
};
