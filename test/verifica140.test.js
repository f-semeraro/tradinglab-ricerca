import { test } from "node:test";
import assert from "node:assert/strict";

import { rendimentiPortafoglio, curvaPortafoglio, giudicaPortafoglio, valutaCopertura } from "../lib/verifica140.js";
import { segnali, esposizione, statisticaMedia } from "../lib/detzel.js";

const COSTO = 0.0015;
const GIORNO = 86400000;
const fraz = (x) => x - Math.floor(x);
/** Rendimenti giornalieri pseudocasuali, deterministici, tra −10% e +10%. */
const casuali = (W) => Array.from({ length: W }, (_, i) => (fraz(Math.sin(i * 12.9898 + 1) * 43758.5453) - 0.5) * 0.2);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const intervallo = (da, a) => {
  const giorni = [];
  for (let t = Date.parse(da); t <= Date.parse(a); t += GIORNO) giorni.push(iso(t));
  return giorni;
};

test("rendimentiPortafoglio: una moneta, costo ai cambi e uscita finale", () => {
  const r = rendimentiPortafoglio([{ e: [1, 1, 0], R: [0.1, 0.2, -0.1] }], COSTO);
  assert.ok(Math.abs(r[0] - (0.1 - COSTO)) < 1e-12);
  assert.ok(Math.abs(r[1] - 0.2) < 1e-12);
  // il giorno 2 è fuori: paga solo il costo dell'uscita, già contato nel cambio
  assert.ok(Math.abs(r[2] - -COSTO) < 1e-12);
});

test("rendimentiPortafoglio: la media delle monete, con la posizione che esce all'ultimo giorno", () => {
  // due monete identiche danno lo stesso portafoglio di una sola
  const una = rendimentiPortafoglio([{ e: [1, 0, 1], R: [0.1, 0.2, 0.3] }], COSTO);
  const due = rendimentiPortafoglio([{ e: [1, 0, 1], R: [0.1, 0.2, 0.3] }, { e: [1, 0, 1], R: [0.1, 0.2, 0.3] }], COSTO);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(una[i] - due[i]) < 1e-12);
});

test("statistica del portafoglio: la media dei rendimenti netti giornalieri è (Σ e·R − c·T) / W", () => {
  const e = [1, 1, 0];
  const R = [0.1, 0.2, -0.1];
  const media = rendimentiPortafoglio([{ e, R }], COSTO).reduce((somma, r) => somma + r, 0) / R.length;
  assert.ok(Math.abs(media - statisticaMedia(e, R, COSTO)) < 1e-12);
});

test("curvaPortafoglio: lunga W+1, e l'ultimo valore è il prodotto dei rendimenti netti", () => {
  const monete = [{ e: [1, 1, 0], R: [0.1, 0.2, -0.1] }];
  const curva = curvaPortafoglio(monete, COSTO);
  assert.equal(curva.length, 4);
  const atteso = rendimentiPortafoglio(monete, COSTO).reduce((prodotto, r) => prodotto * (1 + r), 1);
  assert.ok(Math.abs(curva[3] - atteso) < 1e-12);
});

test("giudicaPortafoglio: un'esposizione allineata ai rendimenti positivi passa, con 139 spostamenti su 200 giorni", () => {
  const W = 200;
  const R = casuali(W);
  const e = R.map((r) => (r > 0 ? 1 : 0));
  const monete = [{ e, R }, { e, R }];
  const g = giudicaPortafoglio({ monete, costo: COSTO, alfa: 0.05, escludi: 30 });
  assert.equal(g.spostamenti, 139);
  assert.equal(g.passa, true, g.motivi.join("; "));
});

test("giudicaPortafoglio: un'esposizione sui giorni negativi non passa, per rendimento totale negativo", () => {
  const W = 200;
  const R = casuali(W);
  const e = R.map((r) => (r < 0 ? 1 : 0));
  const g = giudicaPortafoglio({ monete: [{ e, R }], costo: COSTO, alfa: 0.05, escludi: 30 });
  assert.equal(g.passa, false);
  assert.ok(g.motivi.some((m) => /rendimento netto totale non positivo/.test(m)));
});

test("valutaCopertura: storia corta, buco nella finestra e moneta completa", () => {
  const corta = valutaCopertura({ date: intervallo("2018-06-01", "2020-12-31"), inizio: "2018-07-01", fine: "2020-12-31", finestra: 140 });
  assert.equal(corta.incluso, false);
  assert.match(corta.motivo, /storia corta/);

  const date = intervallo("2017-01-01", "2020-12-31").filter((d) => d !== "2018-03-01");
  const buco = valutaCopertura({ date, inizio: "2018-07-01", fine: "2020-12-31", finestra: 140 });
  assert.equal(buco.incluso, false);
  assert.equal(buco.motivo, "giorno mancante il 2018-03-01");

  const completa = valutaCopertura({ date: intervallo("2017-01-01", "2020-12-31"), inizio: "2018-07-01", fine: "2020-12-31", finestra: 140 });
  assert.equal(completa.incluso, true);
});

test("esposizione dalla media a 140 giorni: il giorno t+1 usa il segnale del giorno t", () => {
  const close = Array.from({ length: 200 }, (_, i) => 100 + i);
  const e = esposizione(segnali(close, 140));
  // il prezzo sale sempre: dal giorno 139 la chiusura supera la media; l'esposizione è dentro dal giorno 140
  assert.equal(e[139], null);
  assert.equal(e[140], 1);
});
