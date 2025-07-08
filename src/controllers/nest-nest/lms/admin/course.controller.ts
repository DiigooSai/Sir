import type { INestCourse, UpdateCourseDTO } from '@/db/models/nige-nest/lms/course';
import { archiveCourse, createCourse, updateCourse } from '@/services/nige-nest/lms/course';
import { getAllCourses, getChaptersForCourse, getCourseById, getQuizAttempt } from '@/services/nige-nest/lms/get-services';
import { isAttemptActive } from '@/services/nige-nest/lms/quiz-attempt';
import { ApiResponse } from '@/utils/ApiResponse';
import type { Context } from 'hono';

// Body schema: NestCourseZ (validated in router via zJsonValidator)
export async function createCourseController(c: Context) {
  const { title, description, thumbnailUrl, difficulty }: INestCourse = await c.req.json();
  const course = await createCourse({
    title,
    description,
    thumbnailUrl,
    difficulty,
  });
  return c.json(new ApiResponse(201, course, 'Course created successfully'), 201);
}

export async function updateCourseController(c: Context) {
  const { courseId } = c.req.param(); // param validator ensures valid ObjectId
  const { title, description, thumbnailUrl, difficulty } = (await c.req.json()) as UpdateCourseDTO;
  const updated = await updateCourse(courseId, { title, description, thumbnailUrl, difficulty });
  return c.json(new ApiResponse(200, updated, 'Course updated successfully'));
}

export async function archiveCourseController(c: Context) {
  const { courseId } = await c.req.json();
  await archiveCourse(courseId);
  return c.json(new ApiResponse(200, null, 'Course archived successfully'));
}

export async function getAllCoursesAdminController(c: Context) {
  const courses = await getAllCourses({ includeArchived: true });
  return c.json(new ApiResponse(200, courses, 'Courses fetched successfully'));
}

// Path params schema: z.object({ courseId: mongoIdZod })
export async function getCourseByIdAdminController(c: Context) {
  // extract and validate via router’s zParamValidator
  const { _id } = c.req.param();

  // fetch the course (excludes archived by default) and its chapters
  const course = await getCourseById(_id, { includeArchived: true });
  const chapters = await getChaptersForCourse(_id, { includeArchived: true });

  // return both in one payload
  return c.json(new ApiResponse(200, { course, chapters }, 'Course and chapters fetched successfully'));
}

export async function getAttemptStatusController(c: Context) {
  const attemptId = c.req.param('attemptId');

  // 1. Check whether it’s still active (i.e. < expiresAt && not yet submitted)
  const active = await isAttemptActive(attemptId);

  // 2. Load the attempt so the client can see startAt, expiresAt, maybe timeLeft
  const attempt = await getQuizAttempt(attemptId);

  return c.json(new ApiResponse(200, { active, attempt }, 'Attempt status fetched'));
}
