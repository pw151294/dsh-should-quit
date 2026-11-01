import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('validates miniapp forms when dynamic Function factories are unavailable', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    let dynamicFunctions = 0;
    globalThis.Function = new Proxy(globalThis.Function, {
      construct() { dynamicFunctions++; return {}; }
    });
    const { previewBaseline } = await import('./src/pages/baseline/model.ts');
    const { BASELINE_FIELDS, baselineSchema, moodCreateSchema, askSchema } = await import('@should-quit/shared');
    assert.deepEqual(previewBaseline({}), { score: 50, complete: false });
    const baseline = Object.fromEntries(BASELINE_FIELDS.map(field => [field, 3]));
    assert.deepEqual(previewBaseline(baseline), { score: 50, complete: true });
    assert.deepEqual(baselineSchema.parse(baseline), baseline);
    assert.equal(baselineSchema.safeParse({ ...baseline, salary: 0 }).success, false);
    assert.equal(baselineSchema.safeParse({ ...baseline, extra: 3 }).success, false);
    assert.deepEqual(moodCreateSchema.parse({ stars: 3, note: '  一般  ' }), { stars: 3, note: '一般' });
    assert.equal(moodCreateSchema.safeParse({ stars: 6 }).success, false);
    assert.equal(moodCreateSchema.safeParse({ stars: 3, note: '字'.repeat(201) }).success, false);
    assert.deepEqual(askSchema.parse({ text: '  我该溜吗  ' }), { text: '我该溜吗' });
    assert.equal(askSchema.safeParse({ text: ' ' }).success, false);
    assert.equal(askSchema.safeParse({ text: '字'.repeat(501) }).success, false);
    console.log(JSON.stringify({ dynamicFunctions }));
  `], { cwd: process.cwd(), encoding: 'utf8', timeout: 10_000 })
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({ dynamicFunctions: 0 })
})
