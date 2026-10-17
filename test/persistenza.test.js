import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { scriviAtomico, leggiJson, scriviJson } from "../lib/persistenza.js";

const cartella = () => fs.mkdtempSync(path.join(os.tmpdir(), "tradinglab-ricerca-"));

test("scriviJson e leggiJson fanno il giro senza perdere niente", () => {
  const dir = cartella();
  try {
    const percorso = path.join(dir, "sotto", "stato.json");
    const dato = { istantanee: [{ momento: 1, portafoglio: 100.25 }] };
    scriviJson(percorso, dato);
    assert.deepEqual(leggiJson(percorso), dato);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("una scrittura non lascia file temporanei", () => {
  const dir = cartella();
  try {
    scriviAtomico(path.join(dir, "cursore.json"), "{}\n");
    assert.deepEqual(fs.readdirSync(dir), ["cursore.json"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("leggiJson su un file che non esiste restituisce null", () => {
  const dir = cartella();
  try {
    assert.equal(leggiJson(path.join(dir, "niente.json")), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
