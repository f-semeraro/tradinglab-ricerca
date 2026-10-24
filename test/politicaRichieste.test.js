import { test } from "node:test";
import assert from "node:assert/strict";

import { domenicaChiusa, richiesteDaFare } from "../lib/politicaRichieste.js";

// 2026-10-25 è una domenica, 2026-10-26 un lunedì
test("domenicaChiusa: la domenica si chiude il lunedì alle 00:00 UTC", () => {
  assert.equal(domenicaChiusa(Date.parse("2026-10-26T00:30:00Z")), "2026-10-25");
  assert.equal(domenicaChiusa(Date.parse("2026-10-25T23:00:00Z")), "2026-10-18");
  assert.equal(domenicaChiusa(Date.parse("2026-10-26T23:59:00Z")), "2026-10-25");
});

test("richiesteDaFare: la giornaliera si ripete solo se la domenica non è ancora registrata come ottenuta", () => {
  const adesso = Date.parse("2026-10-26T00:30:00Z");
  assert.equal(richiesteDaFare({ adessoMs: adesso, ultimaGiornaliera: "2026-10-18", ultimaOraria: null }).giornaliera, true);
  assert.equal(richiesteDaFare({ adessoMs: adesso, ultimaGiornaliera: "2026-10-25", ultimaOraria: null }).giornaliera, false);
});

test("richiesteDaFare: l'oraria del lunedì parte dopo le 01:00 UTC, una sola volta per settimana", () => {
  const prima = Date.parse("2026-10-26T00:30:00Z");
  const dopo = Date.parse("2026-10-26T01:30:00Z");
  assert.equal(richiesteDaFare({ adessoMs: prima, ultimaGiornaliera: "2026-10-25", ultimaOraria: null }).oraria, false);
  assert.equal(richiesteDaFare({ adessoMs: dopo, ultimaGiornaliera: "2026-10-25", ultimaOraria: null }).oraria, true);
  assert.equal(richiesteDaFare({ adessoMs: dopo, ultimaGiornaliera: "2026-10-25", ultimaOraria: "2026-10-25" }).oraria, false);
});
