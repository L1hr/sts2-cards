// Apply patch-correct rarity overrides to cards.json (StS2 source), cards1.json (StS1 source),
// and data.js (deployed window.STS_DATA). The 灰机wiki source is stale on these; patch history is authoritative.
const fs = require("fs");

// [slug, expectedRarity]
const fixesSts2 = [
  ["dominate", "rare"],        // 主宰 uncommon->rare v0.109.0
  ["flanking", "rare"],        // 夹击 uncommon->rare v0.108.0
  ["ignition", "uncommon"],    // 引火 rare->uncommon v0.108.0
  ["taunt", "common"],         // 挑衅 uncommon->common v0.109.0
  ["bloodletting", "uncommon"],// 放血 common->uncommon v0.109.0
  ["cruelty", "uncommon"],     // 残酷 rare->uncommon v0.109.0
  ["accelerant", "uncommon"],  // 触媒 rare->uncommon v0.109.0
  ["echoing-slash", "uncommon"],// 回响斩击 rare->uncommon v0.110.0
  ["salvo", "uncommon"],       // 箭雨 rare->uncommon v0.111.0 (swap with splash)
  ["splash", "rare"],          // 飞溅 uncommon->rare v0.111.0 (swap with salvo)
];
const fixesSts1 = [
  ["BloodforBloodR", "common"],// 以血还血 uncommon->common v2.0
];

function applyToCards(file, fixes, gameKey) {
  const obj = JSON.parse(fs.readFileSync(file, "utf8"));
  const bySlug = {};
  obj.cards.forEach(c => bySlug[c.slug] = c);
  let done = 0, skip = 0;
  for (const [slug, exp] of fixes) {
    const c = bySlug[slug];
    if (!c) { console.log(`  [WARN] ${gameKey} slug not found in ${file}: ${slug}`); skip++; continue; }
    if (c.rarity === exp) { console.log(`  [skip] ${c.name} (${slug}) already ${exp}`); skip++; continue; }
    console.log(`  [fix]  ${c.name} (${slug}): ${c.rarity} -> ${exp}`);
    c.rarity = exp;
    done++;
  }
  fs.writeFileSync(file, JSON.stringify(obj, null, 0) + "\n", "utf8");
  console.log(`  -> ${file}: ${done} changed, ${skip} skipped`);
  return done;
}

function applyToDataJs(fixesSts2, fixesSts1) {
  const s = fs.readFileSync("data.js", "utf8");
  const pre = "window.STS_DATA=";
  const start = s.indexOf(pre) + pre.length;
  let jsonStr = s.slice(start).replace(/;\s*$/, "");
  const D = JSON.parse(jsonStr);
  const map2 = {}, map1 = {};
  fixesSts2.forEach(([k, v]) => map2[k] = v);
  fixesSts1.forEach(([k, v]) => map1[k] = v);
  let done = 0, skip = 0;
  for (const g of ["sts2", "sts1"]) {
    const map = g === "sts2" ? map2 : map1;
    const bySlug = {};
    D[g].cards.forEach(c => bySlug[c.slug] = c);
    for (const slug in map) {
      const c = bySlug[slug];
      if (!c) { console.log(`  [WARN] data.js ${g} slug not found: ${slug}`); skip++; continue; }
      const exp = map[slug];
      if (c.rarity === exp) { skip++; continue; }
      console.log(`  [fix]  data.js ${g} ${c.name} (${slug}): ${c.rarity} -> ${exp}`);
      c.rarity = exp;
      done++;
    }
  }
  fs.writeFileSync("data.js", pre + JSON.stringify(D) + ";\n", "utf8");
  console.log(`  -> data.js: ${done} changed, ${skip} skipped`);
}

console.log("=== cards.json (StS2 source) ===");
applyToCards("cards.json", fixesSts2, "sts2");
console.log("=== cards1.json (StS1 source) ===");
applyToCards("cards1.json", fixesSts1, "sts1");
console.log("=== data.js (deployed) ===");
applyToDataJs(fixesSts2, fixesSts1);
console.log("DONE");
