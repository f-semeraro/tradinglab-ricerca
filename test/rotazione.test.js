import { test } from "node:test";
import assert from "node:assert/strict";

import {
  permanenzeLineari,
  permanenzeCircolari,
  ruota,
  rendimentoSettimane,
  statisticaOsservata,
  giudicaRotazione
} from "../lib/rotazione.js";

const COSTO = 0.003;

/** Rendimenti settimanali deterministici, senza seme: uno schema irregolare tra −10% e +10%. */
const rendimenti = (W) => Array.from({ length: W }, (_, i) => ((i * 37) % 101) / 101 * 0.2 - 0.1);

test("permanenzeLineari: le serie di 1 consecutive, senza attraversare il bordo", () => {
  assert.deepEqual(permanenzeLineari([0, 1, 1, 0, 1]), [[1, 2], [4]]);
  assert.deepEqual(permanenzeLineari([1, 1, 0]), [[0, 1]]);
});

test("permanenzeCircolari: una permanenza che attraversa la fine è una sola", () => {
  assert.deepEqual(permanenzeCircolari([1, 0, 0, 1, 1]), [[3, 4, 0]]);
});

test("ruota: la serie si sposta in avanti di s, con ritorno all'inizio", () => {
  assert.deepEqual(ruota([1, 0, 0, 0], 1), [0, 1, 0, 0]);
  assert.deepEqual(ruota([1, 0, 0, 0], 4), [1, 0, 0, 0]);
});

test("rendimentoSettimane: rendimento composto delle settimane indicate", () => {
  assert.ok(Math.abs(rendimentoSettimane([0.1, 0.2], [0, 1]) - 0.32) < 1e-12);
});

test("statisticaOsservata: somma dei rendimenti netti per operazione", () => {
  const monete = [{ R: [0.1, 0.2, -0.1], H: [0, 1, 1] }];
  assert.ok(Math.abs(statisticaOsservata(monete, COSTO) - (1.2 * 0.9 - 1 - COSTO)) < 1e-12);
});

test("giudicaRotazione: una regola che coglie i rendimenti forti passa", () => {
  const W = 50;
  const R = rendimenti(W);
  // la regola sta dentro esattamente nelle settimane di rendimento alto
  const H = R.map((r) => (r > 0.05 ? 1 : 0));
  const g = giudicaRotazione({ monete: [{ R, H }], costo: COSTO, alfa: 0.05 });
  assert.equal(g.passa, true, g.motivi.join("; "));
  assert.ok(g.p <= 0.05);
});

test("giudicaRotazione: una regola periodica, che si ripete con lo spostamento, non passa", () => {
  const W = 50;
  const R = rendimenti(W);
  // sta dentro ogni 7 settimane: gli spostamenti multipli di 7 danno lo stesso risultato, quindi p è alto
  const H = R.map((_, i) => (i % 7 === 0 ? 1 : 0));
  const g = giudicaRotazione({ monete: [{ R, H }], costo: COSTO, alfa: 0.05 });
  assert.equal(g.passa, false);
  assert.ok(g.p > 0.05);
});

test("giudicaRotazione: una somma netta negativa non passa mai", () => {
  const W = 50;
  const R = rendimenti(W);
  // sta dentro nelle settimane peggiori
  const H = R.map((r) => (r < -0.05 ? 1 : 0));
  const g = giudicaRotazione({ monete: [{ R, H }], costo: COSTO, alfa: 0.05 });
  assert.equal(g.passa, false);
  assert.ok(g.motivi.some((m) => /somma netta non positiva/.test(m)));
});
