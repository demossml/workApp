import { z } from "zod";

export const employeeSchema = z.object({
	lastName: z.string().describe("Employee Surname"),
	uuid: z.string().describe("Employee Unique Identifier in Evotor System"),
	id: z.string().describe("Employee Unique Id in Our Database"),
	name: z.string().describe("Employee Full Name"),
	last_name: z.string().optional().describe("Employee Surname"),
	patronymic_name: z.string().optional(),
	phone: z.number().optional(),
	stores: z.array(z.string()),
	role: z.union([
		z.literal("ADMIN"),
		z.literal("CASHIER"),
		z.literal("MANUAL"),
	]),
	role_id: z.string(),
	user_id: z.string(),
	created_at: z.string(),
	updated_at: z.string(),
});

export const transactionSchema = z.object({
	type: z.union([
		z.literal("PAYMENT"),
		z.literal("REFUND"),
		z.literal("REGISTER_POSITION"),
		z.literal("CASH_OUTCOME"),
		z.literal("FPRINT_Z_REPORT"),
		z.literal("CASH_INCOME"),
	]),
	paymentType: z.string(),
	sum: z.number(),
	commodityUuid: z.string(),
	paymentCategoryId: z.number(),
	price: z.number(),
	costPrice: z.number(),
	quantity: z.number(),
	commodityName: z.string(),
	cash: z.number(),
	closeDate: z.string(),
	creationDate: z.string(),
});

export const salesDataSchema = z.object({
	transactions: z.array(transactionSchema),
});

export const rolePropertiesSchema = z.object({
	agent_type: z
		.union([
			z.literal("AGENT"),
			z.literal("COMMISSIONER"),
			z.literal("ATTORNEY_IN_FACT"),
			z.literal("PAYMENT_AGENT"),
			z.literal("BANK_PAYMENT_AGENT"),
		])
		.optional(),
	subagentType: z
		.union([z.literal("PAYMENT_SUBAGENT"), z.literal("BANK_PAYMENT_SUBAGENT")])
		.optional(),
	short_name: z.string().optional(),
	type: z.union([
		z.literal("LEGAL_ENTITY"),
		z.literal("INDIVIDUAL_ENTREPRENEUR"),
		z.literal("GOVERNMENT_AGENCY"),
	]),
});

export const extraKeySchema = z.object({
	identity: z.string(),
	description: z.string(),
	app_id: z.string(),
});

export const shopSchema = z.object({
	id: z.string(),
	name: z.string(),
	address: z.string().optional(),
	user_id: z.string(),
	created_at: z.string(),
	updated_at: z.string(),
	uuid: z.string(),
});

export const pagingSchema = z.object({
	next_cursor: z.string(),
});

export const shopsResponseSchema = z.object({
	paging: pagingSchema,
	items: z.array(shopSchema),
});

export const productUuidSchema = z.object({
	uuid: z.string(),
	group: z.boolean(),
	parentUuid: z.string(),
	name: z.string(),
	shopId: z.string(),
});

export const productSchema = z.object({
	type: z.string(),
	name: z.string(),
	code: z.string().optional(),
	price: z.number(),
	measure_name: z.string(),
	is_excisable: z.boolean().optional(),
	is_age_limited: z.boolean().optional(),
	tax: z.string(),
	allow_to_sell: z.boolean(),
	description: z.string().optional(),
	article_number: z.string().optional(),
	parentUuid: z.string().optional(),
	id: z.string(),
	store_id: z.string(),
	user_id: z.string(),
	created_at: z.string(),
	updated_at: z.string(),
	uuid: z.string(),
	group: z.boolean(),
});

export const productsResponseSchema = z.object({
	paging: pagingSchema,
	items: z.array(productSchema),
});

export const salesSummarySchema = z.record(z.number());

export const paymentTypeSchema = z.object({
	CARD: z.string(),
	ADVANCE: z.string(),
	CASH: z.string(),
	COUNTEROFFER: z.string(),
	CREDIT: z.string(),
	ELECTRON: z.string(),
	UNKNOWN: z.string(),
});

export const shopUuidNameSchema = z.object({
	uuid: z.string(),
	name: z.string(),
});

export const counterpartySchema = z.object({
	id: z.string(),
	full_name: z.string(),
	inn: z.string().optional(),
	kpp: z.string().optional(),
	phones: z.array(z.string()).optional(),
	addresses: z.array(z.string()).optional(),
	role: z.union([
		z.literal("AGENT"),
		z.literal("SUBAGENT"),
		z.literal("PRINCIPAL"),
		z.literal("TRANSACTION_OPERATOR"),
	]),
	role_properties: rolePropertiesSchema.optional(),
});

export const positionSchema = z.object({
	quantity: z.number(),
	initial_quantity: z.number(),
	sum: z.number(),
	measure_name: z.string(),
	product_name: z.string(),
	product_id: z.string(),
	price: z.number(),
	tare_volume: z.number().optional(),
	alcohol_product_kind_code: z.number().optional(),
	alcohol_by_volume: z.number().optional(),
	extra_keys: z.array(extraKeySchema).optional(),
});

export const documentBodySchema = z.object({
	positions: z.array(positionSchema),
});

export const documentSchema = z.object({
	type: z.union([
		z.literal("OPEN_SESSION"),
		z.literal("CLOSE_SESSION"),
		z.literal("CASH_INCOME"),
		z.literal("ACCEPT"),
		z.literal("SELL"),
		z.literal("PAYBACK"),
		z.literal("RETURN"),
		z.literal("BUY"),
		z.literal("BUYBACK"),
		z.literal("X_REPORT"),
		z.literal("Z_REPORT"),
		z.literal("CORRECTION"),
		z.literal("PAYMENT"),
		z.literal("CASH_OUTCOME"),
		z.literal("CASH_INCOME"),
	]),
	id: z.string(),
	extras: z.record(z.unknown()),
	number: z.number(),
	closeDate: z.string(),
	time_zone_offset: z.number(),
	session_id: z.string(),
	session_number: z.number(),
	close_user_id: z.string(),
	device_id: z.string(),
	store_id: z.string(),
	user_id: z.string(),
	version: z.string().optional(),
	counterparties: z.array(counterpartySchema).optional(),
	body: documentBodySchema,
	openUserUuid: z.string().optional(),
	transactions: z.array(transactionSchema),
});
