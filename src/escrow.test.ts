import assert from "node:assert/strict";
import { Client, BaseTransaction, Wallet } from "xrpl";

import { createCryptoCondition, RIPPLE_EPOCH_OFFSET, sleep } from "./util";

// See: https://xrpl.org/send-a-conditionally-held-escrow.html

/**
 * Goal: Create a Hashed Timelock Contract (HTLC) that unlocks Alice's principal amount P_a,
 * if one of the following conditions is met:
 * - provide Alice's signature S_a and duration D has passed (CancelAfter)
 * - provide Bob's signature S_b and secret H_s (Condition)
 */
describe("xrpl escrow", () => {
  const walletAlice = Wallet.fromSeed("sEdTSsgJa8icKR5NjngRrbyCRpRr5Yw"); // raMEqVCoiA8KsRH86c483PsUUvaQCXsAJn
  const walletBob = Wallet.fromSeed("sEdTa41EDLuM3cGuW9bHNXNkoptrdE1"); // rsm7M45DJz6XGsfozEhU21eYGM3AHQRcHq

  const locktime = 20; // seconds

  const secret = Buffer.from(
    "3E6A02FCF6C42AB846FD0FB8C13E68C72806432FD7FB775F1036B3067D19CDFF",
    "hex"
  );
  const [hash, condition, fulfillment] = createCryptoCondition(secret);

  let client: Client;

  beforeAll(async () => {
    client = new Client("wss://s.altnet.rippletest.net:51233/");
    await client.connect();
  });

  afterAll(async () => {
    await client.disconnect();
  });

  test("escrow unlock with condition", async () => {
    const CancelAfter =
      Math.floor(Date.now() / 1000) + locktime - RIPPLE_EPOCH_OFFSET;

    // Alice lock
    const txCreate = await client.submitAndWait(
      {
        TransactionType: "EscrowCreate",
        Account: walletAlice.classicAddress,
        Amount: "10000",
        Destination: walletBob.classicAddress,
        Condition: condition,
        CancelAfter: CancelAfter,
      },
      {
        failHard: true,
        wallet: walletAlice,
      }
    );
    console.debug("txCreate", txCreate);

    const OfferSequence = (txCreate.result as BaseTransaction).Sequence;
    expect(OfferSequence).toBeGreaterThan(0);
    assert(OfferSequence);

    // Bob claim
    const txFinish = await client.submitAndWait(
      {
        TransactionType: "EscrowFinish",
        Account: walletBob.classicAddress,
        Owner: walletAlice.classicAddress,
        OfferSequence: OfferSequence,
        Condition: condition,
        Fulfillment: fulfillment,
      },
      {
        failHard: true,
        wallet: walletBob,
      }
    );
    console.debug("txFinish", txFinish);
  }, 120000);

  test("escrow cancel after timeout", async () => {
    const CancelAfter =
      Math.floor(Date.now() / 1000) + locktime - RIPPLE_EPOCH_OFFSET;

    // Alice lock
    const txCreate = await client.submitAndWait(
      {
        TransactionType: "EscrowCreate",
        Account: walletAlice.classicAddress,
        Amount: "10000",
        Destination: walletBob.classicAddress,
        Condition: condition,
        CancelAfter: CancelAfter,
      },
      {
        failHard: true,
        wallet: walletAlice,
      }
    );
    console.debug("txCreate", txCreate);

    const OfferSequence = (txCreate.result as BaseTransaction).Sequence;
    expect(OfferSequence).toBeGreaterThan(0);
    assert(OfferSequence);

    // premature cancel
    const response = await client.submit(
      {
        TransactionType: "EscrowCancel",
        Account: walletAlice.classicAddress,
        Owner: walletAlice.classicAddress,
        OfferSequence: OfferSequence,
      },
      {
        failHard: true,
        wallet: walletAlice,
      }
    );
    expect(response.result.accepted).toBe(false);
    expect(response.result.engine_result).toBe("tecNO_PERMISSION");

    // wait for escrow to expire
    await sleep(locktime * 1000);

    // Note: any account can cancel
    const txCancel = await client.submitAndWait(
      {
        TransactionType: "EscrowCancel",
        Account: walletBob.classicAddress,
        Owner: walletAlice.classicAddress,
        OfferSequence: OfferSequence,
      },
      {
        failHard: true,
        wallet: walletBob,
      }
    );
    console.debug("txCancel", txCancel);
  }, 120000);
});
