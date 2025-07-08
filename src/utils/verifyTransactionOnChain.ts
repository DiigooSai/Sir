import { AssetModel, ASSETS } from '@/db/models/nige-nest/asset';
import { Connection, clusterApiUrl } from '@solana/web3.js';

import { ethers } from 'ethers';
import { ApiResponse } from './ApiResponse';
import { AssetLedgerModel } from '@/db/models/nige-nest/asset-ledger';

const CHAIN_RPC_URLS: Record<string, string> = {
  bsc: 'https://bsc-dataseed.bnbchain.org',
  solana: clusterApiUrl('mainnet-beta'),
};

export async function verifyTransactionOnChain({
  transactionHash,
  chain,
  numEggs,
}: {
  transactionHash: string;
  chain: 'bsc' | 'solana';
  numEggs: number;
}) {
  try {
    if (chain === 'bsc') {
      const provider = new ethers.JsonRpcProvider(CHAIN_RPC_URLS.bsc);
      const receipt = await provider.getTransactionReceipt(transactionHash);
      const tx = await provider.getTransaction(transactionHash);

      if (!receipt || receipt.status !== 1) {
        throw new Error('Transaction not found or failed');
      }

      const usdtInterface = new ethers.Interface([
        {
          anonymous: false,
          inputs: [
            { indexed: true, name: 'from', type: 'address' },
            { indexed: true, name: 'to', type: 'address' },
            { indexed: false, name: 'value', type: 'uint256' },
          ],
          name: 'Transfer',
          type: 'event',
        },
      ]);

      const USDT_CONTRACT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';

      const usdtTransferLog = receipt.logs
        .map((log) => {
          try {
            return {
              ...usdtInterface.parseLog(log),
              address: log.address,
            };
          } catch {
            return null;
          }
        })
        .find((event) => event && event.name === 'Transfer' && event.address.toLowerCase() === USDT_CONTRACT_ADDRESS.toLowerCase());

      if (!usdtTransferLog) {
        throw new Error('No USDT transfer found in this transaction');
      }

      const { args } = usdtTransferLog;
      const amount = Number(ethers.formatUnits(args.value, 18));

      if (args.to !== '0xA761A68499753C68747398EB2B91eF308970c3e4') {
        throw new Error('Fake Transaction');
      }

      const asset = await AssetModel.findById(ASSETS.EGG).select('rateInUSDT').lean();
      if (!asset) {
        throw new Error('Asset not found');
      }
      console.log(amount);
      console.log(args.to);
      const usdt = asset.rateInUSDT;
      if (numEggs * usdt < amount) {
        throw new Error('Amount is not same!');
      }
      return {
        transactionHash,
        blockNumber: receipt.blockNumber,
        status: receipt.status,
        from: args.from,
        to: args.to,
        amount,
        symbol: 'USDT',
      };
    }

    if (chain === 'solana') {
      const connection = new Connection(CHAIN_RPC_URLS.solana, 'confirmed');
      const tx = await connection.getTransaction(transactionHash, {
        commitment: 'confirmed',
      });

      if (!tx || tx.meta?.err) {
        throw new Error('Transaction not found or failed on Solana');
      }

      return {
        transactionHash,
        blockNumber: tx.slot,
        status: 1,
      };
    }
  } catch (err) {
    console.log(err);
    return;
  }

  throw new Error(`Unsupported chain: ${chain}`);
}
