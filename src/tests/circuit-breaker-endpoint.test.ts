import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("circuit breaker endpoint", () => {
  it("returns current breaker state", async () => {
    const app = createApp();
    const response = await request(app).get("/api/v1/system/circuit-breaker").expect(200);
    expect(response.body.state).toBeTypeOf("string");
  });
});
