// packages/shared/src/baseline-options.ts
// Level 定义在 objective.ts，这里只引用；重复导出会让 index.ts 的两个 `export *` 报 TS2308
import type { BaselineField, Level } from './scoring/objective.js'

export interface BaselineQuestion {
  field: BaselineField
  title: string
  hint: string
  /** 界面展示顺序；level 表示优劣，1 最差 5 最好 */
  options: ReadonlyArray<{ level: Level; label: string }>
}

export const BASELINE_OPTIONS: ReadonlyArray<BaselineQuestion> = [
  {
    field: 'salary', title: '对现在的薪资满意吗？', hint: '结合行业水平和你的期望',
    options: [
      { level: 1, label: '远低于预期' }, { level: 2, label: '偏低' }, { level: 3, label: '一般' },
      { level: 4, label: '比较满意' }, { level: 5, label: '非常满意' },
    ],
  },
  {
    field: 'overtime', title: '平时加班多吗？', hint: '按最近 3 个月的常态选',
    options: [
      { level: 5, label: '从不加班' }, { level: 4, label: '偶尔加班' }, { level: 3, label: '每周 1–2 天' },
      { level: 2, label: '每周 3–4 天' }, { level: 1, label: '天天加班' },
    ],
  },
  {
    field: 'growth', title: '晋升和成长空间怎么样？', hint: '能学到东西、有上升通道吗',
    options: [
      { level: 1, label: '完全看不到' }, { level: 2, label: '很有限' }, { level: 3, label: '一般' },
      { level: 4, label: '比较好' }, { level: 5, label: '非常好' },
    ],
  },
  {
    field: 'workload', title: '工作强度和压力大吗？', hint: '身心两方面综合感受',
    options: [
      { level: 5, label: '很轻松' }, { level: 4, label: '略有压力' }, { level: 3, label: '适中' },
      { level: 2, label: '压力较大' }, { level: 1, label: '快扛不住了' },
    ],
  },
  {
    field: 'contentFit', title: '工作内容适合你吗？', hint: '擅长、喜欢、有意义',
    options: [
      { level: 1, label: '完全不适合' }, { level: 2, label: '不太适合' }, { level: 3, label: '还行' },
      { level: 4, label: '比较适合' }, { level: 5, label: '非常适合' },
    ],
  },
  {
    field: 'commute', title: '每天通勤多久？', hint: '单程时间',
    options: [
      { level: 5, label: '30 分钟以内' }, { level: 4, label: '30–60 分钟' }, { level: 3, label: '1–1.5 小时' },
      { level: 2, label: '1.5–2 小时' }, { level: 1, label: '2 小时以上' },
    ],
  },
  {
    field: 'restTime', title: '每周能陪家人或自由休息多久？', hint: '真正属于自己的时间',
    options: [
      { level: 1, label: '几乎没有' }, { level: 2, label: '不到 1 天' }, { level: 3, label: '1 天左右' },
      { level: 4, label: '1.5 天左右' }, { level: 5, label: '完整双休' },
    ],
  },
  {
    field: 'stabilityBenefits', title: '工作稳定性和福利如何？', hint: '五险一金、裁员风险、假期等',
    options: [
      { level: 1, label: '很差' }, { level: 2, label: '偏差' }, { level: 3, label: '一般' },
      { level: 4, label: '较好' }, { level: 5, label: '很好' },
    ],
  },
]

export function optionLabel(field: BaselineField, level: number): string {
  const q = BASELINE_OPTIONS.find((x) => x.field === field)
  const o = q?.options.find((x) => x.level === level)
  if (!o) throw new Error(`invalid option: ${field}=${level}`)
  return o.label
}
