/**
 * favorites-parser.ts — Parse le HTML de GET /client/mes-produits-preferes
 *
 * La page réutilise le même composant de carte produit que /recherche :
 *   <div class="quantity-selector" data-product-id data-offer-id data-seller-id …>
 * On s'ancre donc sur ces data-attributes plutôt que sur des classes BEM de
 * mise en page (t-myFavorites__*), qu'Auchan renomme régulièrement — c'est ce
 * qui rendait get_favorites systématiquement vide.
 *
 * Bonus : ces attributs portent offerId / sellerId, donc les favoris retournés
 * sont directement ajoutables au panier sans passer par search_product.
 */

import type { FavoriteProduct } from '../types.js';
import { parsePrice, decode } from './html-utils.js';

/** Valeur d'un attribut depuis une balise ouvrante. */
function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
}

/**
 * Rayons de la page : chaque section porte un titre visible. On récupère leur
 * position pour rattacher ensuite chaque produit au dernier rayon qui le précède.
 */
function extractSections(html: string): Array<{ index: number; label: string }> {
  const sections: Array<{ index: number; label: string }> = [];

  // Markup courant : une carte "rayon" avec <img alt="Animalerie"> + lien /ca-nNN
  const rayonRe = /<img[^>]*\salt="([^"]{2,40})"[^>]*>(?:(?!<article)[\s\S]){0,800}?href="\/ca-[\w-]+"/g;
  let m: RegExpExecArray | null;
  while ((m = rayonRe.exec(html)) !== null) {
    sections.push({ index: m.index, label: decode(m[1]).trim() });
  }

  // Markup historique
  const legacyRe = /t-myFavorites__categoryTitle[^>]*>([^<]+)</g;
  while ((m = legacyRe.exec(html)) !== null) {
    sections.push({ index: m.index, label: decode(m[1]).trim() });
  }

  return sections.sort((a, b) => a.index - b.index);
}

function categoryAt(sections: Array<{ index: number; label: string }>, pos: number): string {
  let label = '';
  for (const s of sections) {
    if (s.index <= pos) label = s.label;
    else break;
  }
  return label;
}

export function parseFavoritesPage(html: string): FavoriteProduct[] {
  const results: FavoriteProduct[] = [];
  const sections = extractSections(html);
  const seen = new Set<string>();

  const tagRe = /<div[^>]+data-product-id="[^"]+"[^>]*>/g;
  let tagMatch: RegExpExecArray | null;
  let prevSelectorEnd = 0;

  while ((tagMatch = tagRe.exec(html)) !== null) {
    const tag = tagMatch[0];
    if (!tag.includes('quantity-selector')) continue;

    const productId = attr(tag, 'data-product-id');
    if (!productId || seen.has(productId)) continue;
    seen.add(productId);

    // La description précède le sélecteur de quantité, parfois de plusieurs Ko.
    // La fenêtre arrière doit s'arrêter à la carte courante, sinon on récupère
    // le nom et le prix du produit précédent.
    const windowStart = Math.max(0, tagMatch.index - 4000);
    const prevArticle = html.lastIndexOf('<article', tagMatch.index);
    const start = Math.max(windowStart, prevArticle === -1 ? 0 : prevArticle, prevSelectorEnd);
    const ctx = html.slice(start, Math.min(html.length, tagMatch.index + 500));
    prevSelectorEnd = tagMatch.index + tag.length;

    const descM = ctx.match(
      /class="[^"]*product-thumbnail__description[^"]*"[^>]*>([\s\S]*?)<\/p>/,
    );
    const descHtml = descM?.[1] ?? '';

    const brandM = descHtml.match(/<strong[^>]*>\s*([^<]+)\s*<\/strong>/);
    const brand = brandM ? decode(brandM[1].trim()) : undefined;

    // Nom = description privée du <strong> de marque.
    const nameRaw = descHtml.replace(/<strong[^>]*>[\s\S]*?<\/strong>/g, '');
    let name = decode(nameRaw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

    // Filet : le libellé complet figure dans l'aria-label du bouton d'ajout.
    if (!name) {
      const aria = ctx.match(/aria-label="Ajouter\s+((?!le produit)[^"]*?)\s+au panier"/i)?.[1];
      name = aria ? decode(aria).replace(/\s+/g, ' ').trim() : '';
    }
    if (!name) continue;

    // (?![\w-]) empêche de matcher "product-price-perUnit", qui contient "product-price".
    const priceM = ctx.match(/class="[^"]*product-price(?![\w-])[^"]*"[^>]*>\s*([\d\s,.'€]+)/);
    const priceFormatted = priceM ? priceM[1].replace(/\s+/g, ' ').trim() : '';

    const fmtM = ctx.match(/class="[^"]*product-attribute[^"]*"[^>]*>\s*([^<"]{1,40})/);
    const ppuM = ctx.match(/([\d]+[,.][\d]{2}\s*€\s*\/\s*\w+)/);
    const promoM = ctx.match(/class="[^"]*a-promotionLabel[^"]*"[^>]*>\s*([^<]+)/);
    const hrefM = ctx.match(/href="(\/[^"]*\/pr-(C\d+))"/);

    // data-stock est la seule source fiable du stock du drive actif.
    const stock = Number(attr(tag, 'data-stock') ?? '0');

    results.push({
      productId,
      offerId: attr(tag, 'data-offer-id'),
      sellerId: attr(tag, 'data-seller-id'),
      sellerType: attr(tag, 'data-seller-type'),
      name,
      brand,
      format: fmtM ? decode(fmtM[1].trim()) : undefined,
      category: categoryAt(sections, tagMatch.index),
      price: parsePrice(priceFormatted),
      priceFormatted,
      pricePerUnit: ppuM ? decode(ppuM[1].trim()) : undefined,
      promo: promoM ? decode(promoM[1].trim()) : undefined,
      productUrl: hrefM?.[1] ?? '',
      productCode: hrefM?.[2],
      available: stock > 0 && !tag.includes('data-disable-button="true"'),
    });
  }

  return results;
}
