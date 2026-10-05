// The wage calculator's pay model (Assembly Line, How work is paid), shared so every page that shows
// line-worker pay uses exactly the same math. Inputs come from
// scene4_pay_model.json; nothing here is a data value.
//
// Monthly figures are gross pay (like posted pay); no deductions are modelled.

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

// Hours the row is paid for: hourly-type dispatch has a weekly minimum
// (`min_hours_per_week`), so fewer hours on the slider still pay that minimum.
export function paidHours(worker, hoursPerWeek) {
  return Math.max(hoursPerWeek, worker.min_hours_per_week ?? 0);
}

export function computePay(workerKey, worker, state, data) {
  const fx = data.fx_cny_per_usd;
  const hours = paidHours(worker, state.hoursPerWeek);
  const monthlyHours = hours * data.weeks_per_month;
  const atMinimum = hours > state.hoursPerWeek;

  if (workerKey === 'hourly_dispatch') {
    const paidCny = monthlyHours * worker.rate_paid_monthly.cny;
    const conditionMet = state.employedOn25th;
    const conditionalCny = monthlyHours * worker.conditional.rate.cny;
    return {
      hours,
      atMinimum,
      hourlyPaid: worker.rate_paid_monthly,
      hourlyConditional: worker.conditional.rate,
      hourlyTotal: usd(worker.rate_paid_monthly.cny + worker.conditional.rate.cny, fx),
      monthlyPaid: usd(Math.round(paidCny), fx),
      monthlyConditional: usd(Math.round(conditionalCny), fx),
      monthlyTotal: usd(Math.round(paidCny + (conditionMet ? conditionalCny : 0)), fx),
      hasConditional: true,
      conditionMet,
      conditionLabel: worker.conditional.condition_label,
      failNote: worker.conditional.fail,
    };
  }

  const weeklyCny = weeklyGrossOT(worker, hours);
  const grossCny = weeklyCny * data.weeks_per_month;
  const hourlyRate = usd(Math.round(baseHourlyRate(worker) * 100) / 100, fx);

  if (workerKey === 'rebate_dispatch') {
    // The rebate is paid once, after `threshold_days`; spread over the months
    // actually worked, so the longer the stay, the less it adds per month.
    const c = worker.conditional;
    const conditionMet = state.daysEmployed >= c.threshold_days;
    const months = Math.max(state.daysEmployed, c.threshold_days) / c.days_per_month;
    const rebateCny = c.amount.cny / months;
    return {
      hours,
      atMinimum,
      weekly: usd(Math.round(weeklyCny), fx),
      hourlyPaid: hourlyRate,
      hourlyConditional: null,
      hourlyTotal: hourlyRate,
      monthlyPaid: usd(Math.round(grossCny), fx),
      monthlyConditional: usd(Math.round(rebateCny), fx),
      monthlyTotal: usd(Math.round(grossCny + (conditionMet ? rebateCny : 0)), fx),
      hasConditional: true,
      conditionMet,
      conditionLabel: c.condition_label,
      failNote: c.fail,
      rebateFull: c.amount,
      rebateMonths: months,
    };
  }

  // full_time, student: no conditional component at all.
  return {
    hours,
    atMinimum,
    weekly: usd(Math.round(weeklyCny), fx),
    hourlyPaid: hourlyRate,
    hourlyConditional: null,
    hourlyTotal: hourlyRate,
    monthlyPaid: usd(Math.round(grossCny), fx),
    monthlyConditional: null,
    monthlyTotal: usd(Math.round(grossCny), fx),
    hasConditional: false,
    conditionMet: true,
    conditionLabel: null,
    failNote: null,
  };
}
