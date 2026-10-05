import { createScene, addCaveat, addMethodNote } from '../lib/sceneShell.js';
import { colorFor } from '../lib/colorTokens.js';
import { count, money } from '../lib/format.js';
import { computePay, splitHours, baseHourlyRate } from '../lib/payModel.js';
import { createTooltip } from '../lib/tooltip.js';

const WORKER_ORDER = ['full_time', 'rebate_dispatch', 'hourly_dispatch', 'student'];

// Big-number slider card: large current value, min/max range labels under the
// track, -/+ steppers. Styled per wage_calculator_ref.png.
function sliderControl({ index, title, value, unitLabel, min, max, minLabel, maxLabel, accentColor, sub, onInput }) {
  const card = document.createElement('div');
  card.className = 'slider-card';
  card.style.setProperty('--accent', accentColor);

  const kicker = document.createElement('p');
  kicker.className = 'slider-card__kicker';
  kicker.textContent = `${index} ${title}`;
  card.append(kicker);

  const head = document.createElement('div');
  head.className = 'slider-card__head';
  const valueEl = document.createElement('span');
  valueEl.className = 'slider-card__value';
  const unitEl = document.createElement('span');
  unitEl.className = 'slider-card__unit';
  unitEl.textContent = unitLabel;
  head.append(valueEl, unitEl);

  const steppers = document.createElement('div');
  steppers.className = 'slider-card__steppers';
  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'control-stepper';
  minus.textContent = '−';
  minus.setAttribute('aria-label', `Decrease ${title}`);
  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'control-stepper';
  plus.textContent = '+';
  plus.setAttribute('aria-label', `Increase ${title}`);
  steppers.append(minus, plus);

  const headRow = document.createElement('div');
  headRow.className = 'slider-card__head-row';
  headRow.append(head, steppers);
  card.append(headRow);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  input.className = 'control-slider';
  input.setAttribute('aria-label', title);
  card.append(input);

  const range = document.createElement('div');
  range.className = 'slider-card__range';
  const minEl = document.createElement('span');
  minEl.textContent = minLabel;
  const maxEl = document.createElement('span');
  maxEl.textContent = maxLabel;
  range.append(minEl, maxEl);
  card.append(range);

  const subEl = document.createElement('p');
  subEl.className = 'slider-card__sub';
  if (sub) card.append(subEl);

  const setValue = (v) => {
    const clamped = Math.min(max, Math.max(min, v));
    input.value = String(clamped);
    input.style.setProperty('--pct', String(((clamped - min) / (max - min)) * 100));
    valueEl.textContent = count(clamped);
    if (sub) subEl.textContent = sub(clamped);
    onInput(clamped);
  };

  minus.addEventListener('click', () => setValue(Number(input.value) - 1));
  plus.addEventListener('click', () => setValue(Number(input.value) + 1));
  input.addEventListener('input', () => setValue(Number(input.value)));

  valueEl.textContent = count(value);
  if (sub) subEl.textContent = sub(value);
  input.style.setProperty('--pct', String(((value - min) / (max - min)) * 100));
  return card;
}

function toggleControl({ label, value, onChange, compact = false }) {
  const wrap = document.createElement('div');
  wrap.className = compact ? 'control-row control-row--compact' : 'control-row';

  const labelEl = document.createElement('p');
  labelEl.className = 'control-row__label';
  labelEl.textContent = label;
  wrap.append(labelEl);

  const group = document.createElement('div');
  group.className = 'toggle-group';
  for (const opt of [true, false]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toggle-group__item';
    btn.textContent = opt ? 'Yes' : 'No';
    btn.setAttribute('aria-pressed', String(value === opt));
    btn.addEventListener('click', () => onChange(opt));
    group.append(btn);
  }
  wrap.append(group);
  return wrap;
}

// A shared `maxCny` across all four rows means bar LENGTH is directly
// comparable row to row, not just the internal paid/conditional split within
// one bar.
function payBar(pay, colorKey, maxCny) {
  const track = document.createElement('div');
  track.className = 'pay-bar__track';

  const wrap = document.createElement('div');
  wrap.className = 'pay-bar';
  const color = colorFor(colorKey);
  const paidCny = pay.monthlyPaid.cny;
  const condCny = pay.monthlyConditional?.cny ?? 0;
  const widthPct = (Math.max(1, paidCny + condCny) / maxCny) * 100;
  wrap.style.width = `${Math.min(100, widthPct)}%`;

  const paidSeg = document.createElement('div');
  paidSeg.className = 'pay-bar__segment pay-bar__segment--paid';
  paidSeg.style.background = color;
  paidSeg.style.flexGrow = String(paidCny);
  wrap.append(paidSeg);

  if (pay.hasConditional) {
    const condSeg = document.createElement('div');
    condSeg.style.flexGrow = String(condCny || 1);
    if (pay.conditionMet) {
      // Conditional pay that is earned (rebate after the threshold, deferred
      // pay still employed on the 25th): solid, lighter than the base pay.
      condSeg.className = 'pay-bar__segment pay-bar__segment--earned';
      condSeg.style.background = color;
    } else {
      condSeg.className = 'pay-bar__segment pay-bar__segment--forfeited';
    }
    wrap.append(condSeg);
  }

  track.append(wrap);
  return track;
}

// Step-by-step working for a row's monthly figure, shown on hovering its bar.
// Intermediate steps are in RMB (the source's unit); the result is USD (RMB).
const hrs = (h) => `${format(h)} h`;
const format = (v) => (Number.isInteger(v) ? count(v) : count(Math.round(v * 10) / 10));
const yuan = (v, digits = 0) => `¥${digits ? v.toFixed(digits) : count(Math.round(v))}`;

function otSteps(worker, hours) {
  const rate = baseHourlyRate(worker);
  const { regular, otWeekday, otRestDay } = splitHours(hours);
  const { weekday, rest_day } = worker.ot_multipliers;
  const parts = [`${hrs(regular)} × ${yuan(rate, 2)}`];
  if (otWeekday) parts.push(`${hrs(otWeekday)} × ${yuan(rate, 2)} × ${weekday}`);
  if (otRestDay) parts.push(`${hrs(otRestDay)} × ${yuan(rate, 2)} × ${rest_day}`);
  const weekly = regular * rate + otWeekday * rate * weekday + otRestDay * rate * rest_day;
  return { line: `${parts.join(' + ')} = ${yuan(weekly)}/week`, weekly };
}

function payFormula(key, worker, pay, data) {
  const wpm = data.weeks_per_month;
  const lines = [];
  if (key === 'hourly_dispatch') {
    const monthHours = pay.hours * wpm;
    lines.push(`${hrs(pay.hours)}/week × ${wpm} = ${hrs(monthHours)}/month${pay.atMinimum ? ` (minimum ${hrs(worker.min_hours_per_week)}/week)` : ''}`);
    lines.push(`${hrs(monthHours)} × ${yuan(worker.rate_paid_monthly.cny)} = ${yuan(pay.monthlyPaid.cny)} paid`);
    lines.push(`+ ${hrs(monthHours)} × ${yuan(worker.conditional.rate.cny)} = ${yuan(pay.monthlyConditional.cny)} deferred${pay.conditionMet ? '' : ' (forfeited)'}`);
  } else {
    const { line, weekly } = otSteps(worker, pay.hours);
    lines.push(line);
    lines.push(`${yuan(weekly)}/week × ${wpm} = ${yuan(pay.monthlyPaid.cny)}/month`);
    if (key === 'rebate_dispatch') {
      const c = worker.conditional;
      lines.push(
        pay.conditionMet
          ? `+ ${yuan(c.amount.cny)} rebate ÷ (${count(Math.round(pay.rebateMonths * c.days_per_month))} days ÷ ${c.days_per_month}) = ${yuan(pay.monthlyConditional.cny)}/month`
          : `+ ${yuan(0)} rebate: paid only after ${c.threshold_days} days`
      );
    }
  }
  const card = document.createElement('div');
  const title = document.createElement('p');
  title.className = 'tooltip__title';
  title.textContent = worker.label;
  card.append(title);
  for (const l of lines) {
    const p = document.createElement('p');
    p.className = 'tooltip__calc';
    p.textContent = l;
    card.append(p);
  }
  const total = document.createElement('p');
  total.className = 'tooltip__calc tooltip__calc--total';
  total.textContent = `= ${money(pay.monthlyTotal)} / month`;
  card.append(total);
  return card;
}

export default {
  id: 3,
  navLabel: 'How work is paid',
  colorKey: 'hourly-dispatch',

  mount(container, data) {
    const ft = data.workers.full_time;
    const hd = data.workers.hourly_dispatch;
    const rebate = data.workers.rebate_dispatch.conditional;
    const { el, body } = createScene({
      index: 3,
      title: 'How work is paid',
      summary: `Four worker types with four different pay structures. An assembly line worker usually works ${data.defaults.hours_per_week} hours a week. Full-time workers get overtime pay (${ft.ot_multipliers.weekday}× on weekdays, ${ft.ot_multipliers.rest_day}× on rest days), while hourly-type dispatch workers have to work at least ${hd.min_hours_per_week} hours a week at one flat rate, with overtime built in.`,
    });

    const state = {
      hoursPerWeek: data.defaults.hours_per_week,
      daysEmployed: data.defaults.days_employed,
      employedOn25th: data.defaults.employed_on_25th,
    };

    const controlsSlot = document.createElement('div');
    controlsSlot.className = 'pay-controls';
    const rowsSlot = document.createElement('div');
    rowsSlot.className = 'pay-rows';
    // The rows are re-rendered on every input, so the hover card lives beside them.
    const rowsWrap = document.createElement('div');
    rowsWrap.className = 'pay-rows-wrap';
    rowsWrap.append(rowsSlot);
    body.append(controlsSlot, rowsWrap);
    const tooltip = createTooltip(rowsWrap);

    function renderControls() {
      const hoursCard = sliderControl({
        index: '01',
        title: 'Work hours',
        value: state.hoursPerWeek,
        unitLabel: 'hours / week',
        min: data.ranges.hours_per_week[0],
        max: data.ranges.hours_per_week[1],
        minLabel: `${data.ranges.hours_per_week[0]} h`,
        maxLabel: `${data.ranges.hours_per_week[1]} h`,
        accentColor: colorFor('regular'),
        onInput: (v) => {
          state.hoursPerWeek = v;
          renderRows();
        },
      });

      const durationCard = sliderControl({
        index: '02',
        title: 'Work duration',
        value: state.daysEmployed,
        unitLabel: 'days employed',
        min: data.ranges.days_employed[0],
        max: data.ranges.days_employed[1],
        minLabel: `${data.ranges.days_employed[0]} days`,
        maxLabel: `${data.ranges.days_employed[1]} days`,
        accentColor: colorFor('dispatch'),
        onInput: (v) => {
          state.daysEmployed = v;
          renderRows();
        },
      });

      controlsSlot.replaceChildren(hoursCard, durationCard);
    }

    function renderRows() {
      tooltip.hide();
      const pays = WORKER_ORDER.map((key) => computePay(key, data.workers[key], state, data));
      // Scaled to each row's full potential (conditional pay included, earned
      // or not), so the 25th toggle only changes the hourly-type row.
      const maxCny = Math.max(...pays.map((p) => p.monthlyPaid.cny + (p.monthlyConditional?.cny ?? 0)));

      const rows = WORKER_ORDER.map((key, i) => {
        const worker = data.workers[key];
        const pay = pays[i];
        const color = colorFor(worker.color_key);

        const row = document.createElement('div');
        row.className = 'pay-row';

        const label = document.createElement('div');
        label.className = 'pay-row__label';
        const dot = document.createElement('span');
        dot.className = 'pay-row__dot';
        dot.style.background = color;
        dot.dataset.kind = worker.color_key; // the 3 → 4 transition lands each color's cluster here
        const name = document.createElement('span');
        name.className = 'pay-row__name';
        name.textContent = worker.label;
        label.append(dot, name);
        const contract = document.createElement('p');
        contract.className = 'pay-row__contract';
        contract.textContent = worker.contract;
        label.append(contract);
        const benefits = document.createElement('p');
        benefits.className = 'pay-row__benefits';
        benefits.textContent = worker.benefits.join(' · ');
        label.append(benefits);

        const main = document.createElement('div');
        main.className = 'pay-row__main';

        const numbers = document.createElement('div');
        numbers.className = 'pay-row__numbers';

        const hourlyBlock = document.createElement('div');
        hourlyBlock.className = 'pay-figure';
        const hourlyValue = document.createElement('p');
        hourlyValue.className = 'pay-figure__value';
        hourlyValue.textContent = `${money(pay.hourlyTotal)} / hour`;
        hourlyBlock.append(hourlyValue);

        const monthlyBlock = document.createElement('div');
        monthlyBlock.className = 'pay-figure';
        const monthlyValue = document.createElement('p');
        monthlyValue.className = 'pay-figure__value';
        monthlyValue.textContent = `${money(pay.monthlyTotal)} / month`;
        monthlyBlock.append(monthlyValue);
        if (pay.atMinimum) {
          const minNote = document.createElement('p');
          minNote.className = 'pay-figure__note pay-figure__note--min';
          minNote.textContent = `minimum ${worker.min_hours_per_week} h for hourly-type`;
          monthlyBlock.append(minNote);
        }

        // The condition note sits under the monthly figure it affects. For
        // hourly-type the paid / deferred split sits under the hourly figure on
        // the same line, and its note keeps one wording whatever the 25th
        // answer (the hatched segment shows a forfeit).
        if (pay.hourlyConditional) {
          const split = document.createElement('p');
          split.className = 'pay-figure__note';
          split.textContent = `${money(pay.hourlyPaid)} paid + ${money(pay.hourlyConditional)} deferred`;
          hourlyBlock.append(split);
        }
        if (pay.hasConditional) {
          const condNote = document.createElement('p');
          condNote.className = 'pay-figure__note';
          condNote.textContent = pay.conditionMet || pay.hourlyConditional ? pay.conditionLabel : pay.failNote;
          monthlyBlock.append(condNote);
        }
        numbers.append(hourlyBlock, monthlyBlock);
        const bar = payBar(pay, worker.color_key, maxCny);
        bar.tabIndex = 0;
        bar.setAttribute('aria-label', `${worker.label}: ${money(pay.monthlyTotal)} per month. Focus or hover for the calculation.`);
        const card = () => payFormula(key, worker, pay, data);
        bar.addEventListener('pointerenter', (e) => tooltip.showBeside(card(), e));
        bar.addEventListener('pointermove', (e) => tooltip.showBeside(card(), e));
        bar.addEventListener('pointerleave', () => tooltip.hide());
        bar.addEventListener('focus', () => {
          const r = bar.getBoundingClientRect();
          const b = rowsWrap.getBoundingClientRect();
          tooltip.show(card(), { x: r.left - b.left + r.width / 2, y: r.top - b.top });
        });
        bar.addEventListener('blur', () => tooltip.hide());
        main.append(numbers, bar);
        // The 25th question only matters to hourly-type dispatch, so it sits in that row.
        if (key === 'hourly_dispatch') {
          main.append(
            toggleControl({
              label: "Still employed on the payout month's 25th?",
              value: state.employedOn25th,
              compact: true,
              onChange: (v) => {
                state.employedOn25th = v;
                renderRows();
              },
            })
          );
        }

        row.append(label, main);
        return row;
      });

      rowsSlot.replaceChildren(...rows);
    }

    renderControls();
    renderRows();

    const fxNote = document.createElement('p');
    fxNote.className = 'pay-fx-note';
    fxNote.textContent = `Current exchange rate: ¥${data.fx_cny_per_usd} = $1`;
    body.append(fxNote);

    const defaultHourlyPay = computePay(
      'hourly_dispatch',
      data.workers.hourly_dispatch,
      { hoursPerWeek: data.defaults.hours_per_week, daysEmployed: data.defaults.days_employed, employedOn25th: data.defaults.employed_on_25th },
      data
    );
    addMethodNote(el, 'How pay is calculated', [
      data.hours_rule,
      `Monthly figures use ${data.weeks_per_month} weeks/month (hours/week × ${data.weeks_per_month}). The one worked example in the source tables (hourly-type dispatch at the default 60h/week) comes to $970 (¥6,500)/month using a slightly different rounding of that conversion; this calculator uses the ${data.weeks_per_month} figure consistently across the whole slider range, which puts the default at ${money(defaultHourlyPay.monthlyTotal)}/month — within about half a percent.`,
      `Benefits and contract text per worker type are in each row's label; the days-employed slider only changes rebate-type dispatch's payout: nothing before day ${rebate.threshold_days}, then the ${money(data.workers.rebate_dispatch.conditional.amount)} rebate averaged over the months worked (days employed ÷ ${rebate.days_per_month}) — the other three types' pay depends only on hours worked. Hourly-type dispatch is paid for at least ${hd.min_hours_per_week} hours a week. Hover a bar for its calculation.`,
    ]);

    addCaveat(el, data.caveat);
    container.replaceChildren(el);
  },
};
