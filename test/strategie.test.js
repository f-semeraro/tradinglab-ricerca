import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { leggiStrategia } from "../lib/configurazione.js";
import { problemiSettimanale } from "../lib/prova.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARTELLA = path.join(RADICE, "strategie");

const file = fs.readdirSync(CARTELLA).filter((f) => f.endsWith(".json"));

test("c'è almeno una strategia da mettere alla prova", () => {
  assert.ok(file.length > 0);
});

for (const nome of file) {
  test(`${nome} passa la validazione della configurazione`, () => {
    const percorso = path.join(CARTELLA, nome);
    const grezza = JSON.parse(fs.readFileSync(percorso, "utf8"));
    // le strategie settimanali (la prova di Liu e Tsyvinski) hanno il loro validatore
    if (grezza.tipo === "settimanale") {
      assert.deepEqual(problemiSettimanale(grezza), []);
      return;
    }
    // leggiStrategia lancia se qualcosa non torna: il test fallisce con il motivo esatto
    const strategia = leggiStrategia(percorso);
    assert.ok(strategia.ingresso && strategia.uscita && strategia.rischio && strategia.costi);
  });
}
