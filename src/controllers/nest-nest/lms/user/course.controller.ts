import { getAllCourses, getChaptersForCourse, getCourseById } from '@/services/nige-nest/lms/get-services';
import { ApiResponse } from '@/utils/ApiResponse';
import type { Context } from 'hono';

export async function getAllCoursesUserController(c: Context) {
  const courses = await getAllCourses();
  return c.json(new ApiResponse(200, courses, 'Courses fetched successfully'));
}

export async function getCourseByIdUserController(c: Context) {
  // extract and validate via router’s zParamValidator
  const { _id } = c.req.param();

  // fetch the course (excludes archived by default) and its chapters
  const course = await getCourseById(_id);
  const chapters = await getChaptersForCourse(_id);

  // return both in one payload
  return c.json(new ApiResponse(200, { course, chapters }, 'Course and chapters fetched successfully'));
}
