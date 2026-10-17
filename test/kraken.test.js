import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizzaRigheOHLC, candeleChiuse } from "../lib/kraken.js";

// Kraken manda i prezzi come stringhe; la settima colonna è il volume
const riga = (momento, chiusura = "100.5", massimo = "101", minimo = "99") =>
  [momento, "100", massimo, minimo, chiusura, "100.2", "12.5", 7];

test("le righe di Kraken diventano numeri, in ordine, senza le guaste", () => {
  const righe = [
    riga(3600, "102"),
    riga(0, "100"),
    ["rotta"],                                  // troppo corta
    [7200, "x", "101", "99", "100", "1", "1", 1], // prezzo che non è un numero
    riga(1800, "101", "90", "100")              // massimo sotto il minimo
  ];

  const candele = normalizzaRigheOHLC(righe);

  assert.deepEqual(candele.map((c) => c.momento), [0, 3600]);
  assert.equal(candele[1].chiusura, 102);
  assert.equal(candele[0].volume, 12.5);
  assert.equal(typeof candele[0].apertura, "number");
});

/** Finge fetch: restituisce la risposta data, senza rete. Ripristina sempre quello vero. */
async function conFetchFinto(risposta, funzione) {
  const originale = globalThis.fetch;
  globalThis.fetch = async () => risposta;
  try {
    return await funzione();
  } finally {
    globalThis.fetch = originale;
  }
}

const corpo = (righe) => new Response(JSON.stringify({ error: [], result: { SOLEUR: righe, last: 1 } }), { status: 200 });

test("l'ultima candela ancora in corso viene scartata", async () => {
  const righe = [riga(0), riga(3600), riga(7200)];
  // alle 9000 la candela delle 7200 (fino alle 10800) è ancora in corso
  const { candele, errore } = await conFetchFinto(corpo(righe), () =>
    candeleChiuse({ coppia: "SOLEUR", intervalloMinuti: 60, adessoMs: 9000 * 1000 })
  );

  assert.equal(errore, null);
  assert.deepEqual(candele.map((c) => c.momento), [0, 3600]);
});

test("un errore dell'exchange torna come errore, senza lanciare", async () => {
  const risposta = new Response(JSON.stringify({ error: ["EGeneral:Too many requests"], result: {} }), { status: 200 });
  const { candele, errore } = await conFetchFinto(risposta, () =>
    candeleChiuse({ coppia: "SOLEUR", intervalloMinuti: 60, adessoMs: Date.now() })
  );

  assert.deepEqual(candele, []);
  assert.match(errore, /Too many requests/);
});

test("una risposta HTTP non riuscita torna come errore", async () => {
  const { candele, errore } = await conFetchFinto(new Response("", { status: 503 }), () =>
    candeleChiuse({ coppia: "SOLEUR", intervalloMinuti: 60, adessoMs: Date.now() })
  );

  assert.deepEqual(candele, []);
  assert.match(errore, /503/);
});

test("la rete che cade torna come errore, senza lanciare", async () => {
  const originale = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("connessione interrotta"); };
  try {
    const { candele, errore } = await candeleChiuse({ coppia: "SOLEUR", intervalloMinuti: 60, adessoMs: Date.now() });
    assert.deepEqual(candele, []);
    assert.equal(errore, "connessione interrotta");
  } finally {
    globalThis.fetch = originale;
  }
});
