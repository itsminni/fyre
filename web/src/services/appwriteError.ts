export class AppwriteServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null = null,
    readonly type: string | null = null,
    readonly payload: unknown = null
  ) {
    super(message);
    this.name = 'AppwriteServiceError';
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }
}
