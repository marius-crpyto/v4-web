import { useLayoutEffect, useRef, useState } from 'react';

import { logBonsaiError, logBonsaiInfo } from '@/bonsai/logs';
import { fromBech32, toHex } from '@cosmjs/encoding';
import styled from 'styled-components';
import { Address, parseUnits } from 'viem';
import { sepolia } from 'viem/chains';
import { useWalletClient } from 'wagmi';

import { BRIDGE_ABI, getBridgeAddressForChain } from '@/constants/bridges';
import { DepositDialog2Props, DialogProps, DialogTypes } from '@/constants/dialogs';
import { CosmosChainId } from '@/constants/graz';
import { STRING_KEYS } from '@/constants/localization';
import { SOLANA_MAINNET_ID } from '@/constants/solana';
import { TokenBalance, TokenForTransfer, USDC_ADDRESSES, USDC_DECIMALS } from '@/constants/tokens';
import { ConnectorType, WalletNetworkType } from '@/constants/wallets';

import { useAccounts } from '@/hooks/useAccounts';
import { useBreakpoints } from '@/hooks/useBreakpoints';
import { useStringGetter } from '@/hooks/useStringGetter';

import { Dialog, DialogPlacement } from '@/components/Dialog';
import { LoadingSpace } from '@/components/Loading/LoadingSpinner';

import { useAppDispatch } from '@/state/appTypes';
import { openDialog } from '@/state/dialogs';
import { addDeposit } from '@/state/transfers';
import { SourceAccount } from '@/state/wallet';

import { CHAIN_ID_TO_INFO } from '@/lib/viem';

import { DepositFormState } from './DepositForm/DepositFormContainer';
import { useDepositTokenBalances } from './queries';

function getDefaultToken(
  sourceAccount: SourceAccount,
  highestBalance?: TokenBalance
): TokenForTransfer {
  if (!sourceAccount.chain) throw new Error('No user chain detected');

  if (highestBalance && highestBalance.decimals != null) {
    return {
      chainId: highestBalance.chainId,
      decimals: highestBalance.decimals,
      denom: highestBalance.denom,
    };
  }
  if (sourceAccount.chain === WalletNetworkType.Evm) {
    // return {
    //   chainId: mainnet.id.toString(),
    //   denom: USDC_ADDRESSES[mainnet.id],
    //   decimals: USDC_DECIMALS,
    // };
    return {
      chainId: sepolia.id.toString(),
      denom: USDC_ADDRESSES[sepolia.id],
      decimals: USDC_DECIMALS,
    };
  }

  if (sourceAccount.chain === WalletNetworkType.Solana) {
    return {
      chainId: SOLANA_MAINNET_ID,
      denom: USDC_ADDRESSES[SOLANA_MAINNET_ID],
      decimals: USDC_DECIMALS,
    };
  }

  return {
    chainId: CosmosChainId.Osmosis,
    denom: USDC_ADDRESSES[CosmosChainId.Osmosis],
    decimals: USDC_DECIMALS,
  };
}

export const DepositDialog2 = ({ setIsOpen }: DialogProps<DepositDialog2Props>) => {
  const dispatch = useAppDispatch();
  const { sourceAccount } = useAccounts();
  const { isLoading: isLoadingBalances, withBalances } = useDepositTokenBalances();
  const highestBalance = withBalances.at(0);

  const { isMobile } = useBreakpoints();
  const stringGetter = useStringGetter();

  const [formState, setFormState] = useState<DepositFormState>('form');
  const tokenSelectRef = useRef<HTMLDivElement | null>(null);

  const dialogTitle = (
    {
      form: stringGetter({ key: STRING_KEYS.DEPOSIT }),
      'token-select': stringGetter({ key: STRING_KEYS.SELECT_TOKEN }),
      'qr-deposit': stringGetter({ key: STRING_KEYS.QR_DEPOSIT }),
    } satisfies Record<DepositFormState, string>
  )[formState];

  const onShowForm = () => {
    setFormState('form');
    tokenSelectRef.current?.scroll({ top: 0 });
  };

  const onBack = () => {
    if (formState === 'token-select') {
      onShowForm();
    } else {
      setFormState('token-select');
    }
  };

  useLayoutEffect(() => {
    if (sourceAccount.walletInfo?.connectorType === ConnectorType.Privy) {
      setIsOpen(false);
      dispatch(openDialog(DialogTypes.CoinbaseDepositDialog({})));
    }
  }, [sourceAccount, dispatch, setIsOpen]);

  const { data: walletClient } = useWalletClient();
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const dispatchApp = useAppDispatch();
  const { dydxAddress } = useAccounts();

  async function callBridgeDeposit(
    walletClientParam: any,
    chainId: string,
    rawAmount: string,
    recipientAddress: string
  ) {
    const evmChainId = Number(chainId);
    const bridgeAddress = getBridgeAddressForChain(evmChainId);

    try {
      const recipientAddressHex = `0x${toHex(fromBech32(recipientAddress).data)}`;
      console.log('recipientAddressHex', recipientAddressHex);
      const txHash = await walletClientParam.writeContract({
        account: sourceAccount.address as Address,
        address: bridgeAddress as Address,
        abi: BRIDGE_ABI as any,
        functionName: 'bridge',
        args: [rawAmount, recipientAddressHex, '0x00'],
        chain: (CHAIN_ID_TO_INFO as any)[evmChainId],
      });

      logBonsaiInfo('DepositDialog2', 'bridge tx submitted', { txHash, evmChainId, bridgeAddress });
      return txHash;
    } catch (e) {
      logBonsaiError('DepositDialog2', 'bridge tx error', { error: e, evmChainId, bridgeAddress });
      throw e;
    }
  }

  return (
    <$Dialog
      isOpen
      preventCloseOnOverlayClick
      withAnimation
      hasHeaderBorder
      setIsOpen={setIsOpen}
      onBack={formState === 'form' ? undefined : onBack}
      title={dialogTitle}
      placement={isMobile ? DialogPlacement.FullScreen : DialogPlacement.Default}
    >
      {isLoadingBalances ? (
        <div tw="flex h-full w-full items-center justify-center overflow-hidden">
          <LoadingSpace tw="my-4" />
        </div>
      ) : (
        <div tw="p-4">
          <div tw="mb-2">Token: {getDefaultToken(sourceAccount, highestBalance).denom}</div>
          <div tw="mb-2">
            <label htmlFor="deposit-amount" tw="mb-1 block">
              Amount
              <input
                id="deposit-amount"
                tw="w-full rounded-2 border p-2"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>
          <div tw="mb-2">
            <label htmlFor="recipient-address" tw="mb-1 block">
              Recipient Address
              <input
                id="recipient-address"
                tw="w-full rounded-2 border p-2"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Enter recipient address (leave empty for self)"
              />
            </label>
          </div>
          <div tw="flex gap-2">
            <button
              type="button"
              tw="rounded-2 bg-black px-4 py-2 text-white"
              onClick={async () => {
                try {
                  const token = getDefaultToken(sourceAccount, highestBalance);
                  const raw = parseUnits(amount || '0', token.decimals).toString();
                  const txHash = await callBridgeDeposit(
                    walletClient,
                    token.chainId,
                    raw,
                    recipient
                  );
                  const depositId = `deposit-${crypto.randomUUID()}`;
                  const deposit = {
                    id: depositId,
                    type: 'deposit' as const,
                    txHash,
                    chainId: token.chainId,
                    status: 'pending' as const,
                    token,
                    tokenAmount: raw,
                    estimatedAmountUsd: '',
                    isInstantDeposit: false,
                  };
                  if (dydxAddress) dispatchApp(addDeposit({ dydxAddress, deposit }));
                  setIsOpen(false);
                } catch (e) {
                  // eslint-disable-next-line no-console
                  console.error('bridge deposit failed', e);
                }
              }}
            >
              Deposit via Bridge
            </button>
            <button
              type="button"
              tw="rounded-2 border px-4 py-2"
              onClick={() => {
                setIsOpen(false);
                dispatch(openDialog(DialogTypes.Deposit2({} as any)));
              }}
            >
              Open legacy deposit
            </button>
          </div>
        </div>
      )}
    </$Dialog>
    // <$Dialog
    //   isOpen
    //   preventCloseOnOverlayClick
    //   withAnimation
    //   hasHeaderBorder
    //   setIsOpen={setIsOpen}
    //   onBack={formState === 'form' ? undefined : onBack}
    //   title={dialogTitle}
    //   placement={isMobile ? DialogPlacement.FullScreen : DialogPlacement.Default}
    // >
    //   {isLoadingBalances ? (
    //     <div tw="flex h-full w-full items-center justify-center overflow-hidden">
    //       <LoadingSpace tw="my-4" />
    //     </div>
    //   ) : (
    //     <DepositFormContent
    //       defaultToken={getDefaultToken(sourceAccount, highestBalance)}
    //       formState={formState}
    //       setFormState={setFormState}
    //       setIsOpen={setIsOpen}
    //       tokenSelectRef={tokenSelectRef}
    //       onShowForm={onShowForm}
    //     />
    //   )}
    // </$Dialog>
  );
};

const $Dialog = styled(Dialog)`
  --dialog-content-paddingTop: 0;
  --dialog-content-paddingRight: 0;
  --dialog-content-paddingBottom: 0;
  --dialog-content-paddingLeft: 0;

  --asset-icon-chain-icon-borderColor: var(--dialog-backgroundColor);
`;
