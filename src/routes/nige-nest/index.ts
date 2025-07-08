import { Hono } from 'hono';
import { nigeNestEscrowRoutes } from './escrow';
import { nestLmsRoutes } from './lms';
import { getAllNestAvatarsController } from '@/controllers/nest-nest/nest.controller';
import { nigeNestNestRoutes } from './nest';

export const nigeNestRoutes = new Hono();

nigeNestRoutes.get('/avatars', getAllNestAvatarsController);
nigeNestRoutes.route('/escrow', nigeNestEscrowRoutes);
nigeNestRoutes.route('/nest', nigeNestNestRoutes);
nigeNestRoutes.route('/lms', nestLmsRoutes);
