import { Hono } from "hono";
import type { IEnv } from "../types";
import { logger } from "../logger";
import { EmployeeByShopSchema, RegisterSchema, validate } from "../validation";
import { assert } from "../utils";
import {
	getEmployeeDetailsByUserId,
	listEmployeeDetails,
	listEmployeeDetailsByShop,
	toEmployeeSummary,
} from "../db/repositories/employeesDetails";

export const employeesRoutes = new Hono<IEnv>()

	.get("/user", (c) => {
		return c.json(c.var.user);
	})

	.get("/employee-name", async (c) => {
		const row = await getEmployeeDetailsByUserId(c.env.DB, c.var.userId);
		const name = row?.last_name || row?.name || null;
		if (name) {
			return c.json({ employeeName: name });
		}
		const employeeName = await c.var.evotor.getEmployeeLastName(c.var.userId);
		assert(employeeName, "not an employee");
		return c.json({ employeeName });
	})

	.get("/by-last-name-uuid", async (c) => {
		const row = await getEmployeeDetailsByUserId(
			c.env.DB,
			c.var.user.id.toString(),
		);
		if (row) {
			return c.json({ employeeNameAndUuid: [toEmployeeSummary(row)] });
		}
		const employeeNameAndUuid = await c.var.evotor.getEmployeesByLastName(
			c.var.user.id.toString(),
		);
		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.get("/nameUuid", async (c) => {
		const rows = await listEmployeeDetails(c.env.DB);
		if (rows.length > 0) {
			return c.json({
				employeeNameAndUuid: rows.map((row) => toEmployeeSummary(row)),
			});
		}
		const employeeNameAndUuid =
			await c.var.evotor.getEmployeesLastNameAndUuid();
		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.post("/employee/and-store/name-uuid", async (c) => {
		try {
			const data = await c.req.json();
			const { shop } = validate(EmployeeByShopSchema, data);
			const rows = await listEmployeeDetailsByShop(c.env.DB, shop);
			if (rows.length > 0) {
				return c.json({
					employeeNameAndUuid: rows.map((row) => toEmployeeSummary(row)),
				});
			}
			const employeeNameAndUuid = await c.var.evotor.getEmployeesByShopId(shop);
			assert(employeeNameAndUuid, "not an employee");
			return c.json({ employeeNameAndUuid });
		} catch (error) {
			return c.json(
				{
					error:
						error instanceof Error ? error.message : "Invalid request data",
				},
				400,
			);
		}
	})

	.get("/employee-role", async (c) => {
		const userId =
			String(c.var.userId || "").trim() ||
			String(c.req.header("telegram-id") || "").trim() ||
			String(c.req.query("telegram-id") || "").trim();
		if (!userId) {
			return c.json({ employeeRole: null });
		}
		if (userId === "5700958253" || userId === "475039971") {
			return c.json({ employeeRole: "SUPERADMIN" });
		}
		const row = await getEmployeeDetailsByUserId(c.env.DB, userId);
		if (row?.role) {
			return c.json({ employeeRole: row.role });
		}
		const employeeRoleEvo = await c.var.evotor.getEmployeeRole(userId);
		const employeeRole = employeeRoleEvo;
		logger.debug("Employee role retrieved", { userId, employeeRole });
		assert(employeeRole, "not an employee");
		return c.json({ employeeRole });
	})

	.post("/register", async (c) => {
		try {
			const data = await c.req.json();

			const { userId } = validate(RegisterSchema, data);
			c.set("userId", String(userId));

			const row = await getEmployeeDetailsByUserId(c.env.DB, userId);
			const employeeRoleFromEvotor = await c.var.evotor.getEmployeeRole(userId);
			const employeeRole =
				row?.uuid != null ? true : employeeRoleFromEvotor !== "null";
			logger.debug("User registration attempt", { userId, employeeRole });

			if (!employeeRole) {
				return c.json({ success: false, message: "not an employee" }, 403);
			}

			assert(employeeRole, "not an employee");
			return c.json({ success: true, employeeRole });
		} catch (error) {
			return c.json(
				{
					success: false,
					message:
						error instanceof Error ? error.message : "Invalid request data",
				},
				400,
			);
		}
	});
