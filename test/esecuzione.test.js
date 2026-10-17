import { test } from "node:test";
import assert from "node:assert/strict";

import { esecuzioneDi } from "../lib/simulazione.js";

const LAB = { mercato: "SOLEUR", intervalloMinuti: 60 };

test("esecuzioneDi: una strategia vecchia gira sul mercato e sull'intervallo del laboratorio", () => {
  assert.deepEqual(esecuzioneDi({ ingresso: {} }, LAB), { intervallo: 60, coppie: ["SOLEUR"], legacy: true });
});

test("esecuzioneDi: una strategia che dichiara intervallo e coppie gira su quelli", () => {
  const e = esecuzioneDi({ intervallo: 1440, coppie: ["XXBTZEUR", "ADAEUR"] }, LAB);
  assert.deepEqual(e, { intervallo: 1440, coppie: ["XXBTZEUR", "ADAEUR"], legacy: false });
});

test("esecuzioneDi: rifiuta intervalli e coppie che non hanno senso", () => {
  assert.throws(() => esecuzioneDi({ intervallo: 0 }, LAB), /intervallo non valido/);
  assert.throws(() => esecuzioneDi({ coppie: [] }, LAB), /coppie/);
  assert.throws(() => esecuzioneDi({ coppie: ["ADA", 3] }, LAB), /coppie/);
});
