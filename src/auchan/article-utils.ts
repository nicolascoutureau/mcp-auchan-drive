/**
 * article-utils.ts — Extraction de produits ancrée sur la structure du DOM
 * plutôt que sur les classes CSS.
 *
 * Auchan renomme régulièrement ses classes BEM (t-myFavorites__section,
 * m-orderProduct…), ce qui casse les parsers qui s'y accrochent. Les invariants
 * structurels, eux, bougent beaucoup moins :
 *   - une carte produit est un <article>
 *   - elle contient un lien "/slug/pr-C123456"
 *   - le nom complet est répété dans alt="" / title="" / aria-label="… au panier"
 *   - les prix s'écrivent "5,29 €" ou "5.29€"
 */

import { decode } from './html-utils.js';

/** Découpe le HTML en blocs <article>…</article> (non imbriqués, approximation). */
export function splitArticles(html: string): Array<{ start: number; html: string }> {
  const starts: number[] = [];
  const re = /<article[\s>]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) starts.push(m.index);

  return starts.map((start, i) => ({
    start,
    html: html.slice(start, i + 1 < starts.length ? starts[i + 1] : html.length),
  }));
}

/** Lien produit "/slug/pr-C123456" présent dans un bloc. */
export function extractProductLink(block: string): { url: string; code: string } | undefined {
  const m = block.match(/href="(\/[^"]*\/pr-(C\d+))"/);
  return m ? { url: m[1], code: m[2] } : undefined;
}

/**
 * Nom complet du produit. Auchan le duplique dans plusieurs attributs ;
 * on prend le premier disponible, du plus fiable au moins fiable.
 */
export function extractFullName(block: string): string {
  const candidates = [
    // aria-label du bouton : "Ajouter CATSAN Litière … 10l au panier"
    // [^"]* est impératif : [\s\S]*? déborde sur les attributs suivants et
    // ramène des kilo-octets de HTML dans le nom du produit.
    block.match(/aria-label="Ajouter\s+((?!le produit)[^"]*?)\s+au panier"/i)?.[1],
    block.match(/title="Ajouter\s+((?!le produit)[^"]*?)\s+au panier"/i)?.[1],
    // alt de l'image produit
    block.match(/<img[^>]*\salt="([^"]+)"/i)?.[1],
    // title du lien produit
    block.match(/href="\/[^"]*\/pr-C\d+"[^>]*\stitle="([^"]+)"/i)?.[1],
  ];

  for (const c of candidates) {
    const v = c ? decode(c).replace(/\s+/g, ' ').trim() : '';
    if (v && !/^(ajouter|supprimer|voir)\b/i.test(v)) return v;
  }
  return '';
}

/** Marque : premier <strong>/<span class*="brand"> du bloc, si présent. */
export function extractBrand(block: string): string {
  const m =
    block.match(/class="[^"]*brand[^"]*"[^>]*>\s*([^<]{2,60}?)\s*</i) ??
    block.match(/<strong[^>]*>\s*([^<]{2,60}?)\s*<\/strong>/i);
  return m ? decode(m[1]).replace(/\s+/g, ' ').trim() : '';
}

/**
 * Retire la marque en tête de nom quand elle y est répétée.
 * "CATSAN Litière minérale…" + brand "CATSAN" → "Litière minérale…"
 */
export function stripBrandPrefix(name: string, brand: string): string {
  if (!brand) return name;
  const esc = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name.replace(new RegExp(`^${esc}\\s+`, 'i'), '').trim();
}

/**
 * Tous les montants "5,29 €" d'un bloc, dans l'ordre d'apparition.
 * Le HTML est décodé au préalable : Auchan encode l'euro en &#x20AC;.
 */
export function extractPrices(block: string): string[] {
  const out: string[] = [];
  const text = decode(block);
  const re = /(\d{1,4}[.,]\d{2})\s*(?:&nbsp;|\s)?€/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(`${m[1]} €`);
  return out;
}

/**
 * Quantité commandée : "Quantité : 4", "x4", "4 ×".
 * Décodage préalable obligatoire : le HTML porte "Quantit&#xE9; : 4".
 */
export function extractQuantity(block: string): number | undefined {
  const text = decode(block);
  const m =
    text.match(/Quantit[eé]\s*(?:&nbsp;|\s)*:\s*(\d+)/i) ??
    text.match(/[×x]\s*(\d{1,3})\b/);
  return m ? parseInt(m[1], 10) : undefined;
}

/** Contenance / conditionnement : "Contenance : 10l", "Lot de 4 tranches". */
export function extractFormat(block: string): string | undefined {
  const m =
    block.match(/class="[^"]*product-attribute[^"]*"[^>]*>\s*([^<"]{1,40})/i) ??
    block.match(/Contenance\s*:\s*([^<"]{1,40})/i);
  return m ? decode(m[1]).replace(/\s+/g, ' ').trim() : undefined;
}

/**
 * Titres de section (h1→h4) avec leur position, filtrés du chrome de page.
 * Sert à rattacher chaque <article> à son rayon.
 */
const CHROME_HEADINGS =
  /^(nos rayons|en ce moment|mes courses|maison|besoin d'aide|nos services|à propos|liste des cookies|centre de préférences|gérer les préférences|commande n|souhaitez-vous|si je modifie|traceurs|cookies|personnalisation|publicité|partage sur)/i;

export function extractHeadings(html: string): Array<{ index: number; text: string }> {
  const out: Array<{ index: number; text: string }> = [];
  const re = /<h[1-4][^>]*>([\s\S]{1,200}?)<\/h[1-4]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = decode(m[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!text || CHROME_HEADINGS.test(text)) continue;
    out.push({ index: m.index, text });
  }
  return out;
}

/** Rayon applicable à un <article> : dernier titre de section qui le précède. */
export function categoryFor(
  headings: Array<{ index: number; text: string }>,
  position: number,
): string {
  let category = '';
  for (const h of headings) {
    if (h.index <= position) category = h.text;
    else break;
  }
  return category;
}
