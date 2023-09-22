type LockTime = {
  blocks?: number;
  seconds?: number;
};

declare module "bip68" {
  export function decode(sequence: number): LockTime;
  export function encode({ blocks, seconds }: LockTime): number;
}
