import { test } from "node:test";
import assert from "node:assert/strict";

import {
  INTESTAZIONE_CSV,
  righeDi,
  candeleDaCsv,
  csvDaCandele,
  candeleDaArchivio,
  unisciCandele,
  candeleMancanti
} from "../lib/storico.js";

const GIORNO = 86400;
const candela = (momento, chiusura) => ({ momento, apertura: chiusura, massimo: chiusura + 1, minimo: chiusura - 1, chiusura, volume: 10 });

test("righeDi: LF e CRLF danno le stesse righe, senza quelle vuote", () => {
  assert.deepEqual(righeDi("a\nb\n"), ["a", "b"]);
  assert.deepEqual(righeDi("a\r\nb\r\n\r\n"), ["a", "b"]);
});

test("candeleDaCsv: lo stesso file con LF o con CRLF dà le stesse candele", () => {
  const candele = [candela(0, 100), candela(GIORNO, 101)];
  const lf = csvDaCandele(candele);
  const crlf = lf.replace(/\n/g, "\r\n");
  assert.deepEqual(candeleDaCsv(lf), candele);
  assert.deepEqual(candeleDaCsv(crlf), candele);
});

test("candeleDaCsv: un'intestazione diversa si rifiuta, non si interpreta", () => {
  assert.throws(() => candeleDaCsv("momento,chiusura,apertura,massimo,minimo,volume\n0,1,1,1,1,1\n"), /intestazione/);
  assert.throws(() => candeleDaCsv(""), /intestazione/);
});

test("candeleDaCsv: le righe guaste si scartano e l'ordine è quello del tempo", () => {
  const testo = [INTESTAZIONE_CSV, `${GIORNO},2,3,1,2,10`, "guasta,x,y", "0,1,2,0,1,10"].join("\n");
  assert.deepEqual(candeleDaCsv(testo).map((c) => c.momento), [0, GIORNO]);
});

test("candeleDaArchivio: sette colonne senza intestazione, la settima (numero di scambi) non serve", () => {
  const candele = candeleDaArchivio("86400,2,3,1,2.5,10,7\r\n0,1,2,0,1.5,20,3\r\n");
  assert.deepEqual(candele, [
    { momento: 0, apertura: 1, massimo: 2, minimo: 0, chiusura: 1.5, volume: 20 },
    { momento: 86400, apertura: 2, massimo: 3, minimo: 1, chiusura: 2.5, volume: 10 }
  ]);
});

test("unisciCandele: le vecchie restano, le nuove si aggiungono, e a parità di momento vince la nuova", () => {
  const vecchie = [candela(0, 100), candela(GIORNO, 101)];
  const nuove = [candela(GIORNO, 111), candela(2 * GIORNO, 102)];
  const unite = unisciCandele(vecchie, nuove);
  assert.deepEqual(unite.map((c) => [c.momento, c.chiusura]), [[0, 100], [GIORNO, 111], [2 * GIORNO, 102]]);
  assert.deepEqual(unisciCandele(unite, nuove), unite, "rifarlo non cambia nulla");
});

test("candeleMancanti: conta i buchi dentro la serie", () => {
  assert.equal(candeleMancanti([candela(0, 1), candela(GIORNO, 1), candela(4 * GIORNO, 1)], 1440), 2);
  assert.equal(candeleMancanti([candela(0, 1), candela(GIORNO, 1)], 1440), 0);
});
