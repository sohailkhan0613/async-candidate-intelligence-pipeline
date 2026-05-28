import { z } from "zod";

export const tenantConfigSchema = z.object({
  weights: z.object({
    experience: z.number().min(0).max(1),
    skills: z.number().min(0).max(1),
    education: z.number().min(0).max(1)
  }),
  hiringThreshold: z.number().min(0).max(1),
  maxCandidatesPerBatch: z.number().int().positive()
});

export const tenantsFileSchema = z.record(z.string(), tenantConfigSchema);

export type TenantConfig = z.infer<typeof tenantConfigSchema>;
