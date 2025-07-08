// src/core/utils/zValidators.ts
import { zValidator } from '@hono/zod-validator';

export function zJsonValidator(schema: any) {
  return zValidator('json', schema, (result, c) => {
    if (!result.success) {
      throw result.error;
    }
  });
}

export function zParamsValidator(schema: any) {
  return zValidator('param', schema, (result, c) => {
    // removed debug logging
    if (!result.success) {
      throw result.error;
    }
  });
}

export function zQueryValidator(schema: any) {
  return zValidator('query', schema, (result, c) => {
    if (!result.success) {
      throw result.error;
    }
  });
}
