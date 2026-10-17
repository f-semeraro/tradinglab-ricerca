import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { leggiStrategia } from "../lib/configurazione.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARTELLA = path.join(RADICE, "strategie");

const file = fs.readdirSync(CARTELLA).filter((f) => f.endsWith(".json"));

test("c'è almeno una strategia da mettere alla prova", () => {
  assert.ok(file.length > 0);
});

for (const nome of file) {
  test(`${nome} passa la validazione della configurazione`, () => {
    // leggiStrategia lancia se qualcosa non torna: il test fallisce con il motivo esatto
    const strategia = leggiStrategia(path.join(CARTELLA, nome));
    assert.ok(strategia.ingresso && strategia.uscita && strategia.rischio && strategia.costi);
  });
}
