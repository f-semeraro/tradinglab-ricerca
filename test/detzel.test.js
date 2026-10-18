import { test } from "node:test";
import assert from "node:assert/strict";

import {
  segnali,
  esposizione,
  mediaEsposizioni,
  turnoverLineare,
  turnoverCircolare,
  curvaEsposizione,
  statisticaMedia,
  giudicaEsposizione,
  costoDiPareggio
} from "../lib/detzel.js";

const COSTO = 0.0015;
const fraz = (x) => x - Math.floor(x);
/** Rendimenti giornalieri pseudocasuali, deterministici, tra −10% e +10%, senza periodicità evidente. */
const casuali = (W) => Array.from({ length: W }, (_, i) => (fraz(Math.sin(i * 12.9898 + 1) * 43758.5453) - 0.5) * 0.2);

test("segnali: la media logaritmica include il giorno corrente; il segnale è stretto", () => {
  // ln 4, ln 2, ln 8: al giorno 1 il logaritmo di 2 sta sotto la media di 4 e 2; al giorno 2 sta sopra quella di 2 e 8
  assert.deepEqual(segnali([4, 2, 8], 2), [null, 0, 1]);
});

test("esposizione: il giorno d usa il segnale del giorno d−1, e nessun dato successivo", () => {
  assert.deepEqual(esposizione([null, 0, 1]), [null, null, 0]);
  // cambiare la chiusura dell'ultimo giorno non cambia l'esposizione dei giorni precedenti
  const a = esposizione(segnali([4, 2, 8, 1], 2));
  const b = esposizione(segnali([4, 2, 8, 100], 2));
  assert.deepEqual(a.slice(0, 3), b.slice(0, 3));
});

test("mediaEsposizioni: media a pesi uguali, giorno per giorno; null dove una manca", () => {
  assert.deepEqual(mediaEsposizioni([[1, 0], [0, 0.5]]), [0.5, 0.25]);
  assert.deepEqual(mediaEsposizioni([[null, 1], [0, 1]]), [null, 1]);
});

test("turnover: lineare con posizione piatta ai bordi; circolare sulla serie chiusa", () => {
  assert.equal(turnoverLineare([1, 1, 0]), 2);
  // la permanenza che attraversa la fine vale una sola volta nella serie circolare, due volte nella lineare
  assert.equal(turnoverCircolare([1, 0, 1, 1]), 2);
  assert.equal(turnoverLineare([1, 0, 1, 1]), 4);
});

test("statisticaMedia: esposizione per rendimento, meno i costi dei cambi, diviso per i giorni", () => {
  const R = [0.1, 0.2, -0.1];
  assert.ok(Math.abs(statisticaMedia([1, 1, 0], R, COSTO) - (0.3 - COSTO * 2) / 3) < 1e-12);
});

test("curvaEsposizione: rendimento netto giorno per giorno, uscita finale alla chiusura", () => {
  const R = [0.1, 0.2, -0.1];
  const curva = curvaEsposizione([1, 1, 0], R, COSTO);
  assert.equal(curva.length, 4);
  const atteso = (1 + 0.1 - COSTO) * (1 + 0.2) * (1 + 0 - COSTO);
  assert.ok(Math.abs(curva[3] - atteso) < 1e-12);
});

test("giudicaEsposizione: un'esposizione allineata ai rendimenti positivi passa", () => {
  const W = 200;
  const R = casuali(W);
  const e = R.map((r) => (r > 0 ? 1 : 0));
  const g = giudicaEsposizione({ e, R, costo: COSTO, alfa: 0.05 / 6, escludi: 30 });
  assert.equal(g.spostamenti, 139);
  assert.equal(g.passa, true, g.motivi.join("; "));
});

test("giudicaEsposizione: un'esposizione sui giorni negativi non passa, per rendimento totale negativo", () => {
  const W = 200;
  const R = casuali(W);
  const e = R.map((r) => (r < 0 ? 1 : 0));
  const g = giudicaEsposizione({ e, R, costo: COSTO, alfa: 0.05 / 6, escludi: 30 });
  assert.equal(g.passa, false);
  assert.ok(g.motivi.some((m) => /rendimento netto totale non positivo/.test(m)));
});

test("costoDiPareggio: il buy and hold non ha pareggio; altrimenti il vantaggio si annulla a quel costo", () => {
  const R = [0.1, -0.2, 0.3];
  assert.equal(costoDiPareggio([1, 1, 1], R), null);
  // due permanenze contro una: la regola cambia il doppio, e il vantaggio è zero a 0,1 per lato
  const e = [1, 0, 1];
  const c = costoDiPareggio(e, R);
  assert.ok(Math.abs(c - 0.1) < 1e-12);
  const vantaggio = statisticaMedia(e, R, c) - statisticaMedia([1, 1, 1], R, c);
  assert.ok(Math.abs(vantaggio) < 1e-12);
});
