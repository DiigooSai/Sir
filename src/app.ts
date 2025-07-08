import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { logger } from 'hono/logger';
import { poweredBy } from 'hono/powered-by';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { prometheus } from '@hono/prometheus';
import { routes } from './routes';
import { errorHandler, notFound } from './middlewares';

export function createApp() {
  const app = new Hono();

  // CORS origins from ENV
  const origins = process.env.ORIGINS?.split(',') ?? [];

  // Metrics
  const { registerMetrics, printMetrics } = prometheus();

  // Global middlewares
  app.use(poweredBy());
  app.use(logger());
  app.use('*', registerMetrics);
  // 🔒 protect /metrics: only super-admin
  app.get('/metrics', printMetrics);

  app.use(secureHeaders());
  app.use(prettyJSON());
  app.use(
    cors({
      origin: origins,
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  );
  app.use(csrf());
  app.use('/assets/*', serveStatic({ path: './assets' }));

  // Main router
  app.route('/', routes);

  // Global error handlers
  app.onError((err, c) => errorHandler(c));
  app.notFound((c) => notFound(c));

  return app;
}
