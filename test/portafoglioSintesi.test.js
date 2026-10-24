import { test } from "node:test";
import assert from "node:assert/strict";

import { lunediSeraRoma, domenicaDaElaborare, metriche, curvaMedia, monetePiuIndietro } from "../lib/portafoglioSintesi.js";

test("lunediSeraRoma: 23:59 ora di Roma, con l'ora legale e senza", () => {
  // domenica 4 gennaio 2026: Roma è UTC+1, quindi lunedì 5 alle 23:59 locali sono 22:59 UTC
  assert.equal(new Date(lunediSeraRoma("2026-01-04")).toISOString(), "2026-01-05T22:59:00.000Z");
  // domenica 5 luglio 2026: Roma è UTC+2
  assert.equal(new Date(lunediSeraRoma("2026-07-05")).toISOString(), "2026-07-06T21:59:00.000Z");
});

test("domenicaDaElaborare: finché il lunedì sera non è passato, la domenica da elaborare è quella precedente", () => {
  // martedì 6 gennaio 2026 alle 10:00 UTC: la domenica 4 è chiusa e la sua scadenza è passata
  assert.equal(domenicaDaElaborare(Date.parse("2026-01-06T10:00:00Z")), "2026-01-04");
  // lunedì 5 gennaio alle 12:00 UTC: la scadenza della domenica 4 è alle 23:59 di Roma, non ancora passata
  assert.equal(domenicaDaElaborare(Date.parse("2026-01-05T12:00:00Z")), "2025-12-28");
});

test("metriche: rendimento e drawdown di una curva in base 100", () => {
  const curva = [100, 120, 90, 110].map((valore, i) => ({ momento: i, valore }));
  const m = metriche(curva);
  assert.ok(Math.abs(m.rendimento - 0.1) < 1e-12);
  assert.ok(Math.abs(m.drawdown - (90 / 120 - 1)) < 1e-12);
});

test("curvaMedia e monetePiuIndietro: media delle monete presenti per momento, e storico da completare", () => {
  const elementi = [
    { coppia: "AEUR", stato: { istantanee: [{ momento: 1, portafoglio: 110, mercato: 120 }] }, storia: [{ data: "2026-01-04" }] },
    { coppia: "BEUR", stato: { istantanee: [{ momento: 1, portafoglio: 90, mercato: 80 }] }, storia: [{ data: "2025-12-28" }] }
  ];
  const curva = curvaMedia(elementi, 100, "portafoglio");
  assert.equal(curva.length, 1);
  assert.ok(Math.abs(curva[0].valore - 100) < 1e-12);
  assert.deepEqual(monetePiuIndietro(elementi, Date.parse("2026-01-06T10:00:00Z")), ["BEUR"]);
});
