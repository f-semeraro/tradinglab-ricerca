import { test } from "node:test";
import assert from "node:assert/strict";

import { macdUltimo, bandeUltime } from "../lib/indicatori.js";

const vicino = (ottenuto, atteso, tolleranza = 1e-9) =>
  assert.ok(
    Math.abs(ottenuto - atteso) < tolleranza,
    `atteso ${atteso}, ottenuto ${ottenuto} (differenza ${Math.abs(ottenuto - atteso)})`
  );

/* ------------------------ bande di Bollinger ------------------------ */

test("bandeUltime: media e deviazione standard calcolate a mano", () => {
  // valori 1..5: media 3, varianza (4+1+0+1+4)/5 = 2, deviazione √2
  const bande = bandeUltime([1, 2, 3, 4, 5], 5, 1);
  vicino(bande.centrale, 3);
  vicino(bande.inferiore, 3 - Math.SQRT2);
  vicino(bande.superiore, 3 + Math.SQRT2);
});

test("bandeUltime: con prezzi tutti uguali le tre bande coincidono", () => {
  const bande = bandeUltime(Array(20).fill(7), 20, 2);
  assert.equal(bande.inferiore, 7);
  assert.equal(bande.centrale, 7);
  assert.equal(bande.superiore, 7);
});

test("bandeUltime: senza abbastanza valori restituisce null, mai un numero inventato", () => {
  assert.equal(bandeUltime([1, 2], 5, 2), null);
  assert.equal(bandeUltime([1, 2, 3], 3, 0), null, "zero deviazioni non è una banda");
});

/* -------------------------------- MACD -------------------------------- */

test("macdUltimo: su prezzi piatti linea MACD e linea di segnale valgono zero", () => {
  const misura = macdUltimo(Array(40).fill(10));
  assert.equal(misura.macd, 0);
  assert.equal(misura.segnale, 0);
});

test("macdUltimo: dopo un rialzo netto la linea sta sopra il segnale, dopo un ribasso sotto", () => {
  const rialzo = [...Array(35).fill(100), 102, 104, 106, 108, 110];
  const ribasso = [...Array(35).fill(100), 98, 96, 94, 92, 90];

  const su = macdUltimo(rialzo);
  assert.ok(su.macd > su.segnale, `rialzo: ${su.macd} dovrebbe stare sopra ${su.segnale}`);

  const giu = macdUltimo(ribasso);
  assert.ok(giu.macd < giu.segnale, `ribasso: ${giu.macd} dovrebbe stare sotto ${giu.segnale}`);
});

test("macdUltimo: servono lenta + segnale - 1 valori, né uno di meno", () => {
  // lenta 26 e segnale 9: 26 + 9 - 1 = 34
  assert.equal(macdUltimo(Array(33).fill(1), 12, 26, 9), null);
  assert.notEqual(macdUltimo(Array(34).fill(1), 12, 26, 9), null);
});

test("macdUltimo: una veloce non più corta della lenta non è un MACD", () => {
  assert.equal(macdUltimo(Array(60).fill(1), 26, 12, 9), null);
  assert.equal(macdUltimo(Array(60).fill(1), 12, 12, 9), null);
});
