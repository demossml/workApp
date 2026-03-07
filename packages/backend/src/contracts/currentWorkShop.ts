import { z } from "zod";

export const CurrentWorkShopResponseSchema = z
	.object({
		uuid: z.string(),
		name: z.string(),
		isWorkingToday: z.boolean(),
	})
	.strict();

export type CurrentWorkShopResponse = z.infer<
	typeof CurrentWorkShopResponseSchema
>;
