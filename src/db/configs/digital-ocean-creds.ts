import { PERMITTED_APPS, permittedAppEnum, type PermittedApp } from '@/constants/app-roles';
import { z } from 'zod';

// const zDigitalOceanCreds = z.object({
//   region: z.string().min(1),
//   key: z.string().min(1),
//   secret: z.string().min(1),
//   bucket: z.string().min(1),
// });
// type DigitalOceanCredsType = z.infer<typeof zDigitalOceanCreds>;
// class DigitalOceanCreds {
//   private digitalOceanCreds: Partial<Record<PermittedApp, DigitalOceanCredsType>> = {
//     [PERMITTED_APPS.NIGE_NEST]: {
//       region: process.env.NIGE_NEST_DO_SPACES_REGION!,
//       key: process.env.NIGE_NEST_DO_SPACES_KEY!,
//       secret: process.env.NIGE_NEST_DO_SPACES_SECRET!,
//       bucket: process.env.NIGE_NEST_DO_SPACES_BUCKET!,
//     },
//   };

//   public getCreds(app: string) {
//     const appSafeParsed = permittedAppEnum.safeParse(app);
//     if (!appSafeParsed.success) {
//       throw new Error('DigitalOcean: Invalid app');
//     }
//     const creds = this.digitalOceanCreds?.[appSafeParsed.data];
//     const credsSafeParsed = zDigitalOceanCreds.safeParse(creds);
//     if (!credsSafeParsed.success) {
//       throw new Error('DigitalOcean: Invalid creds configured');
//     }
//     return credsSafeParsed.data;
//   }
// }

// export const digitalOceanInstance = new DigitalOceanCreds();

export const digitalOceanCreds = {
  region: process.env.DO_SPACES_REGION!,
  key: process.env.DO_SPACES_KEY!,
  secret: process.env.DO_SPACES_SECRET!,
  bucket: process.env.DO_SPACES_BUCKET!,
};
