import { test } from "node:test";
import assert from "node:assert/strict";

import { separaCoppia, simboloSenzaPrefisso, costruisciUniverso } from "../lib/bUniverso.js";
import { serieSettimanale, equity, curvaPortafoglio, giudica, periodo } from "../lib/bSettimane.js";

const LATO = 0.0015;
const COSTO = 0.003;
const fraz = (x) => x - Math.floor(x);
/** Rendimenti settimanali pseudocasuali, deterministici, tra −10% e +10%. */
const casuali = (W) => Array.from({ length: W }, (_, i) => (fraz(Math.sin(i * 12.9898 + 1) * 43758.5453) - 0.5) * 0.2);
const GIORNO = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const giorniDa = (da, a) => {
  const out = [];
  for (let t = Date.parse(da); t <= Date.parse(a); t += GIORNO) out.push(iso(t));
  return out;
};

const coppia = (nome, mediana2020, mancanti = []) => ({
  nome,
  primo: "2018-01-01",
  ultimo: "2026-06-28",
  mancanti,
  mediana2020
});

test("separaCoppia: quota EUR o USD, altrimenti nessuna coppia", () => {
  assert.deepEqual(separaCoppia("ADAEUR"), { base: "ADA", quota: "EUR" });
  assert.deepEqual(separaCoppia("XBTUSD"), { base: "XBT", quota: "USD" });
  assert.deepEqual(separaCoppia("EURUSD"), { base: "EUR", quota: "USD" });
  assert.equal(separaCoppia("PIPPOBTC"), null);
});

test("simboloSenzaPrefisso: il simbolo con prefisso X è un doppione solo se quello senza esiste", () => {
  assert.equal(simboloSenzaPrefisso("XXRP", new Set(["XRP", "XXRP"])), "XRP");
  assert.equal(simboloSenzaPrefisso("XLM", new Set(["XLM"])), null);
});

test("costruisciUniverso: EUR prima di USD, esclusioni con motivo, e le prime N per liquidità", () => {
  const coppie = [
    coppia("AEUR", 10),
    coppia("BUSD", 20),
    coppia("BEUR", 1),
    coppia("CEUR", 30, ["2019-03-01"]),
    coppia("USDTEUR", 99),
    coppia("XBTEUR", 999),
    coppia("DEUR", 5)
  ];
  const universo = costruisciUniverso(coppie, { top: 1 });
  const per = (base) => universo.find((r) => r.base === base);
  assert.equal(per("A").incluso, true);
  assert.equal(per("B").coppia, "BEUR"); // la coppia in EUR vince su quella in USD
  assert.equal(per("B").incluso, false);
  assert.match(per("C").motivo, /storia insufficiente/);
  assert.match(per("USDT").motivo, /stablecoin/);
  assert.match(per("XBT").motivo, /Bitcoin/);
  assert.match(per("D").motivo, /fuori dalle prime 1/);
  assert.equal(universo.filter((r) => r.incluso).length, 1);
});

test("costruisciUniverso con soloEur e ammettiBitcoin: solo coppie in EUR, Bitcoin ammesso, USD escluse con motivo", () => {
  const coppie = [coppia("XBTEUR", 500), coppia("XBTUSD", 900), coppia("AEUR", 10), coppia("AUSD", 800), coppia("BUSD", 700)];
  const universo = costruisciUniverso(coppie, { top: 5, soloEur: true, ammettiBitcoin: true });
  const per = (base) => universo.find((r) => r.base === base);
  assert.equal(per("XBT").incluso, true);
  assert.equal(per("XBT").coppia, "XBTEUR");
  assert.equal(per("A").coppia, "AEUR");
  assert.equal(per("A").incluso, true);
  assert.equal(per("B").incluso, false);
  assert.match(per("B").motivo, /solo coppia in USD/);
});

test("costruisciUniverso con maxGiorniMancanti ed escludiBasi: tolleranza sui giorni mancanti e esclusione dichiarata", () => {
  const coppie = [
    coppia("LEUR", 40, ["2016-08-01", "2016-08-02"]),
    coppia("EEUR", 50),
    coppia("XEUR", 30, Array(40).fill("2017-01-01"))
  ];
  const tollerante = costruisciUniverso(coppie, { top: 5, maxGiorniMancanti: 30, escludiBasi: ["E"] });
  const per = (base) => tollerante.find((r) => r.base === base);
  assert.equal(per("L").incluso, true);
  assert.equal(per("E").incluso, false);
  assert.match(per("E").motivo, /decisione del test/);
  assert.equal(per("X").incluso, false);
  assert.match(per("X").motivo, /storia insufficiente/);
  const rigoroso = costruisciUniverso(coppie, { top: 5 });
  assert.equal(rigoroso.find((r) => r.base === "L").incluso, false);
});

test("serieSettimanale: la moneta tolta dal listino si chiude alla sua ultima candela, poi è inattiva", () => {
  const date = giorniDa("2019-01-06", "2024-01-15");
  const close = date.map((_, i) => 100 + i);
  const serie = serieSettimanale({ date, close }, "2026-06-28");
  const w = serie.domeniche.findIndex((d) => d >= "2024-01-15");
  assert.equal(serie.domeniche[w], "2024-01-21");
  assert.equal(serie.attiva[w], true);
  assert.equal(serie.attiva[w + 1], false);
  assert.equal(serie.chiusure[w], close[date.indexOf("2024-01-15")]);
  assert.equal(serie.chiusure[w + 1], null);
  assert.equal(serie.dentro[w + 1], 0);
});

test("equity: entrata e uscita pagano ciascuna la metà del costo; fuori posizione la quota resta ferma", () => {
  const curva = equity([1, 1, 0], [0.1, 0.2, 0.3], LATO);
  assert.equal(curva.length, 4);
  const atteso = (1 - LATO) * 1.1 * 1.2 * (1 - LATO);
  assert.ok(Math.abs(curva[3] - atteso) < 1e-12);
});

test("curvaPortafoglio: due monete identiche danno la stessa curva di una", () => {
  const m = { H: [1, 0, 1], R0: [0.1, -0.05, 0.02], attiva: [1, 1, 1] };
  const una = curvaPortafoglio([m], LATO, "H");
  const due = curvaPortafoglio([m, { ...m }], LATO, "H");
  for (let k = 0; k < una.length; k++) assert.ok(Math.abs(una[k] - due[k]) < 1e-12);
});

test("giudica: una regola allineata ai rendimenti positivi passa, con 191 spostamenti su 200 settimane", () => {
  const W = 200;
  const R = casuali(W);
  const H = R.map((r) => (r > 0 ? 1 : 0));
  const g = giudica([{ H, R0: R, attiva: Array(W).fill(1) }], { costo: COSTO, alfa: 0.05, escludi: 4 });
  assert.equal(g.spostamenti, 191);
  assert.equal(g.passa, true, g.motivi.join("; "));
});

test("giudica: una regola sui giorni negativi ha somma netta non positiva e non passa", () => {
  const W = 200;
  const R = casuali(W);
  const H = R.map((r) => (r < 0 ? 1 : 0));
  const g = giudica([{ H, R0: R, attiva: Array(W).fill(1) }], { costo: COSTO, alfa: 0.05, escludi: 4 });
  assert.equal(g.passa, false);
  assert.ok(g.motivi.some((m) => /somma netta non positiva/.test(m)));
});

test("periodo: le settimane dopo la domenica di partenza, con la data di ciascuna", () => {
  const date = giorniDa("2019-01-06", "2021-06-30");
  const close = date.map((_, i) => 100 + i);
  const serie = serieSettimanale({ date, close }, "2021-06-27");
  const p = periodo(serie, { da: "2021-01-03", W: 4 });
  assert.equal(p.date.length, 5);
  assert.equal(p.date[0], "2021-01-03");
  assert.equal(p.date[4], "2021-01-31");
  assert.equal(p.H.length, 4);
});
