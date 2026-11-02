import { CUSTOMER_MIX, customerMixKey } from '../assets/placeholders';
import type { Customer, GameSession } from '../systems/GameSession';

/**
 * Which picture a customer gets: regulars keep their own (you know them when
 * they come back); everyone else gets one of the mixed looks, steady for that
 * customer (the same in the lobby and at the order window).
 */
export function customerLook(s: GameSession, cust: Customer): string {
  if (s.regularOf(cust)) return s.typeOf(cust).sprite;
  const h = Math.imul(cust.id ^ 0x5bd1e995, 0x27d4eb2d) >>> 0;
  return customerMixKey(h % CUSTOMER_MIX);
}
