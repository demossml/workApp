import { z } from "zod";

export const WorkingByShopEntrySchema = z
	.object({
		shopUuid: z.string().min(1),
		opened: z.boolean(),
		employeeUuid: z.string().min(1).nullable(),
		employeeName: z.string().min(1).nullable(),
	})
	.strict();

export const WorkingByShopsResponseSchema = z
	.object({
		byShop: z.record(WorkingByShopEntrySchema),
	})
	.strict();

export type WorkingByShopsResponse = z.infer<typeof WorkingByShopsResponseSchema>;
