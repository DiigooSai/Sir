import { NestQuizAttemptModel } from '@/db/models/nige-nest/lms/quiz-attempt';
import { submitQuizAttempt } from '@/services/nige-nest/lms/quiz-attempt';

export async function sweepOrphanedAttempts() {
  console.log('sweepOrphanedAttempts: start');
  const now = new Date(); // UTC
  const list = await NestQuizAttemptModel.find({
    submittedAt: null,
    expiresAt: { $lt: now },
  });

  for (const { _id } of list) {
    try {
      await submitQuizAttempt(_id.toString(), null);
      console.log(`Orphan auto-submitted ${_id}`);
    } catch (e) {
      console.error(`Orphan submit failed ${_id}`, e);
    }
  }
  console.log('sweepOrphanedAttempts: end');
}
