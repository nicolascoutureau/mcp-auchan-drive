/**
 * orders-parser.ts — Parse le HTML de GET /client/mes-commandes
 * Même approche que loyalty-parser.ts : regex sur le HTML brut, pas de cheerio/jsdom.
 */

import type { Order } from '../types.js';
import { decode, parsePrice } from './html-utils.js';

export type { Order };

/**
 * Parse la page HTML de l'historique des commandes et retourne la liste des commandes.
 *
 * Structure HTML attendue (cartes `p-order`) :
 * ```html
 * <li class="t-orders__item" data-fetch="/customer/async/orders/details/AROM-.../371625185/false">
 *   <div class="p-order">
 *     <span class="a-pointOfService__label">Retrait</span>
 *     <span class="a-pointOfService__place">Auchan Drive Caluire</span>
 *     <div class="p-order__reference">Commande n&#xB0; 371625185 du 16 July 2026</div>
 *     <span class="a-simplifiedState__label">Retir&#xE9;e</span>
 *     <div class="m-productThumbnails__count"><span>14</span> Produits</div>
 *     <div class="p-order__totalAmount">38.62 &#x20AC;</div>
 *     <a href="/client/mes-commandes/AROM-.../371625185">Voir le d&#xE9;tail</a>
 *   </div>
 * </li>
 * ```
 *
 * Attention : le nom du drive, le nombre de produits et le total sont injectés
 * côté client via l'endpoint `data-fetch` — dans le HTML statique ils peuvent
 * être vides ou à zéro. Utiliser get_order_detail pour des valeurs fiables.
 */
export function parseOrdersPage(html: string): Order[] {
  const orders: Order[] = [];

  const liPattern = /<li[^>]*class="[^"]*t-orders__item[^"]*"[^>]*>([\s\S]*?)<\/li>/g;

  let liMatch: RegExpExecArray | null;
  while ((liMatch = liPattern.exec(html)) !== null) {
    const block = decode(liMatch[1]);

    const hrefM = block.match(/href="(\/client\/mes-commandes\/([^/"]+)\/(\d+))"/);
    if (!hrefM) continue;

    const detailUrl = hrefM[1];
    const orderRef = hrefM[2];
    const orderNumber = hrefM[3];

    // "Commande n° 371625185 du 16 July 2026" → date brute telle que servie
    const refM = block.match(/p-order__reference[^>]*>\s*Commande n°\s*\d+\s+du\s+([^<]+)</);
    const date = refM?.[1]?.trim() ?? '';

    const storeM = block.match(/a-pointOfService__place[^>]*>([^<]*)</);
    const storeName = storeM?.[1]?.trim() ?? '';

    const statusM = block.match(/a-simplifiedState__label[^>]*>([^<]*)</);
    const status = statusM?.[1]?.trim() ?? '';

    const countM = block.match(/m-productThumbnails__count[^>]*>\s*<span[^>]*>(\d+)<\/span>/);
    const productCount = countM ? parseInt(countM[1], 10) : 0;

    // Le total est servi avec un point décimal ("38.62 €") — normalisé en "38,62 €"
    const totalM = block.match(/p-order__totalAmount[^>]*>([^<]*)</);
    const total = totalM ? parsePrice(totalM[1]) : 0;
    const totalFormatted = `${Math.floor(total / 100)},${String(total % 100).padStart(2, '0')} €`;

    orders.push({
      orderRef,
      orderNumber,
      date,
      storeName,
      status,
      productCount,
      total,
      totalFormatted,
      detailUrl,
    });
  }

  return orders;
}
