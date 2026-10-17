import { test } from "node:test";
import assert from "node:assert/strict";

import { bloccoAttivo } from "../lib/blocchi.js";

test("un blocco è acceso solo se esiste: null e assente sono lo stesso spegnimento", () => {
  assert.equal(bloccoAttivo(null), false);
  assert.equal(bloccoAttivo(undefined), false);
  assert.equal(bloccoAttivo({ periodi: 14 }), true);
});

test("zero e stringa vuota sono valori, non spegnimenti", () => {
  // un blocco con un campo a zero è acceso: a validarlo ci pensa configurazione.js
  assert.equal(bloccoAttivo(0), true);
  assert.equal(bloccoAttivo(""), true);
});
