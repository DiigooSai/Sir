import { createModel, createSchema } from '../base';

export interface IRole {
  _id: string; // namespaced string, e.g. 'nigeEarn:user'
  name: string; // human-readable, e.g. 'user'
  isInternal?: boolean;
}

export const RoleModel = createModel<IRole>(
  'Role',
  createSchema<IRole>({
    _id: String,
    name: String,
    isInternal: { type: Boolean, default: false },
  })
);
