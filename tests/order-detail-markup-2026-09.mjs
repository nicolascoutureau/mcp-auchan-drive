/**
 * Markup réel de /client/mes-commandes/{ref}/{num} (relevé le 18/09/2026).
 * Entités HTML conservées telles quelles : c'est précisément ce qui cassait
 * l'extraction des quantités et des prix.
 */
const { parseOrderDetailPage } = await import(new URL('../dist/auchan/order-detail-parser.js', import.meta.url).pathname);

const HTML = `
<div class="p-detail__pointOfService"><span class="a-pointOfService__label">Drive</span>
<span class="a-pointOfService__place">Auchan Drive Saint-Genis (Chap&#xF4;nost)</span></div>
<div class="a-simplifiedState"><span class="a-simplifiedState__label">Retir&#xE9;e</span></div>
<p>Retrait pr&#xE9;vu le: Thursday 16 July entre 16h30 et 17h00</p>
<div class="p-detail__totalAmount"><div class="a-amount">165.01 &#x20AC;</div></div>

<div class="o-products__line m-productItem" role="list">
 <article class="product-thumbnail m-productItem__product" data-id="f37ea07e">
  <a href="/purina/pr-C1187630">
   <p class="product-thumbnail__description"><strong>PURINA ONE</strong> Bifensis croquettes au saumon bl&#xE9; pour chat st&#xE9;rilis&#xE9; 3kg</p></a>
 </article>
 <aside class="m-productItem__aside"><div class="a-amount"><div class="a-amount__amount">13.88 &#x20AC;</div>
 <div class="a-amount__taxes"><div class="a-amount__tax"><div>dont 2.31 &#x20AC; de TVA.</div></div></div></div>
 <div class="p-detail__productQuantity">Quantit&#xE9; : 3</div></aside>
</div>

<div class="o-products__line m-productItem" role="list">
 <article class="product-thumbnail m-productItem__product" data-id="f66cf0f5">
  <a href="/catsan/pr-C1200494">
   <p class="product-thumbnail__description"><strong>L&apos;ARBRE VERT</strong> Recharge Lessive liquide 1,53l</p></a>
 </article>
 <aside class="m-productItem__aside"><div class="a-amount"><div class="a-amount__amount">7.28 &#x20AC;</div></div>
 <div class="p-detail__productQuantity">Quantit&#xE9; : 4</div></aside>
</div>

<div class="m-receipt"><div class="m-receipt__total m-receipt__line">
<span class="m-receipt__label">Total</span><strong class="m-receipt__value">165.01 &#x20AC;</strong></div></div>`;

const d = parseOrderDetailPage(HTML, 'AROM-763541356', '371625185');
console.log('magasin :', JSON.stringify(d.storeName));
console.log('statut  :', JSON.stringify(d.status));
console.log('créneau :', JSON.stringify(d.pickupSlot));
console.log('total   :', d.totalFormatted, `(${d.total} cts)`);
console.log('produits:', d.products.length);
for (const p of d.products) console.log(`   ${p.brand} | ${p.name} | x${p.quantity} | ${p.priceFormatted} (${p.price} cts)`);

const ko = [];
if (d.products.length !== 2) ko.push(`2 produits attendus, ${d.products.length}`);
if (d.products[0]?.quantity !== 3) ko.push(`quantité 1 = ${d.products[0]?.quantity} (attendu 3)`);
if (d.products[1]?.quantity !== 4) ko.push(`quantité 2 = ${d.products[1]?.quantity} (attendu 4)`);
if (d.products[0]?.price !== 1388) ko.push(`prix 1 = ${d.products[0]?.price} (attendu 1388)`);
if (d.products[1]?.price !== 728) ko.push(`prix 2 = ${d.products[1]?.price} (attendu 728)`);
if (d.products[1]?.brand !== "L'ARBRE VERT") ko.push(`marque 2 = ${d.products[1]?.brand}`);
if (d.products[0]?.name?.includes('&#')) ko.push('entités non décodées dans le nom');
if (d.total !== 16501) ko.push(`total = ${d.total} (attendu 16501)`);
if (!d.storeName.includes('Chapônost')) ko.push(`magasin = ${d.storeName}`);
if (d.status !== 'Retirée') ko.push(`statut = ${d.status}`);
if (!d.pickupSlot?.includes('16h30')) ko.push(`créneau = ${d.pickupSlot}`);

console.log('\n' + (ko.length ? 'ÉCHECS:\n - ' + ko.join('\n - ') : 'TOUS LES CONTRÔLES PASSENT'));
process.exit(ko.length ? 1 : 0);
