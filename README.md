# Haruka Atomic Swap

Proof of Concept: Hashed Timelock Contract (HTLC) based atomic swap between the XRPL and Bitcoin blockchain.

## Setup

```shell
yarn install
```

## Run

Launch the Bitcoin regtest node

```shell
cd docker/
./run.sh
```

Perform an atomic Swap

```shell
yarn run start
```

## Atomic Swap Details

### Protocol Basic

1. Alice creates secret x, and hashes it to create H(x) = SHA256(x).
   Alice also creates an secp256k1 key pair (pubA, privA).
   Bob creates an secp256k1 key pair (pubB, privB).

2. Alice shares H(x) and pubkey pubA with Bob.
   Bob shares pubkey pubB with Alice.

3. Alice creates transaction T_0 (HTLC = Escrow) on XRPL and broadcasts it onto the network.
   **Unlock conditions:**

   - T_0 can be redeemed after time t2 with Alice's private key privA (EscrowCancel)
   - At any time, T_0 can redeemed with the signature from Bob's private key privB and reveal of secret x (crypto condition, fulfillment)

4. Bob confirms T_0.
   Bob creates transaction T_1 (HTLC) on BTC and broadcasts it onto the network.
   **Unlock conditions:**

   - T_1 can be redeemed after time t1 with Bob's private key privB
   - At any time, T_1 can be redeemed with the signature fom Alice's private key privA and reveal of secret x

5. Upon confirming Bob’s transaction T_1, Alice creates transaction T_3 to claim the BTC by providing secret x and her signature.

6. With the revealed secret x, Bob can create T_2 to claim the XRP with his private key privB.

7. In case Step 3 or 4 does not happen, both can take back their coins after the time lock expires.

### Hashed Timelock Contract (HTLC)

#### XRPL

We can simply use the Escrow primitive with a cancel after time and crypto condition.

- https://xrpl.org/escrow.html
- https://xrpl.org/escrowcreate.html

#### Bitcoin

Based on Tier Nolan's classic swap. Using pay to script hash.

Script:

```
OP_IF
      OP_SHA256
      <secretHash>
      OP_EQUALVERIFY
      OP_DUP
      OP_HASH160
      <swapPubkeyHash>
      OP_EQUALVERIFY
      OP_CHECKSIG
OP_ELSE
      <locktime>
      OP_CHECKSEQUENCEVERIFY
      OP_DROP
      OP_DUP
      OP_HASH160
      <refundPubkeyHash>
      OP_EQUALVERIFY
      OP_CHECKSIG
OP_ENDIF
```

## Useful links

- https://xrpl.org/use-an-escrow-as-a-smart-contract.html
- https://bitcointalk.org/index.php?topic=193281.msg2003765#msg2003765$
- https://github.com/kallewoof/btcdeb
- https://en.bitcoin.it/wiki/Script
- https://bitcoin.stackexchange.com/questions/101777/how-are-p2sh-address-spent
- https://github.com/BlockchainCommons/Learning-Bitcoin-from-the-Command-Line/blob/master/11_3_Using_CSV_in_Scripts.md
- https://github.com/BlockchainCommons/Learning-Bitcoin-from-the-Command-Line/blob/master/12_1_Using_Script_Conditionals.md#understand-ifthen-ordering

## Future Work ?

- support segwit and taproot, https://dev.to/eunovo/a-guide-to-creating-taproot-scripts-with-bitcoinjs-lib-4oph
- Extend to grief-free version (requires hooks), details: https://eprint.iacr.org/2022/700.pdf
