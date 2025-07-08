import { NestChapterModel, NestChapterZ, type INestChapter, type UpdateChapterDTO } from '@/db/models/nige-nest/lms/chapter';
import { NestCourseModel } from '@/db/models/nige-nest/lms/course';
import type { ClientSession } from 'mongoose';
import { withTxn } from '../asset-ledger';
import { ensureNotArchived, loadOrThrow, softArchive } from '@/services/utils/archive-utils';
import { NestQuizModel } from '@/db/models/nige-nest/lms/quiz';
import { archiveQuiz } from './quiz';
import { normalizeEmptyToNull } from '@/utils/string-utils';

export async function createChapter(
  { courseId, heading, content, thumbnailUrl }: INestChapter,
  session?: ClientSession
): Promise<typeof NestChapterModel.prototype> {
  return withTxn(session, async (s) => {
    await loadOrThrow(NestCourseModel, courseId, s);
    const [chapter] = await NestChapterModel.create(
      [{ courseId, heading, ...(content ? { content } : {}), ...(thumbnailUrl ? { thumbnailUrl } : {}) }],
      { session: s }
    );
    return chapter;
  });
}

export async function updateChapter(
  chapterId: string,
  { heading, content, thumbnailUrl }: UpdateChapterDTO,
  session?: ClientSession
): Promise<INestChapter> {
  return withTxn(session, async (s) => {
    console.log('getting chapter id', chapterId);
    const chap = await loadOrThrow(NestChapterModel, chapterId, s);
    ensureNotArchived(chap);

    chap.heading = heading;
    chap.content = normalizeEmptyToNull(content);
    chap.thumbnailUrl = normalizeEmptyToNull(thumbnailUrl);

    await chap.save({ session: s });
    return chap.toObject();
  });
}

export async function archiveChapter(chapterId: string, session?: ClientSession): Promise<void> {
  await withTxn(session, async (s) => {
    const chap = await loadOrThrow(NestChapterModel, chapterId, s);
    ensureNotArchived(chap);
    const quizzes = await NestQuizModel.find({
      chapterId: chap._id,
      archivedAt: null,
    })
      .select('_id')
      .session(s);
    for (const { _id } of quizzes) {
      await archiveQuiz(_id.toString(), s);
    }

    await softArchive(chap, s);
  });
}
