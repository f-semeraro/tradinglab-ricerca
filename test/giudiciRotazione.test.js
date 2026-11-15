import { test } from "node:test";
import assert from "node:assert/strict";

import { giudicaRotazione, statisticaRuotata } from "../lib/rotazione.js";
import { giudica } from "../lib/bSettimane.js";
import { giudicaGiornaliera } from "../lib/giornaliera.js";

const COSTO = 0.003;
const fraz = (x) => x - Math.floor(x);
/** Rendimenti pseudocasuali, deterministici, tra −10% e +10%; il seme cambia la serie. */
const casuali = (W, seme) => Array.from({ length: W }, (_, i) => (fraz(Math.sin(i * 12.9898 + seme) * 43758.5453) - 0.5) * 0.2);

/** Tre monete: la seconda esce dal listino dopo il periodo 150, e da lì non ha posizioni. */
function monete(W) {
  return [1, 2, 3].map((seme) => {
    const R = casuali(W, seme);
    const attiva = Array.from({ length: W }, (_, i) => (seme === 2 && i >= 150 ? 0 : 1));
    const H = R.map((r, i) => (r > 0.04 && attiva[i] === 1 ? 1 : 0));
    return { R, H, attiva };
  });
}

test("giudicaRotazione: dichiarare tutte le monete sempre attive non cambia nulla", () => {
  const W = 200;
  const conAttiva = monete(W).map((m) => ({ ...m, attiva: Array(W).fill(1) }));
  const senza = conAttiva.map(({ R, H }) => ({ R, H }));
  assert.deepEqual(
    giudicaRotazione({ monete: conAttiva, costo: COSTO, alfa: 0.05, escludi: 4 }),
    giudicaRotazione({ monete: senza, costo: COSTO, alfa: 0.05, escludi: 4 })
  );
});

test("statisticaRuotata: una posizione ruotata dove la moneta è fuori dal listino non genera operazioni", () => {
  const W = 200;
  const H = Array.from({ length: W }, (_, i) => (i < 10 ? 1 : 0));
  const R = Array(W).fill(0.05);
  const attiva = Array.from({ length: W }, (_, i) => (i < 100 ? 1 : 0));
  assert.equal(statisticaRuotata([{ R, H, attiva }], 120, COSTO), 0);
  assert.ok(statisticaRuotata([{ R, H }], 120, COSTO) > 0);
});

test("i tre giudici a rotazione danno lo stesso giudizio: generico, settimanale dei test eseguiti, giornaliero della prova in corso", () => {
  for (const [W, escludi] of [[200, 4], [364, 28]]) {
    const m = monete(W);
    const generico = giudicaRotazione({ monete: m, costo: COSTO, alfa: 0.05, escludi });
    const settimanale = giudica(m.map(({ R, H, attiva }) => ({ H, R0: R, attiva })), { costo: COSTO, alfa: 0.05, escludi });
    const giornaliero = giudicaGiornaliera({ monete: m.map(({ R, H, attiva }) => ({ e: H, R, attiva })), costo: COSTO, alfa: 0.05, escludi });

    for (const altro of [settimanale, giornaliero]) {
      assert.equal(altro.p, generico.p);
      assert.equal(altro.spostamenti, generico.spostamenti);
      assert.equal(altro.passa, generico.passa);
      assert.ok(Math.abs(altro.osservata - generico.osservata) < 1e-12);
    }
    assert.equal(generico.spostamenti, W - 1 - 2 * escludi);
  }
});
