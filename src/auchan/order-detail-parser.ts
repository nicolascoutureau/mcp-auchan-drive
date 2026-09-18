/**
 * order-detail-parser.ts — Parse le HTML de GET /client/mes-commandes/{ref}/{num}
 * Même approche que les autres parsers : regex sur le HTML brut.
 */

import type { OrderDetail, OrderProduct } from '../types.js';
import { parsePrice, decode } from './html-utils.js';
import {
  splitArticles,
  extractProductLink,
  extractFullName,
  extractBrand,
  stripBrandPrefix,
  extractPrices,
  extractQuantity,
  extractHeadings,
  categoryFor,
} from './article-utils.js';

/**
 * Parse la page HTML de détail d'une commande.
 *
 * Structure HTML attendue :
 * ```html
 * <!-- Tracker de statut -->
 * <li class="o-orderStatus__step o-orderStatus__step--active"><span>En cours de préparation</span></li>
 *
 * <!-- Créneau de retrait -->
 * <p>Retrait prévu le: mardi 16 juin entre 17h00 et 17h30</p>
 *
 * <!-- Magasin -->
 * <div class="m-storeInfo">
 *   <p class="m-storeInfo__name">Auchan Drive Caluire</p>
 *   <p class="m-storeInfo__address">10 Chemin Jean Petit 69300 CALUIRE-ET-CUIRE</p>
 * </div>
 *
 * <!-- Total -->
 * <span class="m-orderSummary__totalPrice">38,62 €</span>
 *
 * <!-- Produits par catégorie -->
 * <h2 class="m-orderProductList__categoryTitle">Boucherie, volaille, poissonnerie</h2>
 * <div class="m-orderProduct">
 *   <p class="m-orderProduct__name"><strong>AUCHAN</strong> Chipolatas supérieures aux herbes</p>
 *   <span class="m-orderProduct__quantity">Quantité : 6</span>
 *   <span class="m-orderProduct__price">8,34 €</span>
 * </div>
 * ```
 */
export function parseOrderDetailPage(
  html: string,
  orderRef: string,
  orderNumber: string,
): OrderDetail {
  // ── Statut courant (étape active du tracker) ─────────────────────────────────
  // L'étape active porte une classe contenant "active" ou "current", ou un aria-current.
  const statusActiveM = html.match(
    /o-orderStatus__step[^"]*(?:active|current)[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)/i,
  ) ?? html.match(/aria-current="[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)/i);

  // Fallback : prendre le dernier span dans la liste de statuts non vide
  // Markup courant : <span class="a-simplifiedState__label">Retirée</span>
  const simplifiedM = html.match(/a-simplifiedState__label[^>]*>([^<]+)/);

  const status = simplifiedM
    ? decode(simplifiedM[1].trim())
    : statusActiveM
      ? decode(statusActiveM[1].trim())
      : extractLastStatus(html);

  // ── Créneau de retrait ───────────────────────────────────────────────────────
  // Sur du HTML brut le libellé s'écrit "Retrait pr&#xE9;vu le:" : il faut
  // décoder avant de matcher, sinon [eé] ne trouve jamais l'accent.
  const pickupM = decode(html).match(/Retrait pr[eé]vu\s+le\s*:\s*([^\n<]+)/i);
  const pickupSlot = pickupM ? decode(pickupM[1].trim()) : undefined;

  // ── Magasin : nom ────────────────────────────────────────────────────────────
  const storeNameM = html.match(/m-storeInfo__name[^>]*>([^<]+)/)
    ?? html.match(/class="[^"]*storeName[^"]*"[^>]*>([^<]+)/)
    // Markup courant : <span class="a-pointOfService__place">Auchan Drive …</span>
    ?? html.match(/a-pointOfService__place[^>]*>([^<]+)/)
    // Fallback : lien vers la fiche magasin "/magasins/s-NNN"
    ?? html.match(/href="\/magasins\/s-\d+"[^>]*>\s*([^<]{3,80})/);
  const storeName = storeNameM ? decode(storeNameM[1].trim()) : '';

  // ── Magasin : adresse ────────────────────────────────────────────────────────
  const storeAddrM = html.match(/m-storeInfo__address[^>]*>([\s\S]*?)<\/p>/)
    ?? html.match(/class="[^"]*storeAddress[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/);
  const storeAddress = storeAddrM
    ? decode(storeAddrM[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
    : '';

  // ── Total ─────────────────────────────────────────────────────────────────────
  const totalM =
    // Markup courant : bloc récapitulatif "Total" en pied de page
    html.match(/m-receipt__total[\s\S]{0,200}?m-receipt__value[^>]*>([^<]+)/)
    ?? html.match(/p-detail__totalAmount[\s\S]{0,200}?a-amount[^>]*>([^<]+)/)
    ?? html.match(/m-orderSummary__totalPrice[^>]*>([^<]+)/)
    ?? html.match(/orderTotal[^>]*>([^<]+)/)
    // Fallback : "Total" suivi du montant, quelles que soient les classes
    ?? html.match(/>\s*Total\s*<[\s\S]{0,400}?(\d{1,4}[.,]\d{2}\s*€)/i);
  const totalFormatted = totalM ? decode(totalM[1].trim()) : '';
  const total = parsePrice(totalFormatted);

  // ── Produits par catégorie ────────────────────────────────────────────────────
  const products = parseProducts(html);

  return {
    orderNumber,
    orderRef,
    storeName,
    storeAddress,
    status,
    pickupSlot,
    total,
    totalFormatted,
    products,
  };
}

function extractLastStatus(html: string): string {
  const stepRe = /o-orderStatus__step[^>]*>[\s\S]*?<span[^>]*>([^<]+)/g;
  let last = '';
  let m: RegExpExecArray | null;
  while ((m = stepRe.exec(html)) !== null) {
    const t = decode(m[1].trim());
    if (t) last = t;
  }
  return last;
}

function parseProducts(html: string): OrderProduct[] {
  const products: OrderProduct[] = [];

  // Découper en sections par catégorie
  const catRe = /class="[^"]*m-orderProductList__categoryTitle[^"]*"[^>]*>([^<]+)/g;
  const catMatches: Array<{ index: number; category: string }> = [];
  let cM: RegExpExecArray | null;
  while ((cM = catRe.exec(html)) !== null) {
    catMatches.push({ index: cM.index, category: decode(cM[1].trim()) });
  }

  // Markup courant : chaque ligne de commande est un bloc "m-productItem"
  // portant l'article produit et son <aside> prix / quantité.
  const items = parseProductItems(html);
  if (items.length > 0) return items;

  if (catMatches.length === 0) {
    // Markup BEM historique, puis passe structurelle générique
    const legacy = parseProductBlocks(html, '');
    return legacy.length > 0 ? legacy : parseArticleProducts(html);
  }

  for (let i = 0; i < catMatches.length; i++) {
    const start = catMatches[i].index;
    const end = i + 1 < catMatches.length ? catMatches[i + 1].index : html.length;
    const section = html.slice(start, end);
    products.push(...parseProductBlocks(section, catMatches[i].category));
  }

  return products.length > 0 ? products : parseArticleProducts(html);
}

/**
 * Markup courant de /client/mes-commandes/{ref}/{num} :
 *
 *   <div class="o-products__line m-productItem">
 *     <article class="product-thumbnail m-productItem__product">
 *       <p class="product-thumbnail__description"><strong>PURINA ONE</strong> Bifensis…</p>
 *     </article>
 *     <aside class="m-productItem__aside">
 *       <div class="a-amount__amount">13.88 &#x20AC;</div>
 *       <div class="p-detail__productQuantity">Quantit&#xE9; : 3</div>
 *     </aside>
 *   </div>
 *
 * Le prix et la quantité vivent dans l'<aside>, frère de l'<article> : un
 * découpage borné à <article> les perdrait. On découpe donc sur m-productItem.
 *
 * Cette page ne groupe pas les produits par rayon : category reste vide.
 */
function parseProductItems(html: string): OrderProduct[] {
  const products: OrderProduct[] = [];

  const blockRe = /class="[^"]*m-productItem(?![\w-])[^"]*"/g;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    let tagStart = m.index;
    while (tagStart > 0 && html[tagStart] !== '<') tagStart--;
    starts.push(tagStart);
  }

  for (let i = 0; i < starts.length; i++) {
    const block = html.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : html.length);

    // L'aside n'est présent que sur le bloc de ligne, pas sur l'article interne :
    // on ignore les blocs qui n'en portent pas pour éviter les doublons.
    if (!block.includes('m-productItem__aside')) continue;

    const descM = block.match(
      /class="[^"]*product-thumbnail__description[^"]*"[^>]*>([\s\S]*?)<\/p>/,
    );
    const descHtml = descM?.[1] ?? '';
    const brandM = descHtml.match(/<strong[^>]*>\s*([^<]+)\s*<\/strong>/);
    const brand = brandM ? decode(brandM[1].trim()) : '';
    const nameRaw = descHtml.replace(/<strong[^>]*>[\s\S]*?<\/strong>/g, '');
    const name = decode(nameRaw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
    if (!name) continue;

    const priceM = block.match(/a-amount__amount[^>]*>([^<]+)/);
    const priceFormatted = priceM ? decode(priceM[1].trim()) : '';

    const qtyM = decode(block).match(/productQuantity[^>]*>\s*Quantit[eé]\s*:\s*(\d+)/i);

    products.push({
      name,
      brand,
      quantity: qtyM ? parseInt(qtyM[1], 10) : (extractQuantity(block) ?? 1),
      price: parsePrice(priceFormatted),
      priceFormatted,
      category: '',
    });
  }

  return products;
}

/**
 * Passe structurelle : chaque produit commandé est un <article> contenant
 * un lien "/pr-Cxxxxxx", un prix et "Quantité : N". Indépendant des classes CSS.
 */
function parseArticleProducts(html: string): OrderProduct[] {
  const products: OrderProduct[] = [];
  const headings = extractHeadings(html);

  for (const { start, html: block } of splitArticles(html)) {
    if (!extractProductLink(block)) continue;

    const fullName = extractFullName(block);
    if (!fullName) continue;

    const brand = extractBrand(block);
    const prices = extractPrices(block);
    const priceFormatted = prices[0] ?? '';

    products.push({
      name: stripBrandPrefix(fullName, brand) || fullName,
      brand,
      quantity: extractQuantity(block) ?? 1,
      price: parsePrice(priceFormatted),
      priceFormatted,
      category: categoryFor(headings, start),
    });
  }

  return products;
}

function parseProductBlocks(html: string, category: string): OrderProduct[] {
  const products: OrderProduct[] = [];

  // Sélectionne les éléments dont la classe contient le token "m-orderProduct"
  // (suivi de " ou espace, pas de "_"), ce qui exclut m-orderProduct__name, __quantity, etc.
  const blockRe = /class="[^"]*m-orderProduct(?=["\s])[^"]*"[^>]*>/g;
  const blockStarts: number[] = [];
  let bM: RegExpExecArray | null;
  while ((bM = blockRe.exec(html)) !== null) {
    blockStarts.push(bM.index);
  }

  for (let i = 0; i < blockStarts.length; i++) {
    const start = blockStarts[i];
    const end = i + 1 < blockStarts.length ? blockStarts[i + 1] : html.length;
    const block = html.slice(start, end);

    // Nom et marque
    const descM = block.match(
      /m-orderProduct__name[^>]*>([\s\S]*?)<\/p>/,
    );
    const descHtml = descM?.[1] ?? '';
    const brandM = descHtml.match(/<strong[^>]*>\s*([^<]+)\s*<\/strong>/);
    const brand = brandM ? decode(brandM[1].trim()) : '';
    const nameRaw = descHtml.replace(/<strong[^>]*>[\s\S]*?<\/strong>/g, '');
    const name = decode(nameRaw.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());

    if (!name) continue;

    // Quantité : "Quantité : 6" ou "x6" ou juste "6"
    const qtyM = block.match(/(?:Quantit[eé]\s*:\s*|[×x]\s*)(\d+)/i)
      ?? block.match(/m-orderProduct__quantity[^>]*>[^<]*?(\d+)/);
    const quantity = qtyM ? parseInt(qtyM[1], 10) : 1;

    // Prix
    const priceM = block.match(/m-orderProduct__price[^>]*>([^<]+)/);
    const priceFormatted = priceM ? decode(priceM[1].trim()) : '';
    const price = parsePrice(priceFormatted);

    products.push({ name, brand, quantity, price, priceFormatted, category });
  }

  return products;
}
