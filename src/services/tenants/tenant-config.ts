import { readFileSync } from "node:fs";
import { tenantsFileSchema } from "../../schemas/tenant.schemas.js";

const file = readFileSync("tenants.config.json", "utf-8");
const parsed = tenantsFileSchema.parse(JSON.parse(file));

for (const [tenantId, tenant] of Object.entries(parsed)) {
  const total = tenant.weights.experience + tenant.weights.skills + tenant.weights.education;
  if (Math.abs(total - 1) > 0.0001) {
    throw new Error(`Tenant ${tenantId} weights must sum to 1.0`);
  }
}

export const tenants = parsed;
