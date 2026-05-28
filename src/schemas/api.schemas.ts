import { z } from "zod";

export const submitBatchSchema = z.object({
  tenantId: z.string().min(1),
  jd: z.string().min(1),
  candidates: z.array(
    z.object({
      candidateId: z.string().min(1),
      rawResume: z.string().min(1)
    })
  ).min(1)
});
