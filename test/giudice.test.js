import { test } from "node:test";
import assert from "node:assert/strict";

import { ricollocaOperazioni, rendimentoOperazione, giudicaPermutazione } from "../lib/giudice.js";
import { generatore } from "../lib/ricerca.js";

const COSTO = 0.3; // andata e ritorno: 2 × (0,10% + 0,05%)

test("ricollocaOperazioni: stesso numero, stessa durata, senza sovrapposizioni, dentro la finestra", () => {
  const rng = generatore(11);
  const durate = [3, 5, 2, 4];
  for (let prova = 0; prova < 300; prova++) {
    const inizi = ricollocaOperazioni(rng, 60, durate);
    assert.equal(inizi.length, durate.length);
    for (let i = 0; i < durate.length; i++) {
      assert.ok(inizi[i] >= 0);
      assert.ok(inizi[i] + durate[i] <= 59, "l'ultima candela resta dentro la finestra");
      if (i > 0) assert.ok(inizi[i] >= inizi[i - 1] + durate[i - 1], "nessuna sovrapposizione");
    }
  }
});

test("ricollocaOperazioni: con lo stesso seme dà lo stesso risultato", () => {
  const a = ricollocaOperazioni(generatore(5), 100, [2, 2, 2]);
  const b = ricollocaOperazioni(generatore(5), 100, [2, 2, 2]);
  assert.deepEqual(a, b);
});

test("ricollocaOperazioni: senza operazioni non ricolloca niente, e se non ci stanno lancia un errore", () => {
  assert.deepEqual(ricollocaOperazioni(generatore(1), 10, []), []);
  assert.throws(() => ricollocaOperazioni(generatore(1), 5, [3, 3]), /non stanno/);
});

test("rendimentoOperazione: lordo close to close, netto al netto dei costi", () => {
  const r = rendimentoOperazione([100, 105], 0, 1, COSTO);
  assert.ok(Math.abs(r.lordo - 5) < 1e-12);
  assert.ok(Math.abs(r.netto - 4.7) < 1e-12);
});

/** Prezzi piatti a 100, con un picco isolato a 105 ogni 10 candele. */
function picchi(W) {
  return Array.from({ length: W }, (_, i) => (i % 10 === 0 ? 105 : 100));
}

test("giudica: operazioni scelte sui picchi battono le ricollocazioni e passano", () => {
  const W = 200;
  const prezzi = picchi(W);
  // entra la candela prima del picco ed esce sul picco: +5% lordo ogni volta
  const operazioni = Array.from({ length: 15 }, (_, k) => ({ inizio: 10 * (k + 1) - 1, fine: 10 * (k + 1) }));
  const g = giudicaPermutazione({
    gruppi: [{ prezzi, W, operazioni }],
    costoAndataRitorno: COSTO,
    permutazioni: 2000,
    rng: generatore(7),
    N: 1,
    alfa: 0.05
  });
  assert.equal(g.passa, true, g.motivi.join("; "));
  assert.ok(g.statisticaNetta > 0);
  assert.ok(g.p <= 0.05);
});

test("giudica: operazioni prese a caso non passano", () => {
  const W = 200;
  const prezzi = picchi(W);
  const durate = Array.from({ length: 15 }, () => 1);
  const inizi = ricollocaOperazioni(generatore(99), W, durate);
  const operazioni = inizi.map((inizio) => ({ inizio, fine: inizio + 1 }));
  const g = giudicaPermutazione({
    gruppi: [{ prezzi, W, operazioni }],
    costoAndataRitorno: COSTO,
    permutazioni: 2000,
    rng: generatore(8),
    N: 1,
    alfa: 0.05
  });
  assert.equal(g.passa, false);
  assert.ok(g.motivi.some((m) => /p /.test(m)));
});

test("giudica: un risultato netto negativo non passa, anche con un p basso", () => {
  const W = 200;
  const prezzi = Array.from({ length: W }, () => 100);
  const operazioni = Array.from({ length: 10 }, (_, k) => ({ inizio: 10 * k, fine: 10 * k + 1 }));
  const g = giudicaPermutazione({
    gruppi: [{ prezzi, W, operazioni }],
    costoAndataRitorno: COSTO,
    permutazioni: 500,
    rng: generatore(3),
    N: 1,
    alfa: 0.05
  });
  assert.equal(g.passa, false);
  assert.ok(g.motivi.some((m) => /netto non positivo/.test(m)));
});

test("giudica: più ipotesi provate significano una soglia più severa", () => {
  const prezzi = picchi(200);
  const operazioni = Array.from({ length: 15 }, (_, k) => ({ inizio: 10 * (k + 1) - 1, fine: 10 * (k + 1) }));
  const base = { gruppi: [{ prezzi, W: 200, operazioni }], costoAndataRitorno: COSTO, permutazioni: 2000, alfa: 0.05 };
  const pochi = giudicaPermutazione({ ...base, rng: generatore(7), N: 1 });
  const molti = giudicaPermutazione({ ...base, rng: generatore(7), N: 1000 });
  assert.ok(molti.soglia < pochi.soglia);
});
