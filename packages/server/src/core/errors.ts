export const GENERIC_ERROR_MESSAGE =
  "Something went wrong. Please try again or contact support."

export class DomainError extends Error {
  readonly httpStatus: number = 500

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class NotFoundError extends DomainError {
  readonly httpStatus = 404
}

export class ForbiddenError extends DomainError {
  readonly httpStatus = 403
}

export class ConflictError extends DomainError {
  readonly httpStatus = 409
}

export class BadRequestError extends DomainError {
  readonly httpStatus = 400
}

export class UnauthorizedError extends DomainError {
  readonly httpStatus = 401
}
