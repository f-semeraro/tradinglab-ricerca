import { test } from "node:test";
import assert from "node:assert/strict";

import { numero, percento, cella, dataISO, dataOraUTC } from "../lib/formato.js";

test("numero: virgola decimale, e un trattino al posto di un dato che manca", () => {
  assert.equal(numero(1234.5), "1234,50");
  assert.equal(numero(0.126, 1), "0,1");
  assert.equal(numero(NaN), "—");
  assert.equal(numero(null), "—");
  assert.equal(numero(Infinity), "—");
});

test("percento: una frazione diventa una percentuale", () => {
  assert.equal(percento(0.1234), "12,34%");
  assert.equal(percento(-0.5, 0), "-50%");
  assert.equal(percento(undefined), "—");
});

test("cella: niente barre verticali né a capo, che romperebbero la tabella", () => {
  const pulita = cella("  prima | seconda\r\nterza  ");
  assert.doesNotMatch(pulita, /[|\r\n]/);
  assert.equal(pulita, "prima   seconda terza");
  assert.equal(cella(42), "42");
});

test("dataISO e dataOraUTC: sempre in UTC", () => {
  const ms = Date.UTC(2026, 10, 1, 17, 4, 59);
  assert.equal(dataISO(ms), "2026-11-01");
  assert.equal(dataOraUTC(ms), "2026-11-01 17:04");
});
