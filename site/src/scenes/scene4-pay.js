import { createScene, addCaveat, addMethodNote } from '../lib/sceneShell.js';
import { colorFor } from '../lib/colorTokens.js';
import { count, money } from '../lib/format.js';
import { computePay } from '../lib/payModel.js';

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
  card.append(subEl);

  const setValue = (v) => {
    const clamped = Math.min(max, Math.max(min, v));
    input.value = String(clamped);
    input.style.setProperty('--pct', String(((clamped - min) / (max - min)) * 100));
    valueEl.textContent = count(clamped);
    subEl.textContent = sub(clamped);
    onInput(clamped);
  };

  minus.addEventListener('click', () => setValue(Number(input.value) - 1));
  plus.addEventListener('click', () => setValue(Number(input.value) + 1));
  input.addEventListener('input', () => setValue(Number(input.value)));

  valueEl.textContent = count(value);
  subEl.textContent = sub(value);
  input.style.setProperty('--pct', String(((value - min) / (max - min)) * 100));
  return card;
}

function toggleControl({ label, value, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'control-row';

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
      condSeg.className = 'pay-bar__segment pay-bar__segment--conditional';
      condSeg.style.borderColor = color;
    } else {
      condSeg.className = 'pay-bar__segment pay-bar__segment--forfeited';
    }
    wrap.append(condSeg);
  }

  track.append(wrap);
  return track;
}

export default {
  id: 4,
  navLabel: 'How work is paid',
  colorKey: 'hourly-dispatch',

  mount(container, data) {
    const { el, body } = createScene({
      index: 4,
      title: 'How work is paid',
      summary:
        'Four worker types, four pay structures, side by side. Set the hours worked, the days employed, and whether an hourly-dispatch worker is still there on the 25th — the deferred half of their pay depends on it.',
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
    body.append(controlsSlot, rowsSlot);

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
        sub: (v) => `≈ ${count(Math.round(v * data.weeks_per_month))} hours / month`,
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
        sub: () => '',
        onInput: (v) => {
          state.daysEmployed = v;
          renderRows();
        },
      });

      const toggle = toggleControl({
        label: "Still employed on the payout month's 25th? (applies to hourly-type dispatch)",
        value: state.employedOn25th,
        onChange: (v) => {
          state.employedOn25th = v;
          renderRows();
        },
      });
      durationCard.append(toggle);

      controlsSlot.replaceChildren(hoursCard, durationCard);
    }

    function renderRows() {
      const pays = WORKER_ORDER.map((key) => computePay(key, data.workers[key], state, data));
      const maxCny = Math.max(...pays.map((p) => p.monthlyTotal.cny));

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
        if (pay.hourlyConditional) {
          const hourlyBreak = document.createElement('p');
          hourlyBreak.className = 'pay-figure__note';
          hourlyBreak.textContent = `${money(pay.hourlyPaid)} paid + ${money(pay.hourlyConditional)} conditional`;
          hourlyBlock.append(hourlyBreak);
        }

        const monthlyBlock = document.createElement('div');
        monthlyBlock.className = 'pay-figure';
        const monthlyValue = document.createElement('p');
        monthlyValue.className = 'pay-figure__value';
        monthlyValue.textContent = `${money(pay.monthlyTotal)} / month`;
        const monthlyNote = document.createElement('p');
        monthlyNote.className = 'pay-figure__note';
        monthlyNote.textContent = pay.hasConditional
          ? 'before deductions · includes conditional if earned'
          : pay.deduction
          ? `before the ${money(pay.deduction)} deduction`
          : 'before deductions';
        monthlyBlock.append(monthlyValue, monthlyNote);

        numbers.append(hourlyBlock, monthlyBlock);
        main.append(numbers, payBar(pay, worker.color_key, maxCny));

        if (pay.hasConditional) {
          const condNote = document.createElement('p');
          condNote.className = 'pay-row__condition';
          condNote.textContent = pay.conditionMet ? pay.conditionLabel : pay.failNote;
          main.append(condNote);
          if (key === 'rebate_dispatch') {
            const range = document.createElement('p');
            range.className = 'pay-row__condition';
            range.textContent = `Range ${money(pay.rebateRange[0])}–${money(pay.rebateRange[1])}; default ${money(pay.rebateFull)} shown divided across the 3-month spread.`;
            main.append(range);
          }
        }
        if (pay.deduction) {
          const dedNote = document.createElement('p');
          dedNote.className = 'pay-row__condition';
          dedNote.textContent = `${money(pay.deduction)}/month deducted — ${worker.deduction_label}.`;
          main.append(dedNote);
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
    fxNote.textContent = `FX: ¥${data.fx_cny_per_usd} = $1, used throughout. Bar length is comparable across rows — it's each worker type's monthly total relative to the highest of the four.`;
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
      "Benefits and contract text per worker type are in each row's label; the days-employed slider only changes rebate-type dispatch's payout (its 90-day threshold) — the other three types' pay depends only on hours worked.",
    ]);

    addCaveat(el, data.caveat);
    container.replaceChildren(el);
  },
};
