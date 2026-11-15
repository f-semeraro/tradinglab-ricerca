import { test } from "node:test";
import assert from "node:assert/strict";

import { curvaPosizione, mediaCurve, drawdownCurva, metricheCurva, rendimentiPerAnno } from "../lib/curve.js";

const LATO = 0.0015;
const vicino = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≠ ${b}`);

test("curvaPosizione: ingresso e uscita pagano un lato ciascuno; fuori posizione la quota resta ferma", () => {
  const curva = curvaPosizione([0, 1, 1, 0], [0.5, 0.1, -0.2, 0.3], LATO);
  assert.equal(curva.length, 5);
  assert.equal(curva[0], 1);
  vicino(curva[1], 1 - LATO); // l'ingresso si paga alla fine del periodo prima
  vicino(curva[2], (1 - LATO) * 1.1);
  vicino(curva[3], (1 - LATO) * 1.1 * 0.8 * (1 - LATO));
  assert.equal(curva[4], curva[3]);
});

test("curvaPosizione: una posizione aperta al primo periodo paga l'ingresso sulla base, e una aperta all'ultimo paga l'uscita", () => {
  const curva = curvaPosizione([1, 1], [0.1, 0.1], LATO);
  vicino(curva[0], 1 - LATO);
  vicino(curva[2], (1 - LATO) * 1.1 * 1.1 * (1 - LATO));
});

test("mediaCurve: due monete uguali danno la curva di una; senza curve non c'è portafoglio", () => {
  const curva = curvaPosizione([1, 0, 1], [0.1, 0.2, -0.1], LATO);
  assert.deepEqual(mediaCurve([curva, [...curva]]), curva);
  assert.deepEqual(mediaCurve([[1, 2], [1, 4]]), [1, 3]);
  assert.throws(() => mediaCurve([]), /almeno una curva/);
});

test("drawdownCurva: la discesa più profonda da un massimo, in frazione", () => {
  vicino(drawdownCurva([1, 1.2, 0.9, 1.1]), 0.9 / 1.2 - 1);
  assert.equal(drawdownCurva([1, 1.1, 1.2]), 0);
});

test("metricheCurva: rendimento totale, annuo composto e drawdown", () => {
  const m = metricheCurva([1, 1.1, 1.21], 2);
  vicino(m.rendimento, 0.21);
  vicino(m.annuo, 0.1);
  assert.equal(m.drawdown, 0);
});

test("rendimentiPerAnno: il primo anno parte dalla base, gli altri dall'ultimo punto dell'anno prima", () => {
  const date = ["2021-01-03", "2021-06-30", "2021-12-26", "2022-06-30", "2022-12-25"];
  const curva = [1, 1.5, 2, 1, 3];
  const anni = rendimentiPerAnno(date, curva);
  assert.deepEqual(anni.map((a) => a.anno), [2021, 2022]);
  vicino(anni[0].rendimento, 1);
  vicino(anni[1].rendimento, 0.5);
  assert.throws(() => rendimentiPerAnno(date, [1, 2]), /stessa lunghezza/);
});

test("metricheCurva e rendimentiPerAnno partono dal capitale iniziale: il costo del primo ingresso conta, e gli anni composti danno il totale", () => {
  // dentro dal primo periodo: il primo punto della curva è già sotto 1, per il costo d'ingresso
  const curva = curvaPosizione([1, 1, 1, 1], [0.1, 0.1, -0.05, 0.2], LATO);
  const date = ["2021-12-19", "2021-12-26", "2022-01-02", "2022-01-09", "2022-01-16"];
  assert.ok(curva[0] < 1);
  const totale = metricheCurva(curva, 1).rendimento;
  vicino(totale, curva[4] - 1);
  const composto = rendimentiPerAnno(date, curva).reduce((capitale, a) => capitale * (1 + a.rendimento), 1) - 1;
  vicino(composto, totale);
});
