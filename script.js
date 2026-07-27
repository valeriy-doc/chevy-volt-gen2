/* =======================================================================
   Chevrolet Volt Gen 2 — interactive calculators
   All models are transparent estimates tuned to published Volt/Bolt
   degradation data and typical US used-market / repair pricing (2026).
   ======================================================================= */

"use strict";

const CURRENT_YEAR = 2026;
const USABLE_KWH = 14.0;   // ~14 kWh usable of the 18.4 kWh pack when new
const NEW_RANGE = 85;      // EPA electric range when new (~53 mi ≈ 85 km)
const WARRANTY_KM = 160000; // 100,000 mi ≈ 160,000 km

const fmtUSD = (n) =>
  "$" + Math.round(n).toLocaleString("en-US");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* Keep a number input and its companion range slider in sync. */
function linkNumberAndRange(numId, rangeId, onChange) {
  const num = document.getElementById(numId);
  const range = document.getElementById(rangeId);
  if (!num || !range) return;
  const sync = (src, dst) => {
    let v = Number(src.value);
    if (Number.isFinite(v)) {
      // range may have a smaller max than the number field; clamp the slider only
      if (dst === range) v = clamp(v, Number(range.min), Number(range.max));
      dst.value = v;
    }
    onChange();
  };
  num.addEventListener("input", () => sync(num, range));
  range.addEventListener("input", () => sync(range, num));
}

/* ======================================================================
   1) BATTERY HEALTH ESTIMATOR
   SoH = 100 − calendarFade − cycleFade, with climate / usage / care modifiers.
   ====================================================================== */
function computeBatteryHealth() {
  const year = Number(document.getElementById("b-year").value);
  const km = clamp(Number(document.getElementById("b-miles").value) || 0, 0, 640000);
  const climate = document.getElementById("b-climate").value;
  const charging = document.getElementById("b-charging").value;
  const usage = document.getElementById("b-usage").value;
  const garaged = document.getElementById("b-garage").checked;

  const age = Math.max(0, CURRENT_YEAR - year);

  // Fraction of distance driven on electricity (drives cycle count).
  const evFraction = { ev: 0.85, balanced: 0.55, gas: 0.25 }[usage];

  // Calendar fade: Li-ion time-based capacity loss (~1.4%/yr baseline).
  let calendarFade = age * 1.4;

  // Cycle fade: electric km → charge cycles. ~80 km per usable cycle.
  const evKm = km * evFraction;
  const cycles = evKm / 80;
  const cycleFade = cycles * 0.006; // ≈0.6% per 100 cycles; 2000 cycles ≈ 12%

  // Climate modifier (heat is the enemy of Li-ion).
  const climateMult = { cool: 0.85, moderate: 1.0, hot: 1.35 }[climate];
  // Charging habit modifier.
  const chargeMult = { l1: 0.92, l2: 1.0, mixed: 1.06 }[charging];

  let totalFade = (calendarFade + cycleFade) * climateMult * chargeMult;
  if (garaged) totalFade *= 0.92; // shade / thermal stability helps

  const soh = clamp(100 - totalFade, 55, 100);

  const usableKwh = USABLE_KWH * (soh / 100);
  const range = NEW_RANGE * (soh / 100);
  const lostPct = 100 - soh;

  return { soh, usableKwh, range, lostPct, age, km };
}

function renderBatteryHealth() {
  const r = computeBatteryHealth();
  const soh = Math.round(r.soh);

  document.getElementById("battPct").textContent = soh + "%";
  document.getElementById("battKwh").textContent = r.usableKwh.toFixed(1) + " кВт·ч";
  document.getElementById("battRange").textContent = Math.round(r.range) + " км";
  document.getElementById("battLost").textContent = r.lostPct.toFixed(1) + "%";

  // Gauge: semicircle path length ≈ 251.2 (π·r, r=80).
  const arc = document.getElementById("battArc");
  const len = 251.2;
  arc.style.strokeDashoffset = String(len * (1 - r.soh / 100));

  let color, badgeClass, badgeText, note;
  if (soh >= 88) {
    color = "#6ee7a8"; badgeClass = "good"; badgeText = "Отлично";
    note = "Здоровая батарея — типично для ухоженного Volt второго поколения. Электрозапас близок к исходному.";
  } else if (soh >= 78) {
    color = "#8fe3c4"; badgeClass = "good"; badgeText = "Хорошо";
    note = "Нормальный износ для возраста и пробега. Электрозапаса всё ещё достаточно для повседневных поездок.";
  } else if (soh >= 70) {
    color = "#ffcf5c"; badgeClass = "ok"; badgeText = "Удовлетворительно";
    note = "Заметная потеря ёмкости. Годится как бюджетный вариант — проверьте дилерским сканом.";
  } else {
    color = "#ff6b6b"; badgeClass = "bad"; badgeText = "Проверьте";
    note = "Ниже типичного для Volt. Продиагностируйте высоковольтную батарею, прежде чем полагаться на оценку.";
  }
  arc.style.stroke = color;
  document.getElementById("battPct").style.color = color;

  const badge = document.getElementById("battBadge");
  badge.textContent = badgeText;
  badge.className = "badge " + badgeClass;

  // Add a warranty note when still likely covered.
  if (r.age < 8 && r.km < WARRANTY_KM) {
    note += " Вероятно, ещё действует гарантия 8 лет / 160 000 км.";
  }
  document.getElementById("battNote").textContent = note;
}

/* ======================================================================
   2) RESALE VALUE ESTIMATOR
   ====================================================================== */
const MSRP = {
  2016: { lt: 33995, premier: 38345 },
  2017: { lt: 34095, premier: 38445 },
  2018: { lt: 34095, premier: 38445 },
  2019: { lt: 34395, premier: 38995 },
};
// Baseline 2026 private-party value: average-mile, good-condition LT.
const BASE_VALUE = { 2016: 12000, 2017: 13800, 2018: 15800, 2019: 18200 };

function computeResale() {
  const year = Number(document.getElementById("r-year").value);
  const trim = document.getElementById("r-trim").value;
  const km = clamp(Number(document.getElementById("r-miles").value) || 0, 0, 640000);
  const cond = document.getElementById("r-cond").value;
  const health = Number(document.getElementById("r-health").value);
  const oneOwner = document.getElementById("r-onestars").checked;

  const age = Math.max(0, CURRENT_YEAR - year);
  let value = BASE_VALUE[year];

  if (trim === "premier") value += 1600;

  // Mileage adjustment vs. an expected ~20,000 km/yr.
  const expected = age * 20000;
  const delta = km - expected;
  if (delta > 0) value -= delta * 0.047;      // penalize excess km harder (~$0.075/mi)
  else value += Math.min(-delta, 64000) * 0.031; // reward low km (capped, ~$0.05/mi)

  // Condition multiplier.
  value *= { rough: 0.80, fair: 0.91, good: 1.0, clean: 1.09 }[cond];

  // Battery health: buyers pay a premium for a strong pack; discount weak ones.
  value *= clamp(1 + (health - 88) * 0.006, 0.80, 1.10);

  if (oneOwner) value *= 1.045;

  value = Math.max(value, 3200); // salvageable floor

  const msrp = MSRP[year][trim];
  const depreciation = msrp - value;
  const retained = (value / msrp) * 100;

  return { value, msrp, depreciation, retained, year, age };
}

function renderResale() {
  const r = computeResale();

  document.getElementById("resPrice").textContent = fmtUSD(r.value);
  const lo = fmtUSD(r.value * 0.92);
  const hi = fmtUSD(r.value * 1.08);
  document.getElementById("resRange").textContent = `Вероятный диапазон ${lo} – ${hi}`;

  document.getElementById("resMsrp").textContent = fmtUSD(r.msrp);
  document.getElementById("resNow").textContent = fmtUSD(r.value);
  document.getElementById("resDep").textContent = fmtUSD(r.depreciation);
  document.getElementById("resRetain").textContent = r.retained.toFixed(0) + "%";

  document.getElementById("barMsrp").style.width = "100%";
  document.getElementById("barNow").style.width = clamp(r.retained, 4, 100) + "%";

  let note;
  if (r.retained > 55) {
    note = "Отличное сохранение стоимости — Volt второго поколения хорошо держатся после начального обвала цены.";
  } else if (r.retained > 40) {
    note = "Типично для возраста: основное падение стоимости позади, цена близка к плато.";
  } else {
    note = "Глубоко на кривой амортизации — часто лучший момент для выгодной покупки б/у электромобиля.";
  }
  document.getElementById("resNote").textContent = note;
}

/* ======================================================================
   3) REPLACEMENT BATTERY PRICE GUIDE
   ====================================================================== */
let priceRoute = "new";

// [partCost, baseHours, label]
const ROUTES = {
  new:    { part: 6800, hours: 8,  label: "Новый блок — с установкой",
            note: "Совершенно новый блок GM — самый дорогой и труднодоступный; большинству владельцев он никогда не понадобится." },
  reman:  { part: 3500, hours: 8,  label: "Восстановленный — с установкой",
            note: "Восстановленные блоки от спецов по EV — самый частый реальный вариант, часто с собственной гарантией." },
  used:   { part: 1800, hours: 8,  label: "Б/у / разбор — с установкой",
            note: "Малопробежный блок с разбора — бюджетный путь; сначала проверьте здоровье и историю донора." },
  module: { part: 700,  hours: 5,  label: "Замена одного модуля",
            note: "Батарея Volt состоит из групп ячеек в нескольких модулях — заменить один вышедший из строя модуль гораздо дешевле, чем весь блок." },
};

function computePrice() {
  const rate = clamp(Number(document.getElementById("p-labor").value) || 150, 60, 400);
  const dealer = document.getElementById("p-dealer").checked;
  const warranty = document.getElementById("p-warranty").checked;
  const route = ROUTES[priceRoute];

  if (warranty) {
    return { total: 0, part: 0, labor: 0, misc: 0, hours: route.hours,
             covered: true, label: route.label };
  }

  let part = route.part;
  let hours = route.hours;
  let misc = 220;

  if (dealer) {
    part *= 1.12;   // dealer parts markup
    hours *= 1.15;  // dealer book-time tends to run higher
    misc = 320;
  }

  const labor = hours * rate;
  const total = part + labor + misc;

  return { total, part, labor, misc, hours, covered: false, label: route.label };
}

function renderPrice() {
  const p = computePrice();
  document.getElementById("pRouteLbl").textContent = p.label;
  document.getElementById("pHours").textContent = p.hours.toFixed(1);

  const badge = document.getElementById("priceBadge");

  if (p.covered) {
    document.getElementById("priceNum").textContent = "$0";
    document.getElementById("priceRange").textContent = "Покрывается гарантией";
    document.getElementById("pPart").textContent = "$0 (гарантия)";
    document.getElementById("pLabor").textContent = "$0 (гарантия)";
    document.getElementById("pMisc").textContent = "$0";
    document.getElementById("priceNote").textContent =
      "Если батарея выходит из строя в течение 8 лет / 100 000 миль, ремонт покрывает GM. Уточните покрытие по VIN.";
    badge.textContent = "Гарантия";
    badge.className = "badge good";
    return;
  }

  document.getElementById("priceNum").textContent = fmtUSD(p.total);
  document.getElementById("priceRange").textContent =
    `Обычный диапазон ${fmtUSD(p.total * 0.85)} – ${fmtUSD(p.total * 1.2)}`;
  document.getElementById("pPart").textContent = fmtUSD(p.part);
  document.getElementById("pLabor").textContent = fmtUSD(p.labor);
  document.getElementById("pMisc").textContent = fmtUSD(p.misc);
  document.getElementById("priceNote").textContent = ROUTES[priceRoute].note;

  if (p.total < 2500) { badge.textContent = "Бюджетно"; badge.className = "badge good"; }
  else if (p.total < 6000) { badge.textContent = "Средне"; badge.className = "badge ok"; }
  else { badge.textContent = "Дорого"; badge.className = "badge bad"; }
}

/* ======================================================================
   WIRING
   ====================================================================== */
function initBattery() {
  const ids = ["b-year", "b-climate", "b-charging", "b-usage", "b-garage"];
  ids.forEach((id) =>
    document.getElementById(id).addEventListener("input", renderBatteryHealth));
  linkNumberAndRange("b-miles", "b-miles-range", renderBatteryHealth);
  renderBatteryHealth();
}

function initResale() {
  const ids = ["r-year", "r-trim", "r-cond", "r-onestars"];
  ids.forEach((id) =>
    document.getElementById(id).addEventListener("input", renderResale));
  linkNumberAndRange("r-miles", "r-miles-range", renderResale);
  const health = document.getElementById("r-health");
  health.addEventListener("input", () => {
    document.getElementById("r-health-val").textContent = health.value;
    renderResale();
  });
  renderResale();
}

function initPrice() {
  document.querySelectorAll("#p-route .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#p-route .seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      priceRoute = btn.dataset.route;
      renderPrice();
    });
  });
  document.getElementById("p-dealer").addEventListener("input", renderPrice);
  document.getElementById("p-warranty").addEventListener("input", renderPrice);
  linkNumberAndRange("p-labor", "p-labor-range", renderPrice);
  renderPrice();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("year").textContent = String(CURRENT_YEAR);
  initBattery();
  initResale();
  initPrice();
});
