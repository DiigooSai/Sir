import { AssetModel, ASSETS } from '@/db/models/nige-nest/asset';
import { Connection, clusterApiUrl } from '@solana/web3.js';

import { ethers } from 'ethers';
import { ApiResponse } from './ApiResponse';
import { AssetLedgerModel } from '@/db/models/nige-nest/asset-ledger';

// Multiple RPC endpoints for redundancy - no single point of failure
const CHAIN_RPC_URLS: Record<string, string[]> = {
  bsc: [
    'https://bsc-dataseed.bnbchain.org',
    'https://bsc-dataseed1.defibit.io',
    'https://bsc-dataseed1.ninicoin.io',
    'https://bsc-dataseed2.defibit.io',
    'https://bsc-dataseed3.defibit.io',
    'https://rpc.ankr.com/bsc',
    'https://bsc.publicnode.com',
  ],
  solana: [
    clusterApiUrl('mainnet-beta'),
    'https://api.mainnet-beta.solana.com',
    'https://rpc.ankr.com/solana',
    'https://solana-api.projectserum.com',
  ],
};

// Resilient RPC function - tries multiple endpoints until one works
async function getWorkingProvider(chain: 'bsc' | 'solana'): Promise<any> {
  const endpoints = CHAIN_RPC_URLS[chain];
  let lastError: Error | null = null;

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    try {
      console.log(`Trying ${chain} RPC endpoint ${i + 1}/${endpoints.length}: ${endpoint}`);
      
      if (chain === 'bsc') {
        const provider = new ethers.JsonRpcProvider(endpoint);
        // Test the connection
        await provider.getNetwork();
        return provider;
      } else if (chain === 'solana') {
        const connection = new Connection(endpoint, 'confirmed');
        // Test the connection
        await connection.getVersion();
        return connection;
      }
    } catch (error) {
      console.log(`RPC endpoint ${endpoint} failed:`, (error as Error).message);
      lastError = error as Error;
      
      // If not the last endpoint, continue to next
      if (i < endpoints.length - 1) {
        continue;
      }
    }
  }
  
  throw new Error(`All ${chain} RPC endpoints failed. Last error: ${lastError?.message}`);
}

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
      const provider = await getWorkingProvider('bsc');
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
        .map((log: any) => {
          try {
            return {
              ...usdtInterface.parseLog(log),
              address: log.address,
            };
          } catch {
            return null;
          }
        })
        .find((event: any) => event && event.name === 'Transfer' && event.address.toLowerCase() === USDT_CONTRACT_ADDRESS.toLowerCase());

      if (!usdtTransferLog) {
        throw new Error('No USDT transfer found in this transaction');
      }

      const { args } = usdtTransferLog;
      if (!args) {
        throw new Error('Invalid transaction log args');
      }
      
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
      const connection = await getWorkingProvider('solana');
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
