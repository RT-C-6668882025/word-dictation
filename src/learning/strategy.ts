/**
 * WordTok learning strategies. Headless, offline-first and independent of UI.
 * The whitelist is user-owned: strategies may read it but never mutate it.
 */
export type LearningEventType = 'viewed' | 'revealed' | 'remembered' | 'forgotten' | 'answered_correctly' | 'answered_incorrectly';
export interface LearningEvent {
  id: string;
  deckId: string;
  itemId: string;
  type: LearningEventType;
  at: number;
}
export interface LearningItem { id: string; order: number }
export interface ItemStats {
  errors: number;
  correct: number;
  lastPracticedAt?: number;
}
export type RuleOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
export type RuleField = 'errors' | 'correct' | 'lastPracticedAt' | 'order';
export type Condition =
  | { field: RuleField; op: RuleOperator; value: number }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };
export type SortMode = 'original' | 'random' | 'errors_desc' | 'oldest_first';
export interface RuleConfig {
  filter?: Condition;
  sort?: SortMode;
  limit?: number;
  seed?: number;
}
export type AlgorithmConfig =
  | { kind: 'none' }
  | { kind: 'rules'; rules: RuleConfig }
  | { kind: 'plugin'; pluginId: string; config: unknown };
export interface LearningProfile {
  id: string;
  name: string;
  algorithm: AlgorithmConfig;
  version: 1;
}
export interface DeckLearningSettings {
  deckId: string;
  profileId: string | null;
}
export interface ScheduleInput {
  deckId: string;
  items: readonly LearningItem[];
  whitelistIds: readonly string[];
  events: readonly LearningEvent[];
  now: number;
}
export interface ScheduleResult {
  itemIds: string[];
  reason: string;
}
export interface LearningStrategy {
  id: string;
  schedule(input: ScheduleInput, config: unknown): ScheduleResult;
}
export const DEFAULT_ALGORITHM: AlgorithmConfig = { kind: 'none' };
export const DEFAULT_PROFILE_ID = 'none';
export const DEFAULT_PROFILE: LearningProfile = {
  id: DEFAULT_PROFILE_ID, name: '无算法', version: 1, algorithm: DEFAULT_ALGORITHM
};
export function getStats(events: readonly LearningEvent[], deckId: string): Map<string, ItemStats> {
  const stats = new Map<string, ItemStats>();
  for (const event of events) {
    if (event.deckId !== deckId) continue;
    const value = stats.get(event.itemId) ?? { errors: 0, correct: 0 };
    if (event.type === 'forgotten' || event.type === 'answered_incorrectly') value.errors++;
    if (event.type === 'remembered' || event.type === 'answered_correctly') value.correct++;
    if (event.type !== 'viewed' && event.type !== 'revealed') {
      value.lastPracticedAt = Math.max(value.lastPracticedAt ?? 0, event.at);
    }
    stats.set(event.itemId, value);
  }
  return stats;
}
function compare(a: number, op: RuleOperator, b: number): boolean {
  switch (op) {
    case 'eq': return a === b;
    case 'ne': return a !== b;
    case 'gt': return a > b;
    case 'gte': return a >= b;
    case 'lt': return a < b;
    case 'lte': return a <= b;
  }
}
function matches(condition: Condition, item: LearningItem, stats: ItemStats): boolean {
  if ('all' in condition) return condition.all.every(c => matches(c, item, stats));
  if ('any' in condition) return condition.any.some(c => matches(c, item, stats));
  if ('not' in condition) return !matches(condition.not, item, stats);
  const value = condition.field === 'order' ? item.order : (stats[condition.field] ?? 0);
  return compare(value, condition.op, condition.value);
}
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function scheduleLearning(
  input: ScheduleInput,
  algorithm: AlgorithmConfig = DEFAULT_ALGORITHM,
  plugins: ReadonlyMap<string, LearningStrategy> = new Map()
): ScheduleResult {
  // Whitelist is the sole source of eligible items, including for plugins.
  const allowed = new Set(input.whitelistIds);
  const eligible = input.items.filter(item => allowed.has(item.id)).sort((a,b) => a.order - b.order);
  const restrictedInput = { ...input, items: eligible, whitelistIds: eligible.map(item => item.id) };
  if (algorithm.kind === 'none') {
    return { itemIds: eligible.map(item => item.id), reason: '白名单原始顺序，无自动调度' };
  }
  if (algorithm.kind === 'plugin') {
    const plugin = plugins.get(algorithm.pluginId);
    if (!plugin) return scheduleLearning(input, DEFAULT_ALGORITHM);
    try {
      const output = plugin.schedule(restrictedInput, algorithm.config);
      const seen = new Set<string>();
      const itemIds = output.itemIds.filter(id => allowed.has(id) && !seen.has(id) && seen.add(id));
      return { itemIds, reason: output.reason };
    } catch {
      return scheduleLearning(input, DEFAULT_ALGORITHM);
    }
  }
  const rules = algorithm.rules;
  const stats = getStats(input.events, input.deckId);
  let result = eligible.filter(item => !rules.filter || matches(rules.filter, item, stats.get(item.id) ?? { errors: 0, correct: 0 }));
  switch (rules.sort ?? 'original') {
    case 'errors_desc':
      result.sort((a,b) => (stats.get(b.id)?.errors ?? 0) - (stats.get(a.id)?.errors ?? 0) || a.order - b.order);
      break;
    case 'oldest_first':
      result.sort((a,b) => (stats.get(a.id)?.lastPracticedAt ?? 0) - (stats.get(b.id)?.lastPracticedAt ?? 0) || a.order - b.order);
      break;
    case 'random': {
      const rand = seededRandom(rules.seed ?? 0);
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      break;
    }
  }
  if (rules.limit !== undefined) result = result.slice(0, Math.max(0, Math.floor(rules.limit)));
  return { itemIds: result.map(item => item.id), reason: '自定义规则调度' };
}
/** MCP-facing commands can validate and store these JSON-serializable profiles. */
export function validateProfile(profile: LearningProfile): void {
  if (!profile || typeof profile !== 'object' || !profile.algorithm || typeof profile.id !== 'string' || typeof profile.name !== 'string' || profile.id.length>128 || profile.name.length>200) throw new Error('Invalid learning profile');
  if (profile.version !== 1 || !profile.id || !profile.name) throw new Error('Invalid learning profile');
  if (!['none','rules','plugin'].includes(profile.algorithm.kind)) throw new Error('Unsupported algorithm');
  if (profile.algorithm.kind === 'rules') {
    const rules = profile.algorithm.rules;
    if(!rules || typeof rules!=='object') throw Error('Invalid rules');
    if(rules.seed!==undefined&&!Number.isSafeInteger(rules.seed))throw Error('Invalid seed');
    if(rules.filter)validateCondition(rules.filter,0,{count:0});
    if (rules.limit !== undefined && (!Number.isSafeInteger(rules.limit) || rules.limit < 0)) throw new Error('Invalid limit');
    if (rules.sort && !['original','random','errors_desc','oldest_first'].includes(rules.sort)) throw new Error('Invalid sort');
  }
  if (profile.algorithm.kind === 'plugin' && !profile.algorithm.pluginId) throw new Error('Missing pluginId');
}


function validateCondition(c:Condition,depth:number,budget:{count:number}):void{
 if(!c||typeof c!=='object'||depth>12||++budget.count>200)throw Error('Invalid condition size');
 if('all'in c||'any'in c){const nodes='all'in c?c.all:c.any;if(!Array.isArray(nodes))throw Error('Invalid conditions');nodes.forEach(n=>validateCondition(n,depth+1,budget));return}
 if('not'in c){validateCondition(c.not,depth+1,budget);return}
 if(!['errors','correct','lastPracticedAt','order'].includes(c.field)||!['eq','ne','gt','gte','lt','lte'].includes(c.op)||!Number.isFinite(c.value))throw Error('Invalid condition');
}
