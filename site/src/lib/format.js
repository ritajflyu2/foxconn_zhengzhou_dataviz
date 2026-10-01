import { format } from 'd3';

const usd = format(',.2f');
const whole = format(',');

export const count = whole;
export const percent = format('.0%');

// Display rule: USD first, RMB in parentheses. Never RMB alone.
export function money({ usd: usdValue, cny }) {
  const rmb = Number.isInteger(cny) ? whole(cny) : usd(cny);
  return `$${usd(usdValue)} (¥${rmb})`;
}
