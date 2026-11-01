import { BASELINE_FIELDS, baselineSchema, objectiveScore, type BaselineInput } from '@should-quit/shared'
export function previewBaseline(draft: Partial<BaselineInput>) {
 const baseline = Object.fromEntries(BASELINE_FIELDS.map(f => [f, draft[f] ?? 3])) as BaselineInput
 return { score: objectiveScore(baseline).score, complete: baselineSchema.safeParse(draft).success }
}
