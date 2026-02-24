import { Hono } from "hono";
import type { IEnv } from "../types";
import { logger } from "../logger";
import { EmployeeByShopSchema, RegisterSchema, validate } from "../validation";
import { assert } from "../utils";

export const employeesRoutes = new Hono<IEnv>()

	.get("/user", (c) => {
		return c.json(c.var.user);
	})

	.get("/employee-name", async (c) => {
		const employeeName = await c.var.evotor.getEmployeeLastName(c.var.userId);

		assert(employeeName, "not an employee");
		return c.json({ employeeName });
	})

	.get("/by-last-name-uuid", async (c) => {
		const employeeNameAndUuid = await c.var.evotor.getEmployeesByLastName(
			c.var.user.id.toString(),
		);
		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.get("/nameUuid", async (c) => {
		const employeeNameAndUuid =
			await c.var.evotor.getEmployeesLastNameAndUuid();

		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.post("/employee/and-store/name-uuid", async (c) => {
		try {
			const data = await c.req.json();
			const { shop } = validate(EmployeeByShopSchema, data);

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
		// console.log("/api/-role");
		const userId = c.var.user.id.toString();

		const employeeRoleEvo = await c.var.evotor.getEmployeeRole(userId);

		const employeeRole =
			userId === "5700958253" || userId === "475039971"
				? "SUPERADMIN"
				: employeeRoleEvo;
		logger.debug("Employee role retrieved", { userId, employeeRole });

		assert(employeeRole, "not an employee");
		return c.json({ employeeRole });
	})

	.post("/register", async (c) => {
		try {
			const data = await c.req.json();

			const { userId } = validate(RegisterSchema, data);
			c.set("userId", String(userId));

			const employeeRoleEvo = await c.var.evotor.getEmployeeRole(userId);
			const employeeRole = employeeRoleEvo !== null;
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
