import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { nuovoStato, avanza, pianoDelGiro, ultimaCandelaElaborata } from "../lib/simulazione.js";
import { candeleNecessarie } from "../lib/configurazione.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strategiaVera = JSON.parse(fs.readFileSync(path.join(RADICE, "strategie", "rsi-base.json"), "utf8"));

// Solo RSI: con tutte e tre le condizioni insieme su una serie sintetica non scatta mai.
// Il resto della configurazione è quella vera, uscite comprese.
const strategia = {
  ...strategiaVera,
  ingresso: { ...strategiaVera.ingresso, incrocioMedie: null, volume: null }
};

const DURATA = 3600;
const BASE = 472222 * DURATA;

// Un'onda: il prezzo scende per dodici ore e risale per dodici, con un po' di deriva.
// L'RSI scende sotto la soglia a ogni discesa e le uscite scattano per profitto o per stop.
function serie(n) {
  const candele = [];
  let prezzo = 100;
  for (let i = 0; i < n; i++) {
    const variazione = i % 24 < 12 ? -0.8 : 0.9;
    const apertura = prezzo;
    prezzo = prezzo * (1 + variazione / 100 + 0.0003);
    candele.push({
      momento: BASE + i * DURATA,
      apertura,
      massimo: Math.max(apertura, prezzo) * 1.001,
      minimo: Math.min(apertura, prezzo) * 0.999,
      chiusura: prezzo,
      volume: 10 + (i % 7)
    });
  }
  return candele;
}

const nuovo = () => nuovoStato({ capitaleIniziale: 100, mercato: "SOLEUR", intervalloMinuti: 60, fusoOrario: "Europe/Rome" });
const primaValutabile = () => candeleNecessarie(strategia) - 1;

test("a uno stato nuovo il piano parte dalla prima candela valutabile", () => {
  const candele = serie(50);
  const piano = pianoDelGiro(nuovo(), candele, primaValutabile(), 60);
  assert.equal(piano.da, primaValutabile());
  assert.equal(piano.a, 50);
  assert.equal(piano.lacuna, null);
});

test("il piano riprende dopo l'ultima candela elaborata e non rifà le precedenti", () => {
  const candele = serie(50);
  const stato = nuovo();
  avanza(stato, candele, primaValutabile(), 30, strategia);
  assert.equal(ultimaCandelaElaborata(stato), candele[29].momento);

  const piano = pianoDelGiro(stato, candele, primaValutabile(), 60);
  assert.equal(piano.da, 30);
  assert.equal(piano.a, 50);
  assert.equal(piano.lacuna, null);
});

test("se non c'è niente di nuovo il piano è vuoto", () => {
  const candele = serie(50);
  const stato = nuovo();
  avanza(stato, candele, primaValutabile(), 50, strategia);

  const piano = pianoDelGiro(stato, candele, primaValutabile(), 60);
  assert.equal(piano.da, piano.a);
  assert.equal(piano.lacuna, null);
});

test("un buco nei dati si dichiara con il numero di candele, non si inventa", () => {
  const candele = serie(50);
  const stato = nuovo();
  avanza(stato, candele, primaValutabile(), 30, strategia);

  // dall'exchange arrivano le candele 30..34 in meno: la serie salta da 29 a 35
  const conBuco = [...candele.slice(0, 30), ...candele.slice(35, 50)];
  const piano = pianoDelGiro(stato, conBuco, primaValutabile(), 60);

  assert.equal(piano.lacuna.candele, 5);
  assert.equal(piano.lacuna.daMomento, candele[30].momento);
  assert.equal(piano.lacuna.aMomento, candele[34].momento);
  assert.equal(piano.da, 30);
});

test("un'istantanea per ogni candela, e l'ultima dice fino a dove si è arrivati", () => {
  const candele = serie(80);
  const stato = nuovo();
  avanza(stato, candele, primaValutabile(), candele.length, strategia);

  assert.equal(stato.istantanee.length, candele.length - primaValutabile());
  assert.equal(ultimaCandelaElaborata(stato), candele.at(-1).momento);
});

test("due tempi con una ripartenza attraverso il JSON danno lo stesso stato di una corsa sola", () => {
  const candele = serie(240);

  const unaCorsa = nuovo();
  avanza(unaCorsa, candele, primaValutabile(), candele.length, strategia);

  const dueTempi = nuovo();
  avanza(dueTempi, candele.slice(0, 100), primaValutabile(), 100, strategia);
  const ripreso = JSON.parse(JSON.stringify(dueTempi));
  const piano = pianoDelGiro(ripreso, candele, primaValutabile(), 60);
  avanza(ripreso, candele, piano.da, piano.a, strategia);

  assert.ok(unaCorsa.operazioni.length > 0, "la serie di prova deve produrre operazioni, altrimenti il confronto non dice niente");
  assert.deepEqual(ripreso, unaCorsa);
});

test("le operazioni non si sovrappongono e il capitale non va sotto zero", () => {
  const candele = serie(240);
  const stato = nuovo();
  avanza(stato, candele, primaValutabile(), candele.length, strategia);

  for (let i = 1; i < stato.operazioni.length; i++) {
    assert.ok(stato.operazioni[i - 1].momentoUscita <= stato.operazioni[i].momentoIngresso);
  }
  assert.ok(stato.capitale >= 0);
});
