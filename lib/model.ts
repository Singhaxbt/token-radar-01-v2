// The token radar's model, radar-3: one snapshot of the protocol universe in, one ranked board out.
//
// radar-2 scored each category at its live tokens' median market-cap-to-TVL ratio. That is a
// summary, not a fit: it says nothing about how the ratio moves with size, and it is never tested.
// radar-3 fits the ratio instead. On the snapshot's live tokens it fits log market cap on log TVL,
// once pooled and once with a separate intercept per category under a common slope, then blends
// each category's fitted multiple toward the pooled one by how many live tokens the category has.
// The multiple a protocol is scored at therefore comes from the snapshot's own live market, varies
// with the protocol's size (the fitted slope is below 1, so larger protocols trade at lower
// multiples), and is shrunk toward the market where the category has little data. The fit is
// validated out of sample, in the program, on the same snapshot: five-fold cross-validation and a
// walk-forward by listing date, both reported against the median baseline. Growth, age and chains
// stay as small documented adjustments (the data shows they add almost nothing to the fit, so they
// are not fitted); the multiple is the fitted part.
//
//   log(mcap) = a_cat + b * log(tvl),  b common, a_cat shrunk toward the pooled fit
//   multiple(t, cat) = exp(a_cat + b * ln t) / t,  blended with the pooled multiple by count
//   implied = tvl * multiple * growthMult * maturityMult * chainMult
//
// Every farm plan is netted: each step states its gas and time, the plan totals its gas, adds the
// capital's cost at 5% a year over the hold window, and the row carries plan_cost_usd and
// net_value_usd = implied_value_usd - plan_cost_usd. The board still ranks by implied value; the
// dashboard lets the reader sort by net value too.
//
// The calibration and the validation are computed from the snapshot at run time, so the same code
// scores any snapshot the house seals: nothing about a category or a protocol is baked in. The
// program is deterministic: no clock, no randomness, folds assigned by sorted order.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_weight: number;
  chain_cap: number;
  multiple_floor: number;
  multiple_cap: number;
  shrink_k: number;
  min_live_for_category: number;
  capital_apr: number;
  gas_first_tx_usd: number;
  gas_setup_small_usd: number;
  gas_setup_large_usd: number;
  gas_weekly_usd: number;
  gas_unwind_usd: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_weight: 0.02,
  chain_cap: 10,
  multiple_floor: 0.01,
  multiple_cap: 2.0,
  shrink_k: 5,
  min_live_for_category: 3,
  capital_apr: 0.05,
  gas_first_tx_usd: 3,
  gas_setup_small_usd: 4,
  gas_setup_large_usd: 8,
  gas_weekly_usd: 2,
  gas_unwind_usd: 3,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 400;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  plan_cost_usd: number;
  net_value_usd: number;
  model: {
    multiple: number;
    multiple_source: 'fitted' | 'blended' | 'pooled';
    category_live_count: number;
    category_intercept: number | null;
    slope: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  plan_cost_usd: number;
  net_value_usd: number;
  multiple: number;
  multiple_source: 'fitted' | 'blended' | 'pooled';
  category_intercept: number | null;
  slope: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number;
}

/** One fitted category: its intercept, its live-token count and the multiple at a reference TVL. */
export interface FitCategory {
  category: string;
  live_count: number;
  intercept: number;
  multiple_at_100m: number;
  source: 'fitted' | 'blended' | 'pooled';
}

/** The fit as the dashboard reports it. */
export interface FitReport {
  live_count: number;
  pooled_intercept: number;
  pooled_slope: number;
  pooled_r2: number;
  slope: number;
  r2: number;
  resid_sd: number;
  categories: FitCategory[];
}

/** One out-of-sample fold's error, in per cent of market cap. */
export interface ValidationFold {
  label: string;
  train: number;
  test: number;
  fitted_mdape: number;
  median_mdape: number;
}

/** The validation as the dashboard reports it. */
export interface ValidationReport {
  cv_folds: number;
  cv_fitted_mdape: number;
  cv_fitted_mean_ape: number;
  cv_median_mdape: number;
  cv_median_mean_ape: number;
  walk_forward: ValidationFold[];
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  fit: FitReport;
  validation: ValidationReport;
  calibration: { category: string; live_count: number; multiple: number; source: 'fitted' | 'blended' | 'pooled' }[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Whether a protocol is one the fit may learn from: a live token with a positive TVL, not an exchange. */
export function isLiveToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX';
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Ordinary least squares by the normal equations, solved with Gaussian elimination and partial
 * pivoting. `rows` are the design rows, `y` the outcomes. Returns the coefficients, or null when
 * the design is singular. Deterministic: the same input gives the same output, bit for bit.
 */
export function ols(rows: number[][], y: number[]): number[] | null {
  const k = rows[0]!.length;
  const ata: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const aty: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    for (let a = 0; a < k; a++) {
      aty[a]! += r[a]! * y[i]!;
      for (let b = 0; b < k; b++) ata[a]![b]! += r[a]! * r[b]!;
    }
  }
  // Gaussian elimination with partial pivoting on the augmented matrix.
  const m: number[][] = ata.map((row, i) => [...row, aty[i]!]);
  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    if (pivot !== col) {
      const tmp = m[col]!;
      m[col] = m[pivot]!;
      m[pivot] = tmp;
    }
    for (let r = col + 1; r < k; r++) {
      const f = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= k; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  const beta: number[] = new Array<number>(k).fill(0);
  for (let r = k - 1; r >= 0; r--) {
    let s = m[r]![k]!;
    for (let c = r + 1; c < k; c++) s -= m[r]![c]! * beta[c]!;
    beta[r] = s / m[r]![r]!;
  }
  return beta;
}

/** R-squared of predictions against outcomes. */
function rSquared(y: number[], pred: number[]): number {
  const mean = y.reduce((a, b) => a + b, 0) / y.length;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < y.length; i++) {
    ssTot += (y[i]! - mean) ** 2;
    ssRes += (y[i]! - pred[i]!) ** 2;
  }
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

/** The median of a list of numbers. */
function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/** The mean absolute percentage error, as a fraction, of predicted market caps against actuals. */
function apeStats(actual: number[], predicted: number[]): { mdape: number; meanApe: number } {
  const errs = actual.map((a, i) => Math.abs(predicted[i]! - a) / a);
  return { mdape: medianOf(errs), meanApe: errs.reduce((a, b) => a + b, 0) / errs.length };
}

/** The live tokens the fit learns from, in slug order (deterministic folds need a fixed order). */
function liveTokens(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(isLiveToken).sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** The fitted model: pooled log-log plus category fixed effects under a common slope. */
export interface FittedModel {
  pooledIntercept: number;
  pooledSlope: number;
  pooledR2: number;
  slope: number;
  r2: number;
  residSd: number;
  intercepts: Map<string, number>;
  counts: Map<string, number>;
  liveCount: number;
}

/**
 * Fit log market cap on log TVL over the snapshot's live tokens: once pooled, once with a separate
 * intercept per category under one common slope. A category's intercept is the market's own reading
 * of that category; the common slope says how the multiple moves with size. Returns null when too
 * few live tokens exist to fit at all.
 */
export function fitModel(snapshot: Snapshot): FittedModel | null {
  const live = liveTokens(snapshot);
  if (live.length < 10) return null;
  const y = live.map((p) => Math.log(p.mcap_usd!));
  const x = live.map((p) => Math.log(p.tvl_usd));
  const pooled = ols(live.map((_, i) => [1, x[i]!]), y);
  if (pooled === null) return null;
  const pooledPred = live.map((_, i) => pooled[0]! + pooled[1]! * x[i]!);
  const pooledR2 = rSquared(y, pooledPred);

  const categories = [...new Set(live.map((p) => p.category ?? 'Other'))].sort();
  const catIndex = new Map(categories.map((c, i) => [c, i]));
  const rows = live.map((p) => {
    const row = new Array<number>(categories.length + 1).fill(0);
    row[catIndex.get(p.category ?? 'Other')!] = 1;
    row[categories.length] = Math.log(p.tvl_usd);
    return row;
  });
  const fe = ols(rows, y);
  if (fe === null) return null;
  const fePred = rows.map((r) => r.reduce((s, v, i) => s + v * fe[i]!, 0));
  const feR2 = rSquared(y, fePred);
  const resid = y.map((v, i) => v - fePred[i]!);
  const residSd = Math.sqrt(resid.reduce((a, b) => a + b * b, 0) / Math.max(1, y.length - categories.length - 1));

  const intercepts = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const c of categories) {
    intercepts.set(c, fe[catIndex.get(c)!]!);
    counts.set(c, live.filter((p) => (p.category ?? 'Other') === c).length);
  }
  return {
    pooledIntercept: pooled[0]!,
    pooledSlope: pooled[1]!,
    pooledR2,
    slope: fe[categories.length]!,
    r2: feR2,
    residSd,
    intercepts,
    counts,
    liveCount: live.length,
  };
}

/** The pooled multiple at a TVL: the market's average reading, with no category in it. */
function pooledMultiple(tvl: number, fit: FittedModel): number {
  return Math.exp(fit.pooledIntercept + fit.pooledSlope * Math.log(tvl)) / tvl;
}

/**
 * A category's fitted multiple at a TVL: its own intercept under the common slope, blended toward
 * the pooled multiple in log space by how many live tokens the category has (k = shrink_k). A
 * category with no live tokens takes the pooled multiple outright. The blend is geometric, so a
 * category with one or two live tokens is mostly the market, and one with ten or more is mostly
 * its own fit. Clamped to the model's floor and cap.
 */
export function fittedMultiple(
  tvl: number,
  category: string | null,
  fit: FittedModel,
  model: ModelConstants = MODEL,
): { multiple: number; source: 'fitted' | 'blended' | 'pooled'; count: number; intercept: number | null } {
  const pool = pooledMultiple(tvl, fit);
  const key = category ?? 'Other';
  const count = fit.counts.get(key) ?? 0;
  const intercept = fit.intercepts.get(key) ?? null;
  if (intercept === null || count === 0) {
    return { multiple: clampMultiple(pool, model), source: 'pooled', count: 0, intercept: null };
  }
  const own = Math.exp(intercept + fit.slope * Math.log(tvl)) / tvl;
  const k = model.shrink_k;
  const blended = Math.exp((count * Math.log(own) + k * Math.log(pool)) / (count + k));
  const source: 'fitted' | 'blended' | 'pooled' = count >= 10 ? 'fitted' : 'blended';
  return { multiple: clampMultiple(blended, model), source, count, intercept: round4(intercept) };
}

/** A multiple inside the model's floor and cap. */
function clampMultiple(m: number, model: ModelConstants): number {
  if (!Number.isFinite(m) || m <= 0) return model.multiple_floor;
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, m));
}

/** The four multipliers and the implied value one protocol gets under `model` and `fit`. The
 * factors are rounded to the precision the board stores (multiple 6 places, the rest 4), before
 * they are multiplied, so the page's recomputation from the stored factors reproduces the board's
 * value exactly, to the dollar. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: FittedModel,
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; source: 'fitted' | 'blended' | 'pooled'; count: number; intercept: number | null; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const f = fittedMultiple(protocol.tvl_usd, protocol.category, fit, model);
  const multiple = Math.round(f.multiple * 1e6) / 1e6;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = round4(1 + (growthPct / 100) * model.growth_weight);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = round4(model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range);
  const chainMult = round4(1 + model.chain_weight * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_cap));
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult * chainMult));
  return { implied, multiple, source: f.source, count: f.count, intercept: f.intercept, growthPct, growthMult, maturityMult, chainMult, age };
}

/**
 * Validate the fit out of sample, on the snapshot's own live tokens. Five-fold cross-validation
 * (folds by sorted slug order, so the split is deterministic) fits the model on four folds and
 * predicts the held-out fold's market caps; the walk-forward fits on protocols listed before a
 * cutoff and tests on those listed after it, the way the model would meet a new launch. Both are
 * reported beside the median baseline (radar-2's rule, fit the same way), so the board shows what
 * the fit buys. Errors are fractions of market cap.
 */
export function validateFit(snapshot: Snapshot, fit: FittedModel): ValidationReport {
  const live = liveTokens(snapshot);
  const y = live.map((p) => p.mcap_usd!);

  /** Refit pooled + fixed effects on a subset of indices, then predict market caps for others. */
  function predict(trainIdx: number[], testIdx: number[]): number[] {
    const yTr = trainIdx.map((i) => Math.log(live[i]!.mcap_usd!));
    const xTr = trainIdx.map((i) => Math.log(live[i]!.tvl_usd));
    const pooled = ols(trainIdx.map((_, j) => [1, xTr[j]!]), yTr) ?? [fit.pooledIntercept, fit.pooledSlope];
    // The fixed-effects design uses only the categories the training set actually has: a dummy
    // column for a category with no training token is all zeros, which makes the design singular
    // and would throw the whole fit away (the 2023 walk-forward trains on 21 tokens in 13
    // categories, so a full-category design cannot be solved at all). A test token whose category
    // never trained falls back to the pooled prediction, the same rule the board uses.
    const trainCats = [...new Set(trainIdx.map((i) => live[i]!.category ?? 'Other'))].sort();
    const trainCatIndex = new Map(trainCats.map((c, i) => [c, i]));
    const rows = trainIdx.map((i) => {
      const row = new Array<number>(trainCats.length + 1).fill(0);
      row[trainCatIndex.get(live[i]!.category ?? 'Other')!] = 1;
      row[trainCats.length] = Math.log(live[i]!.tvl_usd);
      return row;
    });
    const fe = ols(rows, yTr);
    const slope = fe !== null ? fe[trainCats.length]! : pooled[1]!;
    return testIdx.map((i) => {
      const p = live[i]!;
      const tvl = p.tvl_usd;
      const pool = Math.exp(pooled[0]! + pooled[1]! * Math.log(tvl));
      if (fe === null) return pool;
      const key = p.category ?? 'Other';
      const n = trainIdx.filter((j) => (live[j]!.category ?? 'Other') === key).length;
      if (n === 0) return pool;
      const own = Math.exp(fe[trainCatIndex.get(key)!]! + slope * Math.log(tvl));
      const k = MODEL.shrink_k;
      return Math.exp((n * Math.log(own) + k * Math.log(pool)) / (n + k));
    });
  }

  /** The median baseline on the same split: predict market cap as TVL times the train median ratio. */
  function predictMedian(trainIdx: number[], testIdx: number[]): number[] {
    const ratios = trainIdx.map((i) => live[i]!.mcap_usd! / live[i]!.tvl_usd).sort((a, b) => a - b);
    const med = medianOf(ratios);
    return testIdx.map((i) => live[i]!.tvl_usd * med);
  }

  const cvActual: number[] = [];
  const cvPred: number[] = [];
  const cvMedPred: number[] = [];
  for (let fold = 0; fold < 5; fold++) {
    const testIdx = live.map((_, i) => i).filter((i) => i % 5 === fold);
    const trainIdx = live.map((_, i) => i).filter((i) => i % 5 !== fold);
    if (testIdx.length === 0 || trainIdx.length < 10) continue;
    const pr = predict(trainIdx, testIdx);
    const pm = predictMedian(trainIdx, testIdx);
    testIdx.forEach((i, j) => {
      cvActual.push(y[i]!);
      cvPred.push(pr[j]!);
      cvMedPred.push(pm[j]!);
    });
  }
  const cv = apeStats(cvActual, cvPred);
  const cvMed = apeStats(cvActual, cvMedPred);

  const walkForward: ValidationFold[] = [];
  for (const cutoff of ['2023-01-01', '2024-01-01']) {
    const trainIdx = live.map((_, i) => i).filter((i) => live[i]!.listed_at !== null && live[i]!.listed_at! < cutoff);
    const testIdx = live.map((_, i) => i).filter((i) => live[i]!.listed_at !== null && live[i]!.listed_at! >= cutoff);
    if (trainIdx.length < 20 || testIdx.length < 10) continue;
    const pr = predict(trainIdx, testIdx);
    const pm = predictMedian(trainIdx, testIdx);
    const actual = testIdx.map((i) => y[i]!);
    const s = apeStats(actual, pr);
    const sm = apeStats(actual, pm);
    walkForward.push({ label: `listed before ${cutoff} → after`, train: trainIdx.length, test: testIdx.length, fitted_mdape: round4(s.mdape), median_mdape: round4(sm.mdape) });
  }

  return {
    cv_folds: 5,
    cv_fitted_mdape: round4(cv.mdape),
    cv_fitted_mean_ape: round4(cv.meanApe),
    cv_median_mdape: round4(cvMed.mdape),
    cv_median_mean_ape: round4(cvMed.meanApe),
    walk_forward: walkForward,
  };
}

/** The fit as the dashboard reports it, with each category's multiple at $100M of TVL. */
export function fitReport(snapshot: Snapshot, fit: FittedModel): FitReport {
  const categories: FitCategory[] = [];
  for (const [category, intercept] of [...fit.intercepts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const count = fit.counts.get(category) ?? 0;
    const ref = 100_000_000;
    const own = Math.exp(intercept + fit.slope * Math.log(ref)) / ref;
    const pool = pooledMultiple(ref, fit);
    const blended = Math.exp((count * Math.log(own) + MODEL.shrink_k * Math.log(pool)) / (count + MODEL.shrink_k));
    categories.push({
      category,
      live_count: count,
      intercept: round4(intercept),
      multiple_at_100m: round4(clampMultiple(blended, MODEL)),
      source: count >= 10 ? 'fitted' : 'blended',
    });
  }
  return {
    live_count: fit.liveCount,
    pooled_intercept: round4(fit.pooledIntercept),
    pooled_slope: round4(fit.pooledSlope),
    pooled_r2: round4(fit.pooledR2),
    slope: round4(fit.slope),
    r2: round4(fit.r2),
    resid_sd: round4(fit.residSd),
    categories,
  };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares, so the vault's curator sees your address.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, borrow a small amount against it, and keep both positions open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('liquidity manager')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open through one fee cycle.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app, so the bridge records a real user.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token in the same wallet.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge, then close it after a day.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}, then settle it when the market resolves.`;
  if (c.includes('stable') || c.includes('dual-token')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it for the qualifying window.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it, so the position accrues on-chain.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the qualifying window.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis strategy on ${chain} and keep the position through one funding cycle.`;
  if (c.includes('payment')) return `Route $${capital} of payments through ${name} on ${chain} and keep the receipts in the same wallet.`;
  if (c.includes('launchpad') || c.includes('locker')) return `Use $${capital} to join one ${name} launch or lock on ${chain} and hold the allocation.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action, so the farmer returns instead of depositing once. */
function weeklyFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Vote on one vault proposal or rebalance into a second ${p.name} vault on ${chain}.`;
  if (c.includes('lend') || c.includes('cdp')) return `Adjust the borrow or add a small top-up to the ${p.name} position on ${chain}.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('liquidity manager')) return `Claim the pool's fees on ${p.name} and add a small top-up to the position on ${chain}.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge a small amount back or forth through ${p.name} so the address stays active.`;
  if (c.includes('rwa')) return `Check the accrued yield on the ${p.name} position and claim it if the protocol offers it.`;
  if (c.includes('staking') || c.includes('restak')) return `Restake the rewards the ${p.name} position earned, keeping them in the same wallet.`;
  return `Make one qualifying action on ${p.name}, such as a deposit, a swap or a vote on ${chain}.`;
}

/** A plan's costing: gas per step, the capital's cost, and the total. */
export interface PlanCost {
  capital: number;
  holdDays: number;
  weeks: number;
  gasUsd: number;
  capitalCostUsd: number;
  totalUsd: number;
}

/**
 * Cost a farm plan, in whole dollars. Gas is the schedule the steps state: the first transaction,
 * the setup, two dollars a week of qualifying actions over the hold window, and the unwind. The
 * capital costs 5% a year over the hold window, the return a idle dollar would earn elsewhere.
 * The total is what the plan spends to chase the protocol's implied value.
 */
export function costPlan(p: SnapshotProtocol, age: number | null, model: ModelConstants = MODEL): PlanCost {
  const capital = capitalFor(p);
  const holdDays = holdDaysFor(age);
  const weeks = Math.max(1, Math.ceil(holdDays / 7));
  const setupGas = capital >= 150 ? model.gas_setup_large_usd : model.gas_setup_small_usd;
  const gasUsd = model.gas_first_tx_usd + setupGas + model.gas_weekly_usd * weeks + model.gas_unwind_usd;
  const capitalCostUsd = capital * model.capital_apr * (holdDays / 365);
  return {
    capital,
    holdDays,
    weeks,
    gasUsd,
    capitalCostUsd: round2(capitalCostUsd),
    totalUsd: Math.max(1, Math.round(gasUsd + capitalCostUsd)),
  };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time, and a last step that
 * nets the whole plan — its gas, its capital cost and its total — against the implied value it
 * chases. The plan is derived from the protocol's own record (category, chains, TVL, age), never
 * from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, implied: number, model: ModelConstants = MODEL): FarmStep[] {
  const chain = chainOf(p);
  const cost = costPlan(p, age, model);
  const action = actionFor(p, cost.capital, chain);
  const weekly = weeklyFor(p, chain);
  const setupGas = cost.capital >= 150 ? model.gas_setup_large_usd : model.gas_setup_small_usd;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `about $${model.gas_first_tx_usd} of gas for the first transaction`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${cost.capital} of capital and about $${setupGas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weekly,
      cost: `about $${model.gas_weekly_usd} of gas a week, $${model.gas_weekly_usd * cost.weeks} over the ${cost.holdDays}-day hold`,
      time: `10 minutes a week for ${cost.weeks} weeks`,
    },
    {
      text: `Open ${p.name}'s own points or rewards page and confirm the position is counted, using only the link the protocol publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Hold the position for at least ${cost.holdDays} days so the activity is counted in more than one snapshot.`,
      cost: `the $${cost.capital} stays in the position, about $${cost.capitalCostUsd} of capital cost at 5% a year`,
      time: `${cost.holdDays} days`,
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, and unwind in small steps so one exit does not look like a sybil.`,
      cost: `about $${model.gas_unwind_usd} of gas to unwind`,
      time: '5 minutes',
    },
    {
      text: `Net: this plan spends about $${cost.totalUsd} in all ($${cost.gasUsd} of gas plus $${cost.capitalCostUsd} of capital cost) against an implied token value of $${implied.toLocaleString('en-US')}, so the farm costs ${(100 * cost.totalUsd / Math.max(1, implied)).toFixed(2)}% of the value it chases.`,
      cost: `$${cost.totalUsd} in all`,
      time: `${cost.holdDays} days from first deposit to unwind`,
    },
  ];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: FittedModel, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const cost = costPlan(s.p, s.age, model);
    const net = Math.max(1, s.implied - cost.totalUsd);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      plan_cost_usd: cost.totalUsd,
      net_value_usd: net,
      model: {
        multiple: s.multiple,
        multiple_source: s.source,
        category_live_count: s.count,
        category_intercept: s.intercept,
        slope: round4(fit.slope),
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        chain_multiplier: round4(s.chainMult),
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age, s.implied, model).map(stepText),
    };
  });
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: p.tvl_usd > 0 && p.mcap_usd !== null ? round4(p.mcap_usd / p.tvl_usd) : 0,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    plan_cost_usd: row.plan_cost_usd,
    net_value_usd: row.net_value_usd,
    multiple: row.model.multiple,
    multiple_source: row.model.multiple_source,
    category_intercept: row.model.category_intercept,
    slope: row.model.slope,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitModel(snapshot);
  if (fit === null) throw new SnapshotError('fewer than 10 live tokens: the model has nothing to fit');
  const board = buildBoard(snapshot, fit, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const report = fitReport(snapshot, fit);
  const validation = validateFit(snapshot, fit);
  const calibration = report.categories.map((c) => ({
    category: c.category,
    live_count: c.live_count,
    multiple: c.multiple_at_100m,
    source: c.source,
  }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    fit: report,
    validation,
    calibration,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!Number.isSafeInteger(r.plan_cost_usd) || r.plan_cost_usd <= 0) return `${r.slug} has plan cost ${r.plan_cost_usd}`;
    if (!Number.isSafeInteger(r.net_value_usd) || r.net_value_usd <= 0) return `${r.slug} has net value ${r.net_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
