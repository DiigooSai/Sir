import { z, ZodError } from 'zod';

export const ENVS = {
  LOCAL: 'local',
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
};
export const zEnvEnum = z.enum([ENVS.LOCAL, ENVS.DEVELOPMENT, ENVS.PRODUCTION]);

export type EnvEnumType = z.infer<typeof zEnvEnum>;
const envVariables = z.object({
  // SERVER
  NODE_ENV: zEnvEnum,
  PORT: z.string(),

  // DB
  MONGO_URI: z.string().url(), // Validate it's a valid Mongo URI

  ORIGINS: z.string(),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  // DO_SPACES_ENDPOINT: z.string(),
  // DO_SPACES_BUCKET: z.string(),
  // DO_SPACES_KEY: z.string(),
  // DO_SPACES_SECRET: z.string(),
  // DO_SPACES_REGION: z.string(),

  // ADMIN_JWT_SECRET: z.string(),
});

// declare global {
//   namespace NodeJS {
//     interface ProcessEnv extends z.infer<typeof envVariables> {}
//   }
// }

export const parsedEnv = () => {
  try {
    envVariables.parse(process.env);
    console.log(process.env);
  } catch (e) {
    const errors = (e as ZodError).errors.map((issue: any) => ({
      field: issue.path.join('.'),
      errorMessage: issue.message,
    }));
    console.log({
      message: 'Invalid environment variables',
      errors,
    });
    process.exit(1);
  }
};
