import { readFileSync } from "node:fs";
import { z } from "zod";

const tenantSchema = z.object({
  weights: z.object({
    experience: z.number().min(0).max(1),
    skills: z.number().min(0).max(1),
    education: z.number().min(0).max(1)
  }),
  hiringThreshold: z.number().min(0).max(1),
  maxCandidatesPerBatch: z.number().int().positive()
});

const tenantsSchema = z.record(z.string(), tenantSchema);

const file = readFileSync("tenants.config.json", "utf-8");
const parsed = tenantsSchema.parse(JSON.parse(file));

for (const [tenantId, tenant] of Object.entries(parsed)) {
  const total = tenant.weights.experience + tenant.weights.skills + tenant.weights.education;
  if (Math.abs(total - 1) > 0.0001) {
    throw new Error(`Tenant ${tenantId} weights must sum to 1.0`);
  }
}

export const tenants = parsed;

export type TenantId = keyof typeof tenants;
