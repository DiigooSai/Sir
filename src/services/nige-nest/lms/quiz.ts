import { NestChapterModel } from '@/db/models/nige-nest/lms/chapter';
import { NestQuizModel, type INestQuiz, type UpdateQuizDTO } from '@/db/models/nige-nest/lms/quiz';
import type { ClientSession } from 'mongoose';
import { withTxn } from '../asset-ledger';
import { ensureNotArchived, loadOrThrow, softArchive } from '@/services/utils/archive-utils';
import { NestQuizAttemptModel } from '@/db/models/nige-nest/lms/quiz-attempt';

export async function createQuiz(
  { durationSec, questions, reward100, reward50, chapterId }: Pick<INestQuiz, 'chapterId' | 'durationSec' | 'questions' | 'reward50' | 'reward100'>,
  session?: ClientSession
): Promise<typeof NestQuizModel.prototype> {
  return withTxn(session, async (s) => {
    const chapter = await loadOrThrow(NestChapterModel, chapterId, s);
    ensureNotArchived(chapter);
    // check if already has any not archived quiz
    const quizCount = await NestQuizModel.countDocuments({ chapterId, archivedAt: null }).session(s);
    if (quizCount > 0) {
      throw new Error('Chapter already has quiz, archive existing to create a new one');
    }
    const [quiz] = await NestQuizModel.create([{ durationSec, questions, reward100, reward50, chapterId }], { session: s });
    return quiz;
  });
}

export async function updateQuiz(
  quizId: string,
  { durationSec, questions, reward100, reward50 }: UpdateQuizDTO,
  session?: ClientSession
): Promise<INestQuiz> {
  return withTxn(session, async (s) => {
    const quiz = await loadOrThrow(NestQuizModel, quizId, s);
    ensureNotArchived(quiz);

    quiz.durationSec = durationSec;
    quiz.reward50 = reward50;
    quiz.reward100 = reward100;
    quiz.questions = questions;

    await quiz.save({ session: s });
    return quiz.toObject();
  });
}
export async function archiveQuiz(quizId: string, session?: ClientSession): Promise<void> {
  await withTxn(session, async (s) => {
    const quiz = await loadOrThrow(NestQuizModel, quizId, s);
    ensureNotArchived(quiz);
    await stopRewardingQuiz(quizId, s);

    await NestQuizAttemptModel.updateMany({ quizId: quiz._id, archivedAt: null }, { $set: { archivedAt: new Date() } }).session(s);

    await softArchive(quiz, s);
  });
}

export async function stopRewardingQuiz(quizId: string, session?: ClientSession): Promise<void> {
  return withTxn(session, async (s) => {
    const quiz = await loadOrThrow(NestQuizModel, quizId, s);
    quiz.shouldStopRewarding = true;
    await quiz.save({ session: s });
  });
}
