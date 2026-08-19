/**
 * loyalty-history-parser.ts — Parse le HTML de GET /fidelite/ma-carte/historique?id=NNN
 * Même approche que loyalty-parser.ts : regex sur le HTML brut, pas de cheerio/jsdom.
 */

import type { LoyaltyTransaction } from '../types.js';
import { decode, parsePrice } from './html-utils.js';

export type { LoyaltyTransaction };

/**
 * Parse la page HTML de l'historique de cagnotte et retourne les transactions.
 *
 * Structure HTML attendue (blocs `m-waaohHistory`, groupés par mois) :
 * ```html
 * <div class="a-waaohHistoryMonth" role="heading">July</div>
 * <div role="list">
 *   <div class="m-waaohHistory" role="listitem">
 *     <div class="m-waaohHistory__date">16/07/2026</div>
 *     <div class="m-waaohHistory__deliveryType">Drive</div>
 *     <div class="m-waaohHistory__deliveryPlace">Auchan DRIVE</div>
 *     <div class="m-waaohHistory__amount -minus">-5.64</div>
 *   </div>
 * </div>
 * ```
 * Les montants sont signés avec un point décimal ("+0.68", "-5.64").
 */
export function parseLoyaltyHistoryPage(html: string): LoyaltyTransaction[] {
  const transactions: LoyaltyTransaction[] = [];

  const blockPattern =
    /class="m-waaohHistory"[^>]*>[\s\S]*?m-waaohHistory__date[^>]*>([^<]*)<[\s\S]*?m-waaohHistory__deliveryType[^>]*>([^<]*)<[\s\S]*?m-waaohHistory__deliveryPlace[^>]*>([^<]*)<[\s\S]*?m-waaohHistory__amount[^"]*"[^>]*>([^<]*)</g;

  let m: RegExpExecArray | null;
  while ((m = blockPattern.exec(html)) !== null) {
    const date = decode(m[1]).trim();
    const channel = decode(m[2]).trim();
    const storeName = decode(m[3]).trim();
    const rawAmount = decode(m[4]).trim();

    // Valider le format de date DD/MM/YYYY
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) continue;

    // Parser le montant signé (ex. "+0.68", "-5.64", "+0,53 €")
    const isNegative = rawAmount.startsWith('-');
    const numPart = rawAmount
      .replace(/^[+-]/, '')
      .replace(/\s*€\s*$/, '')
      .replace(/[\s\u00A0]/g, '');

    // parsePrice ne gère que les montants avec 2 décimales : ignorer la ligne sinon.
    if (!/^\d+[,.]\d{2}$/.test(numPart)) continue;

    const absCents = parsePrice(numPart);
    const amountCents = isNegative ? -absCents : absCents;

    // Reconstruire le montant formaté normalisé avec signe, 2 décimales et €
    const sign = isNegative ? '-' : '+';
    const euros = Math.floor(absCents / 100);
    const cents = String(absCents % 100).padStart(2, '0');
    const amountFormatted = `${sign}${euros},${cents} €`;
    transactions.push({ date, channel, storeName, amountCents, amountFormatted });
  }

  return transactions;
}
