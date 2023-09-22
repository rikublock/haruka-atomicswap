import * as crypto from "node:crypto";

// @ts-ignore
import * as cc from "five-bells-condition";

export const RIPPLE_EPOCH_OFFSET = 946684800;

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Create a crypto condition according to specs from a secret
 * See: https://datatracker.ietf.org/doc/html/draft-thomas-crypto-conditions-03
 * @param secret - hashlock secret
 * @returns tuple of condition and fulfillment as hex string
 */
export function createCryptoCondition(secret: Buffer): [string, string, string] {
  console.debug("CC:Secret:", secret.toString("hex").toUpperCase());

  const hash = crypto.createHash("sha256").update(secret).digest("hex");
  console.debug("CC:Hash:", hash.toUpperCase());

  const preimage = new cc.PreimageSha256();
  preimage.setPreimage(secret);

  const condition = preimage
    .getConditionBinary()
    .toString("hex")
    .toUpperCase() as string;
  console.debug("CC:Condition:", condition);

  const fulfillment = preimage
    .serializeBinary()
    .toString("hex")
    .toUpperCase() as string;
  console.debug("CC:Fulfillment:", fulfillment);

  return [hash, condition, fulfillment];
}
