import { beforeEach, describe, expect, it } from "vitest";
import {
  canProceed,
  getCircuitState,
  markFailure,
  markSuccess,
  resetCircuitForTests
} from "../services/circuit-breaker/redis-circuit-breaker.js";
import { redisMock } from "./mocks/redis-mock.js";

describe("redis-backed circuit breaker", () => {
  beforeEach(async () => {
    redisMock.reset();
    await resetCircuitForTests();
  });

  it("opens after 3 failures within 60 seconds", async () => {
    await markFailure();
    await markFailure();
    await markFailure();

    const state = await getCircuitState();
    expect(state.state).toBe("OPEN");
    expect(await canProceed()).toBe(false);
  });

  it("returns to CLOSED after success", async () => {
    await markFailure();
    await markFailure();
    await markFailure();
    await markSuccess();

    const state = await getCircuitState();
    expect(state.state).toBe("CLOSED");
    expect(await canProceed()).toBe(true);
  });
});
