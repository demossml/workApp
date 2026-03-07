import { z } from "zod";

const AmountByPaymentTypeSchema = z.record(z.number().finite().nonnegative());

export const ShopSalesMetricsSchema = z
	.object({
		sell: AmountByPaymentTypeSchema,
		refund: AmountByPaymentTypeSchema,
		totalSell: z.number().finite().nonnegative(),
		checksCount: z.number().int().nonnegative(),
	})
	.strict();

export const TopProductSchema = z
	.object({
		productName: z.string().min(1),
		revenue: z.number().finite(),
		quantity: z.number().finite(),
		refundRevenue: z.number().finite(),
		refundQuantity: z.number().finite(),
		netRevenue: z.number().finite(),
		netQuantity: z.number().finite(),
		averagePrice: z.number().finite(),
		refundRate: z.number().finite(),
	})
	.strict();

export const FinancialMetricsResponseSchema = z
	.object({
		salesDataByShopName: z.record(ShopSalesMetricsSchema),
		grandTotalSell: z.number().finite().nonnegative(),
		grandTotalRefund: z.number().finite().nonnegative(),
		netRevenue: z.number().finite(),
		averageCheck: z.number().finite(),
		grandTotalCashOutcome: z.number().finite().nonnegative(),
		cashOutcomeData: z.record(AmountByPaymentTypeSchema),
		totalChecks: z.number().int().nonnegative(),
		topProducts: z.array(TopProductSchema),
	})
	.strict();

export type FinancialMetricsResponse = z.infer<
	typeof FinancialMetricsResponseSchema
>;
