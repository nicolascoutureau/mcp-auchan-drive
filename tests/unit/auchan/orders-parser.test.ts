import { describe, it, expect } from 'vitest';
import { parseOrdersPage } from '../../../src/auchan/orders-parser.js';

/** Construit une carte commande reproduisant le markup réel de /client/mes-commandes. */
function orderCard(opts: {
  ref: string;
  number: string;
  date: string;
  place?: string;
  status: string;
  count?: number;
  total?: string;
}): string {
  return `
  <li class="t-orders__item" data-fetch="/customer/async/orders/details/${opts.ref}/${opts.number}/false" data-renderer="customer-renderer">
    <div class="p-order">
      <div class="p-order__header">
        <div class="p-order__pointOfServiceAndReference">
          <div class="a-pointOfService">
            <i aria-hidden="true" class="a-pointOfService__icon icon-delivery"></i>
            <div class="a-pointOfService__infos">
              <span class="a-pointOfService__label">Retrait</span>
              <span class="a-pointOfService__place">${opts.place ?? ''}</span>
            </div>
          </div>
          <div class="p-order__reference">Commande n&#xB0; ${opts.number} du ${opts.date}</div>
        </div>
        <div class="a-simplifiedState a-simplifiedState--light-grey"><span class="a-simplifiedState__label">${opts.status}</span></div>
      </div>
      <div class="p-order__footer">
        <div class="p-order__footerLeft">
          <div class="p-order__thumbnailsAndTotalAmount">
            <div class="m-productThumbnails">
              <div class="m-productThumbnails__images"></div>
              <div class="m-productThumbnails__count"><span>${opts.count ?? 0}</span> Produits</div>
            </div>
            <div class="p-order__totalAmount">${opts.total ?? '0.00'} &#x20AC;</div>
          </div>
        </div>
        <div class="p-order__footerRight">
          <a href="/client/mes-commandes/${opts.ref}/${opts.number}" class="btn btn--white btn--small">Voir le d&#xE9;tail</a>
        </div>
      </div>
    </div>
  </li>`;
}

// HTML reproduisant la structure réelle de /client/mes-commandes (cartes p-order)
const THREE_ORDERS_HTML = `
<html><body>
<ul class="t-orders__wrapper t-orders__wrapper__list">
${orderCard({ ref: 'AROM-761999631', number: '370069704', date: '14 juin 2026', place: 'Auchan Drive Caluire', status: 'Enregistr&#xE9;e', count: 14, total: '38.62' })}
${orderCard({ ref: 'AROM-123456789', number: '370000001', date: '2 mai 2026', place: 'Auchan Drive Lyon Nord', status: 'Retir&#xE9;e', count: 7, total: '21.50' })}
${orderCard({ ref: 'AROM-987654321', number: '369000002', date: '10 avril 2026', place: 'Auchan Drive Caluire', status: 'Annul&#xE9;e', count: 3, total: '9.99' })}
</ul>
</body></html>
`;

// Carte telle que réellement servie : place vide, compteur et total à zéro
// (ces champs sont lazy-loadés côté client via l'endpoint data-fetch)
const PLACEHOLDER_ORDER_HTML = `
<html><body>
<ul class="t-orders__wrapper t-orders__wrapper__list">
${orderCard({ ref: 'AROM-763541356', number: '371625185', date: '16 July 2026', status: 'Retir&#xE9;e' })}
</ul>
</body></html>
`;

// HTML sans aucune commande (liste vide)
const EMPTY_HTML = `<html><body><ul class="t-orders__wrapper"></ul></body></html>`;

describe('parseOrdersPage', () => {
  // ── Liste de 3 commandes ────────────────────────────────────────────────────

  it('retourne 3 commandes depuis le HTML avec 3 entrées', () => {
    const orders = parseOrdersPage(THREE_ORDERS_HTML);
    expect(orders).toHaveLength(3);
  });

  it('extrait orderRef correctement', () => {
    const orders = parseOrdersPage(THREE_ORDERS_HTML);
    expect(orders[0].orderRef).toBe('AROM-761999631');
    expect(orders[1].orderRef).toBe('AROM-123456789');
    expect(orders[2].orderRef).toBe('AROM-987654321');
  });

  it('extrait orderNumber correctement', () => {
    const orders = parseOrdersPage(THREE_ORDERS_HTML);
    expect(orders[0].orderNumber).toBe('370069704');
    expect(orders[1].orderNumber).toBe('370000001');
    expect(orders[2].orderNumber).toBe('369000002');
  });

  it('extrait la date correctement', () => {
    const orders = parseOrdersPage(THREE_ORDERS_HTML);
    expect(orders[0].date).toBe('14 juin 2026');
    expect(orders[1].date).toBe('2 mai 2026');
    expect(orders[2].date).toBe('10 avril 2026');
  });

  it('extrait le nom du magasin', () => {
    const orders = parseOrdersPage(THREE_ORDERS_HTML);
    expect(orders[0].storeName).toBe('Auchan Drive Caluire');
    expect(orders[1].storeName).toBe('Auchan Drive Lyon Nord');
  });

  it('extrait le statut (entités HTML décodées)', () => {
    const orders = parseOrdersPage(THREE_ORDERS_HTML);
    expect(orders[0].status).toBe('Enregistrée');
    expect(orders[1].status).toBe('Retirée');
    expect(orders[2].status).toBe('Annulée');
  });

  it('extrait le nombre de produits', () => {
    const orders = parseOrdersPage(THREE_ORDERS_HTML);
    expect(orders[0].productCount).toBe(14);
    expect(orders[1].productCount).toBe(7);
    expect(orders[2].productCount).toBe(3);
  });

  it('extrait le total en centimes', () => {
    const orders = parseOrdersPage(THREE_ORDERS_HTML);
    expect(orders[0].total).toBe(3862);
    expect(orders[1].total).toBe(2150);
    expect(orders[2].total).toBe(999);
  });

  it('normalise le total formaté en virgule + €', () => {
    const orders = parseOrdersPage(THREE_ORDERS_HTML);
    expect(orders[0].totalFormatted).toBe('38,62 €');
    expect(orders[1].totalFormatted).toBe('21,50 €');
    expect(orders[2].totalFormatted).toBe('9,99 €');
  });

  it('extrait l\'URL de détail', () => {
    const orders = parseOrdersPage(THREE_ORDERS_HTML);
    expect(orders[0].detailUrl).toBe('/client/mes-commandes/AROM-761999631/370069704');
    expect(orders[1].detailUrl).toBe('/client/mes-commandes/AROM-123456789/370000001');
  });

  // ── Carte avec placeholders (données lazy-loadées côté client) ──────────────

  it('parse une carte aux champs lazy-loadés (place vide, compteur/total à zéro)', () => {
    const orders = parseOrdersPage(PLACEHOLDER_ORDER_HTML);
    expect(orders).toHaveLength(1);
    expect(orders[0].orderRef).toBe('AROM-763541356');
    expect(orders[0].orderNumber).toBe('371625185');
    expect(orders[0].date).toBe('16 July 2026');
    expect(orders[0].storeName).toBe('');
    expect(orders[0].status).toBe('Retirée');
    expect(orders[0].productCount).toBe(0);
    expect(orders[0].total).toBe(0);
    expect(orders[0].totalFormatted).toBe('0,00 €');
  });

  // ── Edge case : liste vide ──────────────────────────────────────────────────

  it('retourne [] pour une page sans commande', () => {
    const orders = parseOrdersPage(EMPTY_HTML);
    expect(orders).toEqual([]);
  });

  it('retourne [] pour un HTML vide', () => {
    const orders = parseOrdersPage('<html></html>');
    expect(orders).toEqual([]);
  });
});
