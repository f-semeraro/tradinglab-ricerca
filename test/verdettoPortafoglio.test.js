import { test } from "node:test";
import assert from "node:assert/strict";

import { verdettoDovuto, allarmeGiro } from "../lib/verdettoPortafoglio.js";

const ORA = 3600000;

test("verdettoDovuto: non è dovuto finché mancano settimane o operazioni", () => {
  assert.equal(verdettoDovuto({ settimaneTrascorse: 51, operazioniChiuse: 150 }).dovuto, false);
  assert.equal(verdettoDovuto({ settimaneTrascorse: 60, operazioniChiuse: 99 }).dovuto, false);
  const primo = verdettoDovuto({ settimaneTrascorse: 52, operazioniChiuse: 40 });
  assert.deepEqual(primo.mancano, { settimane: 0, operazioni: 60 });
});

test("verdettoDovuto: è dovuto quando arrivano entrambi i traguardi, il più tardi dei due", () => {
  assert.equal(verdettoDovuto({ settimaneTrascorse: 52, operazioniChiuse: 100 }).dovuto, true);
  assert.equal(verdettoDovuto({ settimaneTrascorse: 80, operazioniChiuse: 100 }).dovuto, true);
});

test("allarmeGiro: scatta senza giri registrati o oltre 24 ore, altrimenti no", () => {
  const adesso = Date.parse("2026-11-02T12:00:00Z");
  assert.equal(allarmeGiro({ ultimoGiroMs: null, adessoMs: adesso }).attivo, true);
  assert.equal(allarmeGiro({ ultimoGiroMs: adesso - 25 * ORA, adessoMs: adesso }).attivo, true);
  assert.equal(allarmeGiro({ ultimoGiroMs: adesso - 23 * ORA, adessoMs: adesso }).attivo, false);
  assert.match(allarmeGiro({ ultimoGiroMs: adesso - 25 * ORA, adessoMs: adesso }).motivo, /25,0 ore/);
});
