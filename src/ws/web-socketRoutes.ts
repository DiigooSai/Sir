import { extractToken, verifyPayload } from '@/middlewares';
import type { Context, Hono } from 'hono';
import { createBunWebSocket } from 'hono/bun';
import type { BlankEnv, BlankSchema } from 'hono/types';

type Message = {
  type: string;
  payload: any;
};
export function registerWebSocketRoutes(app: Hono<BlankEnv, BlankSchema, '/'>) {
  const { upgradeWebSocket, websocket } = createBunWebSocket<Message>();

  app.get(
    '/ws',
    upgradeWebSocket((c: Context) => {
      let globalUserAccountId: string | null = null;
      return {
        onOpen: async (_event, ws) => {
          const token = await extractToken(c);
          if (!token) {
            // 2) No token → immediately close with 1008 (Policy Violation)
            ws.close(1008, 'Unauthenticated');
            return;
          }

          const { accountId } = await verifyPayload<{ accountId: string }>(token);
          globalUserAccountId = accountId;

          // 3) If token is valid, send a “connected” message
          // ws.send(
          //   JSON.stringify({
          //     type: 'connected',
          //     payload: {
          //       message: 'Authenticated',
          //       accountId,
          //     },
          //   })
          // );
          // console.log('WebSocket opened for an authenticated user', _event, ws);
        },
        onMessage: (event, ws) => {
          console.log('onMessage', event, ws);
          const message = JSON?.parse(event.data);
          switch (message.type) {
            case 'join':
              console.log(message);
              const { contractorId, freelancerId, roomKey } = message.payload;
              const belongsToRoom = [contractorId, freelancerId].includes(globalUserAccountId);
              if (!belongsToRoom) {
                ws.send(
                  JSON.stringify({
                    type: 'forbidden',
                    payload: {
                      message: 'Forbidden',
                    },
                  })
                );
                ws.close(1008, 'Forbidden');
                return;
              }

              break;
            case 'chat':
              ws.send(
                JSON.stringify({
                  type: 'message',
                  payload: {
                    response: `${JSON.stringify(message)} --reply`,
                  },
                })
              );
              break;
          }
        },
        onClose: (_event, ws) => {
          // console.log('onClose', _event, ws);
        },
        onError: (_event, ws) => {
          // console.log('onError', _event, ws);
        },
      };
    })
  );
  return websocket;
}
