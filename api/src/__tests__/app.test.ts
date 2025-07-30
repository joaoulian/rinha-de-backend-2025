import { AppManager } from "../app";
import { testConfig } from "../config/test.config";

describe("App Integration Tests", () => {
	let appManager: AppManager;

	beforeAll(async () => {
		appManager = new AppManager(testConfig);
		await appManager.start();
	});

	afterAll(async () => {
		await appManager.close();
	});

	describe("Health Routes", () => {
		it("should return health status", async () => {
			const response = await appManager.app.inject({
				method: "GET",
				url: "/health",
			});
			expect(response.statusCode).toBe(200);
			const body = JSON.parse(response.body);
			expect(body.status).toBe("healthy");
			expect(body.timestamp).toBeDefined();
			expect(body.uptime).toBeGreaterThanOrEqual(0);
		});

		it("should return detailed health status", async () => {
			const response = await appManager.app.inject({
				method: "GET",
				url: "/health/detailed",
			});
			expect(response.statusCode).toBe(200);
			const body = JSON.parse(response.body);
			expect(body.status).toBe("healthy");
			expect(body.dependencies).toEqual({
				database: true,
				cache: true,
			});
		});
	});

	describe("Error Handling", () => {
		it("should return 404 for non-existent routes", async () => {
			const response = await appManager.app.inject({
				method: "GET",
				url: "/non-existent-route",
			});

			expect(response.statusCode).toBe(404);
			const body = JSON.parse(response.body);
			expect(body.error).toBe("Not Found");
		});
	});
});
