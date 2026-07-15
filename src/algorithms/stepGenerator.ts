/**
 * Endpoint 协处理器 — 步骤生成器
 *
 * 动画展示 Endpoint 协处理器（服务端计算下推，类似存储过程）的工作机制：
 * Client 通过 table.coprocessorService() 将计算分发到各 Region，
 * 各 Region 并行执行（如行数统计 CountEndpoint），结果在 Client 端聚合。
 * 对比 Scan 全量拉取再客户端计算，Endpoint 显著减少网络传输。
 */
import type { Step, VisualElement, VariableState } from '../types'

/** Endpoint 协处理器伪代码 */
export const TEMPLATE_CODE = `// Endpoint 协处理器：服务端计算下推，类似存储过程
class CountEndpoint extends BaseEndpoint implements RowCountService {

    private long count = 0;

    // 各 Region 本地执行：扫描本 Region 统计行数
    public long getRowCount() {
        InternalScanner s = getEnvironment().getScanner(cf);
        while (s.next(results)) {
            count += results.size();
        }
        return count;
    }
}

// Client 端：分发到各 Region 并行执行，再聚合结果
long total = table.coprocessorService(
    RowCountService.class, null, null,
    (ep) -> ep.getRowCount())
    .stream().mapToLong(Long::longValue).sum();`

// 画布布局常量
const LAYOUT = {
  client: { x: 400, y: 30, w: 200, h: 70, label: 'Client' },
  rs1: { x: 60, y: 230, w: 150, h: 70, label: 'RS-1 (RegionA)' },
  rs2: { x: 250, y: 230, w: 150, h: 70, label: 'RS-2 (RegionB)' },
  rs3: { x: 440, y: 230, w: 150, h: 70, label: 'RS-3 (RegionC)' },
  rs4: { x: 630, y: 230, w: 150, h: 70, label: 'RS-4 (RegionD)' },
  rs5: { x: 820, y: 230, w: 150, h: 70, label: 'RS-5 (RegionE)' },
  agg: { x: 400, y: 400, w: 200, h: 70, label: 'Client 端聚合' },
}

function makeElements(highlight?: string): VisualElement[] {
  const mk = (
    key: keyof typeof LAYOUT,
    type: string,
    state: string
  ): VisualElement => {
    const l = LAYOUT[key]
    return {
      id: key,
      type,
      label: l.label,
      x: l.x,
      y: l.y,
      width: l.w,
      height: l.h,
      state: key === highlight ? 'active' : state,
    }
  }
  return [
    mk('client', 'client', 'idle'),
    mk('rs1', 'rs', 'idle'),
    mk('rs2', 'rs', 'idle'),
    mk('rs3', 'rs', 'idle'),
    mk('rs4', 'rs', 'idle'),
    mk('rs5', 'rs', 'idle'),
    mk('agg', 'agg', 'idle'),
  ]
}

const RS_IDS = ['rs1', 'rs2', 'rs3', 'rs4', 'rs5'] as const
const PER_REGION_COUNT = [200, 180, 230, 190, 200]
const TOTAL = PER_REGION_COUNT.reduce((a, b) => a + b, 0) // 1000

const BASE_VARS: VariableState[] = [
  { name: 'regions', value: '5', line: 13, type: 'int' },
  { name: 'parallel', value: 'true', line: 13, type: 'boolean' },
]

export function generateSteps(): Step[] {
  const steps: Step[] = []
  let idx = 0

  const push = (
    desc: string,
    line: number,
    vars: VariableState[],
    elements: VisualElement[],
    arrows: { from: string; to: string; label?: string }[] = [],
    actionLabel?: string,
    statusText?: string
  ) => {
    steps.push({
      index: idx++,
      description: desc,
      currentLine: line,
      variables: vars,
      elements,
      connections: arrows.map((a, i) => ({
        id: `arrow-${i}`,
        fromId: a.from,
        toId: a.to,
        kind: 'arrow' as const,
        label: a.label,
      })),
      annotations: [],
      actionLabel,
      statusText: statusText ?? desc,
    })
  }

  // 步骤 0：Endpoint 总览
  push(
    'Endpoint 协处理器是服务端计算下推，类似存储过程：Client 分发计算到各 Region',
    1,
    BASE_VARS,
    makeElements(),
    RS_IDS.map((id) => ({ from: 'client', to: id, label: '分发' })),
    'OVERVIEW',
    'Endpoint 总览'
  )

  // 步骤 1：Client 调用 coprocessorService
  push(
    'Client 调用 table.coprocessorService()，将行数统计请求分发到所有 Region',
    15,
    [
      { name: 'regions', value: '5', line: 15, type: 'int' },
      { name: 'service', value: 'RowCountService', line: 15, type: 'Class' },
    ],
    makeElements('client'),
    RS_IDS.map((id) => ({ from: 'client', to: id, label: '1.分发' })),
    'DISPATCH',
    '分发到各 Region'
  )

  // 步骤 2：各 Region 并行执行
  push(
    '各 Region 并行执行 Endpoint.getRowCount()：本地扫描统计，互不阻塞',
    6,
    [
      { name: 'parallel', value: 'true', line: 6, type: 'boolean' },
      { name: 'execState', value: '各 RS 并行扫描', line: 6, type: 'String' },
    ],
    RS_IDS.reduce<VisualElement[]>(
      (acc, id) => acc.concat(makeElements(id).filter((e) => e.id === id)),
      []
    ).map((e) => ({ ...e, state: 'active' })),
    RS_IDS.map((id) => ({ from: 'client', to: id, label: '2.并行执行' })),
    'PARALLEL',
    '各 Region 并行执行'
  )

  // 步骤 3：Region-1 返回 200
  push(
    'RS-1 (RegionA) 本地扫描完成，统计行数 200，返回结果',
    10,
    [
      { name: 'perRegionCount[0]', value: '200', line: 10, type: 'long' },
      { name: 'parallel', value: 'true', line: 6 },
    ],
    makeElements('rs1').map((e) =>
      e.id === 'rs1' ? { ...e, state: 'done' } : e
    ),
    [{ from: 'rs1', to: 'client', label: '3.返回 200' }],
    'COUNT',
    'RegionA → 200'
  )

  // 步骤 4：各 Region 陆续返回
  push(
    '各 Region 陆续返回本地统计：[200,180,230,190,200]',
    10,
    [
      { name: 'perRegionCount', value: '[200,180,230,190,200]', line: 10, type: 'long[]' },
      { name: 'returned', value: '5/5', line: 10, type: 'String' },
    ],
    makeElements().map((e) =>
      RS_IDS.includes(e.id as (typeof RS_IDS)[number])
        ? { ...e, state: 'done' }
        : e
    ),
    RS_IDS.map((id) => ({ from: id, to: 'client', label: '返回' })),
    'COLLECT',
    '各 Region 返回结果'
  )

  // 步骤 5：Client 端聚合
  push(
    'Client 端聚合各部分结果：stream().mapToLong().sum() 求总和',
    17,
    [
      { name: 'total', value: String(TOTAL), line: 17, type: 'long' },
      { name: 'partialSum', value: '200+180+230+190+200', line: 17, type: 'String' },
    ],
    makeElements('agg'),
    RS_IDS.map((id) => ({ from: id, to: 'agg', label: '5.聚合' })),
    'AGGREGATE',
    'Client 端聚合'
  )

  // 步骤 6：对比 Scan 全量传输
  push(
    '对比方案：Scan 全量拉取所有行到 Client 再计算，网络传输巨大',
    17,
    [
      { name: 'scanComparison', value: '全量传输(1000 行)', line: 17, type: 'String' },
      { name: 'networkCost', value: 'Scan >> Endpoint', line: 17, type: 'String' },
    ],
    makeElements('client'),
    RS_IDS.map((id) => ({ from: id, to: 'client', label: 'Scan 拉全量' })),
    'COMPARE',
    '对比 Scan 方案'
  )

  // 步骤 7：完成
  push(
    'Endpoint 下推计算：仅传输汇总结果 1000，避免全量行数据网络传输',
    18,
    [
      { name: 'total', value: String(TOTAL), line: 18, type: 'long' },
      { name: 'parallel', value: 'true', line: 6, type: 'boolean' },
    ],
    makeElements('agg').map((e) => ({ ...e, state: 'done' })),
    [{ from: 'client', to: 'agg', label: 'total=1000' }],
    'DONE',
    '统计完成: 1000'
  )

  return steps
}
