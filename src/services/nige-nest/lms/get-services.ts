import { NestChapterModel } from '@/db/models/nige-nest/lms/chapter';
import { NestCourseModel } from '@/db/models/nige-nest/lms/course';
import { NestQuizModel } from '@/db/models/nige-nest/lms/quiz';
import { NestQuizAttemptModel } from '@/db/models/nige-nest/lms/quiz-attempt';
import { loadOrThrow } from '@/services/utils/archive-utils';
import { Types, type ClientSession } from 'mongoose';

interface GetOptions {
  includeArchived?: boolean; // default: false
  latestFirst?: boolean; // default: true
  session?: ClientSession;
}

/**
 * 1️⃣ Get single course (throws if not found / archived when includeArchived=false)
 */
export async function getCourseById(courseId: string, opts: GetOptions = {}) {
  const { includeArchived = false, session } = opts;
  const q = NestCourseModel.findById(courseId);
  if (session) q.session(session);
  const course = await q;
  if (!course) throw new Error(`Course ${courseId} not found`);
  if (!includeArchived && course.archivedAt) {
    throw new Error(`Course ${courseId} is archived`);
  }
  return course;
}
export async function getAllCourses(opts: GetOptions = {}) {
  const { includeArchived = false, latestFirst = true, session } = opts;
  const filter: any = {};
  if (!includeArchived) filter.archivedAt = null;

  const sortOrder = latestFirst ? -1 : 1;
  const q = NestCourseModel.find(filter).sort({ createdAt: sortOrder });
  if (session) q.session(session);
  return q.lean();
}

/**
 * 2️⃣ Get all chapters for a course
 */
export async function getChaptersForCourse(courseId: string, opts: GetOptions = {}) {
  const { includeArchived = false, latestFirst = true, session } = opts;

  // Verify course exists (and not archived unless includeArchived)
  await getCourseById(courseId, { includeArchived, session });

  // Build query
  const filter: any = { courseId: new Types.ObjectId(courseId) };
  if (!includeArchived) filter.archivedAt = null;

  const q = NestChapterModel.find(filter);
  if (session) q.session(session);
  return q;
}

export interface ChapterDetails {
  chapter: Awaited<ReturnType<typeof NestChapterModel.findById>>;
  doesQuizExist: boolean;
}
export async function getChapterById(chapterId: string, opts: GetOptions = {}): Promise<ChapterDetails> {
  const { includeArchived = false, session } = opts;

  // 1️⃣ Load chapter
  const q = NestChapterModel.findById(chapterId);
  if (session) q.session(session);
  const chapter = await q;
  if (!chapter) {
    throw new Error(`Chapter ${chapterId} not found`);
  }
  if (!includeArchived && chapter.archivedAt) {
    throw new Error(`Chapter ${chapterId} is archived`);
  }

  // 2️⃣ Check for a live quiz
  const quizFilter: any = { chapterId: new Types.ObjectId(chapterId) };
  if (!includeArchived) quizFilter.archivedAt = null;
  const quizExists = await NestQuizModel.exists(quizFilter).session(session);

  return {
    chapter,
    doesQuizExist: Boolean(quizExists),
  };
}

/**
 * 3️⃣ Get the (single) quiz under a chapter
 */
export async function getQuizByChapter(chapterId: string, opts: GetOptions = {}) {
  const { includeArchived = false, session } = opts;

  // Ensure chapter exists
  await loadOrThrow(NestChapterModel, chapterId, session);

  const filter: any = { chapterId: new Types.ObjectId(chapterId) };
  if (!includeArchived) filter.archivedAt = null;

  const q = NestQuizModel.findOne(filter);
  if (session) q.session(session);
  return q;
}

/**
 * 4️⃣ Get a single attempt by its _id
 */
export async function getQuizAttempt(attemptId: string, opts: GetOptions = {}) {
  const { includeArchived = false, session } = opts;
  const q = NestQuizAttemptModel.findById(attemptId);
  if (session) q.session(session);
  const attempt = await q;
  if (!attempt) throw new Error(`Attempt ${attemptId} not found`);
  if (!includeArchived && attempt.archivedAt) {
    throw new Error(`Attempt ${attemptId} is archived`);
  }
  return attempt;
}

/**
 * 5️⃣ Get all attempts for a user on a given quiz
 */
export async function getAttemptsByUserForQuiz(quizId: string, accountId: string, opts: GetOptions = {}) {
  const { includeArchived = false, latestFirst = true, session } = opts;

  // Ensure quiz exists
  await loadOrThrow(NestQuizModel, quizId, session);

  const filter: any = {
    quizId: new Types.ObjectId(quizId),
    accountId: new Types.ObjectId(accountId),
  };
  if (!includeArchived) filter.archivedAt = null;

  const q = NestQuizAttemptModel.find(filter).sort({
    createdAt: latestFirst ? -1 : 1,
  });
  if (session) q.session(session);
  return q;
}

export async function getQuizzesForChapter(chapterId: string, opts: GetOptions = {}) {
  const { includeArchived = false, latestFirst = true, session } = opts;
  await loadOrThrow(NestChapterModel, chapterId, session);

  const filter: any = { chapterId: new Types.ObjectId(chapterId) };
  if (!includeArchived) filter.archivedAt = null;

  const q = await NestQuizModel.find(filter)
    .sort({
      createdAt: latestFirst ? -1 : 1,
    })
    .lean()
    .exec();

  // if (session) q.session(session);

  // remove correctIndex from quiz
  const sanitizedQuiz = q?.map(({ questions = [], ...restQuiz }) => {
    const sanitizedQuestions = questions?.map(({ correctIndex, ...restQuestion }) => {
      return restQuestion;
    });
    return {
      ...restQuiz,
      questions: sanitizedQuestions,
    };
  });
  return sanitizedQuiz;
}

export interface GetQuizOptions {
  includeArchived?: boolean; // default: false
  includeStoppedRewarding?: boolean; // default: false
  session?: ClientSession;
}
export async function getQuizById(quizId: string, opts: GetQuizOptions = {}) {
  const { includeArchived = false, includeStoppedRewarding = false, session } = opts;

  // build the query
  const q = NestQuizModel.findById(quizId);
  if (session) q.session(session);
  const quiz = await q;
  if (!quiz) {
    throw new Error(`Quiz ${quizId} not found`);
  }

  // archived check
  if (!includeArchived && quiz.archivedAt) {
    throw new Error(`Quiz ${quizId} is archived`);
  }

  // stopped‐rewarding check
  if (!includeStoppedRewarding && quiz.shouldStopRewarding) {
    throw new Error(`Quiz ${quizId} is no longer rewarding`);
  }

  return quiz;
}
