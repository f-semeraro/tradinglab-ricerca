import { test } from "node:test";
import assert from "node:assert/strict";

import { serieGiornaliera, esposizione } from "../lib/giornaliera.js";

const GIORNO = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const candeleDa = (inizio, prezzi) =>
  prezzi.map((close, i) => ({ date: iso(Date.parse(inizio) + i * GIORNO), close }));

test("serieGiornaliera: il giorno senza candela riporta l'ultima chiusura e presente è falso", () => {
  const candele = [
    { date: "2020-01-01", close: 10 },
    { date: "2020-01-03", close: 12 }
  ];
  const serie = serieGiornaliera(candele, "2020-01-03", "2020-01-01");
  assert.deepEqual(serie.close, [10, 10, 12]);
  assert.deepEqual(serie.presente, [true, false, true]);
});

test("esposizione: un salto del rendimento a 7 giorni porta a 7 giorni dentro, poi l'uscita", () => {
  // 30 giorni piatti, poi un salto del 10%: il segnale scatta al giorno 30
  const prezzi = [...Array(30).fill(100), ...Array(30).fill(110)];
  const serie = serieGiornaliera(candeleDa("2020-01-01", prezzi), "2020-02-29", "2020-01-01");
  const expo = esposizione(serie, prezzi.length - 1);
  assert.equal(expo[30], 0);
  assert.deepEqual(expo.slice(31, 38), [1, 1, 1, 1, 1, 1, 1]);
  assert.equal(expo[38], 0);
});

test("esposizione: il segnale che persiste tiene dentro, senza uscita", () => {
  // prezzi che accelerano: il rendimento a 7 giorni cresce ogni giorno e supera sempre il percentile
  const prezzi = [...Array(30).fill(100), ...Array.from({ length: 30 }, (_, i) => 100 * (1 + 0.001 * (i + 1) * (i + 1)))];
  const serie = serieGiornaliera(candeleDa("2020-01-01", prezzi), "2020-02-29", "2020-01-01");
  const expo = esposizione(serie, prezzi.length - 1);
  assert.ok(expo.slice(31, 59).every((x) => x === 1), "dentro dal giorno 31 fino alla penultima candela");
});
