import type { StatusCode } from "hono/utils/http-status";

class ApiResponse {
  statusCode: StatusCode;
  data: unknown;
  message: string;
  success: boolean;
  constructor(
    statusCode: StatusCode,
    data: unknown,
    message: string = "success"
  ) {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400;
  }
}
export { ApiResponse };
