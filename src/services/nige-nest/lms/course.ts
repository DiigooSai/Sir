import { NestCourseModel, type INestCourse, type UpdateCourseDTO } from '@/db/models/nige-nest/lms/course';
import type { ClientSession } from 'mongoose';
import { withTxn } from '../asset-ledger';
import { ensureNotArchived, loadOrThrow, softArchive } from '@/services/utils/archive-utils';
import { NestChapterModel } from '@/db/models/nige-nest/lms/chapter';
import { archiveChapter } from './chapter';
import { normalizeEmptyToNull } from '@/utils/string-utils';
import { NestQuizModel } from '@/db/models/nige-nest/lms/quiz';
import { archiveQuiz } from './quiz';

export async function createCourse({ title, description, thumbnailUrl, difficulty }: INestCourse, session?: ClientSession): Promise<INestCourse> {
  return withTxn(session, async (s) => {
    const [doc] = await NestCourseModel.create(
      [
        {
          title,
          difficulty,
          ...(description ? { description } : {}),
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
        },
      ],
      { session: s }
    );
    return doc;
  });
}

export async function updateCourse(
  courseId: string,
  { title, description, thumbnailUrl, difficulty }: UpdateCourseDTO,
  session?: ClientSession
): Promise<INestCourse> {
  return withTxn(session, async (s) => {
    const course = await loadOrThrow(NestCourseModel, courseId, s);
    ensureNotArchived(course);

    course.title = title;
    course.difficulty = difficulty;
    course.description = normalizeEmptyToNull(description);
    course.thumbnailUrl = normalizeEmptyToNull(thumbnailUrl);

    await course.save({ session: s });
    return course.toObject();
  });
}

export async function archiveCourse(courseId: string, session?: ClientSession): Promise<void> {
  await withTxn(session, async (s) => {
    // 1️⃣ load & ensure not already archived
    const course = await loadOrThrow(NestCourseModel, courseId, s);
    ensureNotArchived(course);

    // 2️⃣ archive each live chapter (which itself will archive its quizzes)
    const chapters = await NestChapterModel.find({ courseId: course._id, archivedAt: null }).select('_id').session(s);
    for (const { _id } of chapters) {
      await archiveChapter(_id.toString(), s);
    }

    // 3️⃣ finally soft-archive this course
    await softArchive(course, s);
  });
}
