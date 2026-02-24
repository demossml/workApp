import type { Context } from "hono";

export interface ApiErrorPayload {
	code: string;
	message: string;
	details?: unknown;
}

export class ApiError extends Error {
	status: number;
	code: string;
	details?: unknown;

	constructor(
		status: number,
		code: string,
		message: string,
		details?: unknown,
	) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
		this.details = details;
	}
}

export const apiError = (
	status: number,
	code: string,
	message: string,
	details?: unknown,
) => new ApiError(status, code, message, details);

export function toApiErrorPayload(
	error: unknown,
	fallback: ApiErrorPayload = {
		code: "INTERNAL_ERROR",
		message: "An unexpected error occurred",
	},
): { status: number; body: ApiErrorPayload } {
	if (error instanceof ApiError) {
		return {
			status: error.status,
			body: {
				code: error.code,
				message: error.message,
				...(error.details !== undefined ? { details: error.details } : {}),
			},
		};
	}

	if (error instanceof Error) {
		return {
			status: 500,
			body: {
				code: fallback.code,
				message: error.message || fallback.message,
			},
		};
	}

	return {
		status: 500,
		body: fallback,
	};
}

export function jsonError(
	c: Context,
	status: number,
	code: string,
	message: string,
	details?: unknown,
) {
	return c.json(
		{
			code,
			message,
			...(details !== undefined ? { details } : {}),
		},
		status as 200,
		{
			"x-error-code": code,
		},
	);
}
