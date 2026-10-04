// The wage calculator's pay model (Scene 4), shared so every page that shows
// line-worker pay uses exactly the same math. Inputs come from
// scene4_pay_model.json; nothing here is a data value.
//
// Monthly figures are BEFORE deductions (gross, like posted pay); the
// worker's social-insurance share is returned separately as `deduction`.

export function usd(cny, fx) {
  return { cny, usd: Math.round((cny / fx) * 100) / 100 };
}

export function splitHours(hoursPerWeek) {
  const regular = Math.min(hoursPerWeek, 40);
  const otTotal = Math.max(0, hoursPerWeek - 40);
  return { regular, otWeekday: otTotal / 2, otRestDay: otTotal / 2 };
}

// Base hourly rate for the three worker types paid on a monthly-base + OT
// structure (full-time, rebate-type dispatch, student). Hourly-type dispatch
// uses a flat per-hour rate instead (see computePay), so it has no base rate
// here.
export function baseHourlyRate(worker) {
  if (worker.base_monthly) return worker.base_monthly.cny / worker.base_hours_monthly;
  if (worker.rate_hourly) return worker.rate_hourly.cny;
  return null;
}

// Weekly gross for the OT-style workers: first 40h at the base rate, hours
// above 40 split 50/50 between weekday OT (1.5x) and rest-day OT (2x) — the
// hours rule stated in scene4_pay_model.json.
export function weeklyGrossOT(worker, hoursPerWeek) {
  const rate = baseHourlyRate(worker);
  const { regular, otWeekday, otRestDay } = splitHours(hoursPerWeek);
  const { weekday, rest_day } = worker.ot_multipliers;
  return regular * rate + otWeekday * rate * weekday + otRestDay * rate * rest_day;
}

export function computePay(workerKey, worker, state, data) {
  const fx = data.fx_cny_per_usd;
  const monthlyHours = state.hoursPerWeek * data.weeks_per_month;

  if (workerKey === 'hourly_dispatch') {
    const paidCny = monthlyHours * worker.rate_paid_monthly.cny;
    const conditionMet = state.employedOn25th;
    const conditionalCny = monthlyHours * worker.conditional.rate.cny;
    return {
      hourlyPaid: worker.rate_paid_monthly,
      hourlyConditional: worker.conditional.rate,
      hourlyTotal: usd(worker.rate_paid_monthly.cny + worker.conditional.rate.cny, fx),
      monthlyPaid: usd(Math.round(paidCny), fx),
      monthlyConditional: usd(Math.round(conditionalCny), fx),
      monthlyTotal: usd(Math.round(paidCny + (conditionMet ? conditionalCny : 0)), fx),
      deduction: null,
      hasConditional: true,
      conditionMet,
      conditionLabel: worker.conditional.condition_label,
      failNote: worker.conditional.fail,
    };
  }

  const grossCny = weeklyGrossOT(worker, state.hoursPerWeek) * data.weeks_per_month;
  const deductionCny = worker.deduction_monthly?.cny ?? 0;
  const hourlyRate = usd(Math.round(baseHourlyRate(worker) * 100) / 100, fx);

  if (workerKey === 'rebate_dispatch') {
    const conditionMet = state.daysEmployed >= 90;
    const rebateSliceCny = worker.conditional.amount.cny / worker.conditional.spread_months;
    return {
      hourlyPaid: hourlyRate,
      hourlyConditional: null,
      hourlyTotal: hourlyRate,
      monthlyPaid: usd(Math.round(grossCny), fx),
      monthlyConditional: usd(Math.round(rebateSliceCny), fx),
      monthlyTotal: usd(Math.round(grossCny + (conditionMet ? rebateSliceCny : 0)), fx),
      deduction: deductionCny ? usd(deductionCny, fx) : null,
      hasConditional: true,
      conditionMet,
      conditionLabel: worker.conditional.condition_label,
      failNote: worker.conditional.fail,
      rebateRange: worker.conditional.amount_range,
      rebateFull: worker.conditional.amount,
    };
  }

  // full_time, student: no conditional component at all.
  return {
    hourlyPaid: hourlyRate,
    hourlyConditional: null,
    hourlyTotal: hourlyRate,
    monthlyPaid: usd(Math.round(grossCny), fx),
    monthlyConditional: null,
    monthlyTotal: usd(Math.round(grossCny), fx),
    deduction: deductionCny ? usd(deductionCny, fx) : null,
    hasConditional: false,
    conditionMet: true,
    conditionLabel: null,
    failNote: null,
  };
}

