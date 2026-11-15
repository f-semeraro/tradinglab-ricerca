import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  scriviAtomico,
  leggiJson,
  scriviJson,
  leggiStoriaSettimanale,
  scriviStoriaSettimanale,
  leggiCandele,
  scriviCandele,
  leggiArchivio,
  aggiungiAlRegistro
} from "../lib/persistenza.js";

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

test("leggiStoriaSettimanale: con CRLF una domenica senza candela resta un dato mancante, non un prezzo zero", () => {
  const dir = cartella();
  try {
    const percorso = path.join(dir, "XBTEUR.csv");
    fs.writeFileSync(percorso, "data,chiusura\r\n2020-01-05,100.5\r\n2020-01-12,\r\n2020-01-19,101\r\n", "utf8");
    assert.deepEqual(leggiStoriaSettimanale(percorso), [
      { data: "2020-01-05", chiusura: 100.5 },
      { data: "2020-01-12", chiusura: null },
      { data: "2020-01-19", chiusura: 101 }
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scriviStoriaSettimanale e leggiStoriaSettimanale fanno il giro, e un file che non c'è è una storia vuota", () => {
  const dir = cartella();
  try {
    const percorso = path.join(dir, "storia.csv");
    assert.deepEqual(leggiStoriaSettimanale(percorso), []);
    const storia = [{ data: "2020-01-05", chiusura: 100.5 }, { data: "2020-01-12", chiusura: null }];
    scriviStoriaSettimanale(percorso, storia);
    assert.deepEqual(leggiStoriaSettimanale(percorso), storia);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scriviCandele e leggiCandele fanno il giro, anche se git ha riscritto i fine riga", () => {
  const dir = cartella();
  try {
    const percorso = path.join(dir, "SOLEUR-60.csv");
    const candele = [
      { momento: 0, apertura: 1, massimo: 2, minimo: 0.5, chiusura: 1.5, volume: 10 },
      { momento: 3600, apertura: 1.5, massimo: 2.5, minimo: 1, chiusura: 2, volume: 12 }
    ];
    scriviCandele(percorso, candele);
    assert.deepEqual(leggiCandele(percorso), candele);
    fs.writeFileSync(percorso, fs.readFileSync(percorso, "utf8").replace(/\n/g, "\r\n"), "utf8");
    assert.deepEqual(leggiCandele(percorso), candele);
    assert.throws(() => leggiCandele(path.join(dir, "niente.csv")), /manca/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("leggiArchivio: una coppia che non è in archivio è null, non un errore", () => {
  const dir = cartella();
  try {
    assert.equal(leggiArchivio(path.join(dir, "XXXEUR_1440.csv")), null);
    fs.writeFileSync(path.join(dir, "XBTEUR_1440.csv"), "0,1,2,0,1.5,20,3\n", "utf8");
    assert.deepEqual(leggiArchivio(path.join(dir, "XBTEUR_1440.csv")), [{ momento: 0, apertura: 1, massimo: 2, minimo: 0, chiusura: 1.5, volume: 20 }]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("aggiungiAlRegistro: crea il registro con la sua intestazione, poi aggiunge solo in coda", () => {
  const dir = cartella();
  try {
    const percorso = path.join(dir, "registro", "esperimenti.md");
    aggiungiAlRegistro(percorso, "| prima |");
    const dopoLaPrima = fs.readFileSync(percorso, "utf8");
    assert.ok(dopoLaPrima.startsWith("# Registro degli esperimenti"));
    aggiungiAlRegistro(percorso, "| seconda |");
    assert.equal(fs.readFileSync(percorso, "utf8"), dopoLaPrima + "| seconda |\n");

    // un registro senza a capo finale: la riga nuova non si incolla all'ultima
    fs.writeFileSync(percorso, "| ultima |", "utf8");
    aggiungiAlRegistro(percorso, "| nuova |");
    assert.equal(fs.readFileSync(percorso, "utf8"), "| ultima |\n| nuova |\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
