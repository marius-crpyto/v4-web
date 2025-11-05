// Bridge contract configuration and helpers
// TODO: fill in real bridge addresses per-chain and replace ABI if needed
export const BRIDGE_CONTRACT_ADDRESSES: Record<number, string | undefined> = {
  // Example:
  11155111: '0xa4A7Acf2f06b1CC296E15E8979B546D34446D5c4',
};

export const BRIDGE_ABI = [
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
      {
        internalType: 'bytes',
        name: 'accAddress',
        type: 'bytes',
      },
      {
        internalType: 'bytes',
        name: 'memo',
        type: 'bytes',
      },
    ],
    name: 'bridge',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

export function getBridgeAddressForChain(chainId: number): string | undefined {
  return BRIDGE_CONTRACT_ADDRESSES[chainId];
}

export function isBridgeAvailable(chainId: number | string): boolean {
  const id = typeof chainId === 'string' ? Number(chainId) : chainId;
  return Boolean(BRIDGE_CONTRACT_ADDRESSES[id]);
}
