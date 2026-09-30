/** Thrown by client API wrappers when our own /api/* routes return an error. */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function throwApiError(response: Response): Promise<never> {
  let code = "unknown_error";
  let message = "Something went wrong. Please try again.";
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    if (body.error?.code) code = body.error.code;
    if (body.error?.message) message = body.error.message;
  } catch {
    // Response wasn't JSON — keep the defaults.
  }
  throw new ApiClientError(message, code, response.status);
}
