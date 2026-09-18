const B = new URL('../dist/auchan/', import.meta.url).pathname;
const { parseFavoritesPage } = await import(B + 'favorites-parser.js');
const { parseOrderDetailPage } = await import(B + 'order-detail-parser.js');

// Markup réel observé sur /client/mes-produits-preferes (carte produit + rayon)
const FAV = `
<article><img alt="Animalerie"><a href="/ca-n11">Voir le rayon</a></article>
<article>
 <a href="/catsan-litiere/pr-C1200494">
  <p class="product-thumbnail__description"><strong>CATSAN</strong> Litière minérale hygiène plus non agglomérante pour chat</p>
 </a>
 <span class="product-attribute">10l</span><span class="product-price-perUnit">0,53€ / l</span>
 <span class="product-price">5,29€</span>
 <button aria-label="Ajouter le produit : Litière minérale à une liste"></button>
 <div class="quantity-selector qa2c-wrapper" data-product-id="f66cf0f5-b58d-48bf-b62b-fb933f4b51f1"
   data-offer-id="1f15a4e4-5d81-550b-b896-591532b9762d" data-stock="35"
   data-disable-button="false" data-seller-type="GROCERY" data-seller-id="39439ca0-e31f-489a-9cdf-8f6fa676fc2a">
  <button aria-label="Ajouter CATSAN Litière minérale hygiène plus non agglomérante pour chat 10l au panier"></button>
 </div>
</article>
<article><img alt="Boucherie, volaille, poissonnerie"><a href="/ca-n02">Voir le rayon</a></article>
<article>
 <a href="/ovive-truite/pr-C1200423">
  <p class="product-thumbnail__description"><strong>OVIVE</strong> Truite fumée Pyrénées</p>
 </a>
 <span class="product-attribute">120g</span><span class="product-price">5,94€</span>
 <div class="quantity-selector" data-product-id="c46fea43-1780-4265-ba0e-ceef643a2d92"
   data-offer-id="2e439971-937e-5700-bc1b-e6746c765fb6" data-stock="0"
   data-seller-type="GROCERY" data-seller-id="39439ca0-e31f-489a-9cdf-8f6fa676fc2a"></div>
</article>`;

const f = parseFavoritesPage(FAV);
console.log('FAVORIS :', f.length);
for (const p of f) {
  console.log(`  ${p.category} | ${p.brand} | ${p.name} | ${p.format} | ${p.priceFormatted} (${p.price}cts) | ${p.pricePerUnit ?? '-'} | dispo:${p.available}`);
  console.log(`     ids -> product:${p.productId?.slice(0,8)} offer:${p.offerId?.slice(0,8)} seller:${p.sellerType}`);
}

const fails = [];
const [c, o] = f;
if (f.length !== 2) fails.push(`favoris: 2 attendus, ${f.length} obtenus`);
if (c?.name !== 'Litière minérale hygiène plus non agglomérante pour chat') fails.push('nom pollué par du HTML');
if (c?.brand !== 'CATSAN') fails.push('marque KO');
if (c?.format !== '10l') fails.push(`format KO: ${c?.format}`);
if (c?.price !== 529) fails.push(`prix KO: ${c?.price}`);
if (c?.category !== 'Animalerie') fails.push(`rayon KO: ${c?.category}`);
if (!c?.offerId || !c?.sellerId) fails.push('ids offre manquants');
if (c?.available !== true) fails.push('stock 35 -> devrait etre dispo');
if (o?.available !== false) fails.push('stock 0 -> devrait etre indispo');
if (o?.category !== 'Boucherie, volaille, poissonnerie') fails.push(`rayon 2 KO: ${o?.category}`);

// Non-régression du détail de commande
const ORDER = `<h2>Animalerie</h2><article><a href="/x/pr-C1187630">
<img alt="PURINA ONE Bifensis croquettes 3kg"></a><strong>PURINA ONE</strong>
<aside><span>13.88 €</span><span>Quantité&nbsp;: 3</span></aside></article>`;
const d = parseOrderDetailPage(ORDER, 'AROM-1', '1');
console.log('\nCOMMANDE:', d.products.length, JSON.stringify(d.products[0]));
if (d.products[0]?.quantity !== 3) fails.push('detail commande: quantite KO');
if (d.products[0]?.name?.includes('<')) fails.push('detail commande: nom pollué');

console.log('\n' + (fails.length ? 'ECHECS:\n - ' + fails.join('\n - ') : 'TOUS LES CONTROLES PASSENT'));
process.exit(fails.length ? 1 : 0);
