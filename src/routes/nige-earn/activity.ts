import { getUserActivity } from '@/controllers/nige-earn/activity.controller';
import { PaginationSchema } from '@/db/common-schemas';
import { requireEarnAuth } from '@/middlewares';
import { zQueryValidator } from '@/utils/zValidators';
import { Hono } from 'hono';

export const activityRouter = new Hono();

activityRouter.get('/', requireEarnAuth, zQueryValidator(PaginationSchema), getUserActivity);
