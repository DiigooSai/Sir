import type { Model, Document, ClientSession, SaveOptions } from 'mongoose';

export async function loadOrThrow<T = any>(model: Model<any, any, any>, id: string, session?: ClientSession): Promise<T> {
  const q = model.findById(id);
  if (session) q.session(session);
  const doc = await q;
  if (!doc) {
    throw new Error(`${model.modelName} ${id} not found`);
  }
  return doc;
}
export function ensureNotArchived(doc: { archivedAt?: Date }): void {
  if (doc.archivedAt) {
    throw new Error(`${(doc as any).constructor.modelName} ${(doc as any)._id} already archived`);
  }
}
export async function softArchive(doc: Document & { archivedAt?: Date }, session?: ClientSession): Promise<void> {
  doc.archivedAt = new Date();
  const opts: SaveOptions = session ? { session } : {};
  await doc.save(opts);
}
