import { Hono, type Context } from 'hono';
import { S3Client, PutObjectAclCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getUniquePresignedPostUrl } from '@saranshkhulbe/asset-manager-server-utils';
import { z } from 'zod';
import { parse as parsePath } from 'path';
import { requireSuperAdminAuth } from '@/middlewares';
import { digitalOceanCreds } from '@/db/configs/digital-ocean-creds';

const SignedUrlSchema = z.object({
  folderName: z.string().min(1, 'folderName is required'),
  file: z.object({
    fileName: z.string().min(1, 'fileName is required'),
    fileType: z.string().optional(),
  }),
  shouldSameUrl: z.boolean().optional(),
});

export async function deleteKey(key: string) {
  console.log('reaching in deleteKey');
  // 1. Normalize full URLs into bucket-relative object keys
  const objectKey = /^https?:\/\//.test(key) ? new URL(key).pathname.replace(/^\/+/, '') : key;

  const endpoint = `https://test.nige-nest.nyc3.digitaloceanspaces.com`;
  // 2. Instantiate the Spaces S3 client with the proper settings
  const client = new S3Client({
    endpoint,
    region: process.env.DO_SPACES_REGION!, // required by the AWS SDK when targeting Spaces :contentReference[oaicite:0]{index=0}
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY!,
      secretAccessKey: process.env.DO_SPACES_SECRET!,
    },
    forcePathStyle: true, // use path-style addressing to avoid SSL cert issues with dots in bucket names :contentReference[oaicite:1]{index=1}
  });

  // 3. Send the delete command

  console.log({
    key,
    objectKey,
    endpoint,
    region: process.env.DO_SPACES_REGION!, // required by the AWS SDK when targeting Spaces :contentReference[oaicite:0]{index=0}
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY!,
      secretAccessKey: process.env.DO_SPACES_SECRET!,
    },
    Bucket: process.env.DO_SPACES_BUCKET!,
  });
  await client.send(
    new DeleteObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET!,
      Key: objectKey,
    })
  );
}

/** Issue presigned POST data */
export async function getSignedUrl(c: Context) {
  try {
    const { folderName, file, shouldSameUrl } = SignedUrlSchema.parse(await c.req.json());
    const safeFolder = folderName.replace(/\/+$/, '');
    const { name: baseName, ext } = parsePath(file.fileName);
    const key = `${safeFolder}/${baseName}-${Date.now()}${ext}`;
    console.log('line 63 key', key);

    const maxMB = parseInt(process.env.MAX_FILE_SIZE_MB || '2', 10) || 2;
    const {
      url,
      fields,
      fileName: finalName,
    } = await getUniquePresignedPostUrl(key, digitalOceanCreds, maxMB * 1024 * 1024, !!shouldSameUrl, file.fileType || 'application/octet-stream');

    console.log('line 67 url', url);
    return c.json({ signedUrl: url, fields, fileName: finalName });
  } catch (err: any) {
    console.error('getSignedUrl error:', err);
    return c.json({ error: err.message || 'Failed to generate signed URL' }, 400);
  }
}

/** Set object ACL to public-read */
export async function makePublic(c: Context) {
  try {
    const { file, assetConfig } = await c.req.json();
    if (!file?.fileName) {
      return c.json({ error: 'No fileName provided' }, 400);
    }

    const creds = digitalOceanCreds;
    const client = new S3Client({
      region: creds.region,
      endpoint: `https://${creds.region}.digitaloceanspaces.com`,
      credentials: {
        accessKeyId: creds.key,
        secretAccessKey: creds.secret,
      },
    });

    await client.send(
      new PutObjectAclCommand({
        Bucket: creds.bucket,
        Key: file.fileName,
        ACL: 'public-read',
      })
    );

    return c.json({ status: true, message: 'Object is now public-read' });
  } catch (err: any) {
    console.error('makePublic error:', err);
    // Attempt to clean up if we know the key
    if ((err as any).fileName) {
      await deleteKey((err as any).fileName);
    }
    return c.json({ error: 'Failed to update ACL' }, 500);
  }
}

const DeleteFilesSchema = z.object({
  fileNames: z.array(z.string().min(1)).nonempty('fileNames must be non-empty'),
});

/** Batch-delete endpoint: always returns 200 with lists of successes and failures */
export async function deleteFiles(c: Context) {
  console.log('reaching in deleteFiles');
  const { fileNames } = DeleteFilesSchema.parse(await c.req.json());

  const deleted: string[] = [];
  const failed: { fileName: string; error: string }[] = [];

  await Promise.all(
    fileNames.map(async (key) => {
      try {
        await deleteKey(key);
        deleted.push(key);
      } catch (err: any) {
        console.error(`Failed to delete ${key}:`, err);
        failed.push({ fileName: key, error: err.message || String(err) });
      }
    })
  );

  return c.json({ deleted, failed });
}

export const utilsRouter = new Hono();
utilsRouter.post('/signed-url', requireSuperAdminAuth, getSignedUrl);
utilsRouter.post('/make-public', requireSuperAdminAuth, makePublic);
utilsRouter.post('/delete-files', requireSuperAdminAuth, deleteFiles);
