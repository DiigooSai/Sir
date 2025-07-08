import { parsedEnv } from '../env';
import { seedDatabase } from './bootstrap/seed';
import { createApp } from './app';
import connectDB from './db/connect';
import { registerWebSocketRoutes } from './ws/web-socketRoutes';
import { bootstrapRedis } from './db/redis/bootstrap';
import { initTransactionProcessing } from './bull/jobs/processTransactions';

parsedEnv();

await connectDB();
await bootstrapRedis();
await seedDatabase();
// await initCrons();

// Initialize background transaction processing
await initTransactionProcessing();

const app = createApp();
const websocket = registerWebSocketRoutes(app);

export default {
  port: +(process.env.PORT || 4500),
  fetch: app.fetch,
  websocket,
};

export type { AppType } from './routes';
