import { test } from "node:test";
import assert from "node:assert/strict";

import {
  mediaSemplice,
  serieMediaSemplice,
  mediaEsponenziale,
  rsi,
  rapportoVolume,
  incrocio,
  incrocioRecente,
  massimoPrecedente,
  variazioneSuPeriodo,
  sopra
} from "../lib/indicatori.js";

const vicino = (ottenuto, atteso, tolleranza = 1e-9) =>
  assert.ok(
    Math.abs(ottenuto - atteso) < tolleranza,
    `atteso ${atteso}, ottenuto ${ottenuto} (differenza ${Math.abs(ottenuto - atteso)})`
  );

/* ------------------------------ medie ------------------------------ */

test("mediaSemplice: media dei 5 valori, calcolata a mano", () => {
  // (1+2+3+4+5)/5 = 3
  assert.equal(mediaSemplice([1, 2, 3, 4, 5], 5), 3);
  // solo gli ultimi 3: (3+4+5)/3 = 4
  assert.equal(mediaSemplice([1, 2, 3, 4, 5], 3), 4);
});

test("mediaSemplice: senza abbastanza valori restituisce null, mai un numero approssimato", () => {
  assert.equal(mediaSemplice([1, 2], 5), null);
  assert.equal(mediaSemplice([], 3), null);
  assert.equal(mediaSemplice([1, 2, NaN], 3), null);
});

test("serieMediaSemplice: null in testa, poi i valori, allineata all'input", () => {
  const serie = serieMediaSemplice([1, 2, 3, 4, 5], 3);
  assert.equal(serie.length, 5);
  assert.deepEqual(serie.slice(0, 2), [null, null]);
  assert.equal(serie[2], 2); // (1+2+3)/3
  assert.equal(serie[3], 3); // (2+3+4)/3
  assert.equal(serie[4], 4); // (3+4+5)/3
});

test("mediaEsponenziale: parte dalla media semplice dei primi N, poi pesa", () => {
  // valori [1,2,3,4,5], periodi 3.
  // partenza = (1+2+3)/3 = 2 · peso = 2/(3+1) = 0,5
  // dopo il 4: 4·0,5 + 2·0,5 = 3
  // dopo il 5: 5·0,5 + 3·0,5 = 4
  vicino(mediaEsponenziale([1, 2, 3, 4, 5], 3), 4);
});

test("mediaEsponenziale: su valori costanti resta quel valore", () => {
  vicino(mediaEsponenziale(new Array(30).fill(10), 9), 10);
});

test("mediaEsponenziale: senza abbastanza valori, null", () => {
  assert.equal(mediaEsponenziale([1, 2], 9), null);
});

/* ------------------------------- RSI -------------------------------- */

test("rsi: solo salite valgono 100, solo discese valgono 0", () => {
  const salita = Array.from({ length: 20 }, (_, i) => 100 + i);
  const discesa = Array.from({ length: 20 }, (_, i) => 100 - i);
  assert.equal(rsi(salita, 14), 100);
  assert.equal(rsi(discesa, 14), 0);
});

test("rsi: usa lo smorzamento di Wilder, non la media semplice", () => {
  // 15 prezzi = 14 differenze: sette da +2 e sette da −1.
  // prima media: guadagni (7·2)/14 = 1 · perdite (7·1)/14 = 0,5
  const prezzi = [100, 102, 101, 103, 102, 104, 103, 105, 104, 106, 105, 107, 106, 108, 107];
  assert.equal(prezzi.length, 15);

  // aggiungiamo una differenza di +3: qui Wilder e media semplice divergono.
  // guadagni = (1·13 + 3)/14 = 16/14 = 1,142857…
  // perdite  = (0,5·13 + 0)/14 = 6,5/14 = 0,464285…
  // RS = 2,461538…  ->  RSI = 100 − 100/(1+RS) = 71,111…
  const conSpinta = [...prezzi, 110];
  vicino(rsi(conSpinta, 14), 71.11111111111111, 1e-9);
});

test("rsi: servono almeno N+1 valori, altrimenti null", () => {
  assert.equal(rsi(new Array(14).fill(0).map((_, i) => 100 + i), 14), null);
  assert.equal(rsi([100, 101], 14), null);
});

test("rsi: prezzi fermi non sono né ipercomprati né ipervenduti", () => {
  assert.equal(rsi(new Array(20).fill(100), 14), 50);
});

/* ---------------------------- volume -------------------------------- */

test("rapportoVolume: ultima candela contro la media delle precedenti, esclusa l'ultima", () => {
  const candele = [
    { volume: 100 }, { volume: 100 }, { volume: 100 },
    { volume: 100 }, { volume: 100 }, { volume: 100 },
    { volume: 160 } // media delle 6 precedenti = 100 -> 1,6×
  ];
  vicino(rapportoVolume(candele, 6), 1.6);
});

test("rapportoVolume: non conta l'ultima nella media che usa per confrontarsi", () => {
  // se l'ultima entrasse nella media, il rapporto non sarebbe 2
  const candele = [{ volume: 50 }, { volume: 50 }, { volume: 100 }];
  vicino(rapportoVolume(candele, 2), 2);
});

test("rapportoVolume: servono N+1 candele, e una media di zero non è un rapporto", () => {
  assert.equal(rapportoVolume([{ volume: 10 }], 6), null);
  assert.equal(rapportoVolume([{ volume: 0 }, { volume: 0 }, { volume: 5 }], 2), null);
});

/* ---------------------------- incroci -------------------------------- */

test("incrocio: verso l'alto solo nel momento in cui accade", () => {
  assert.equal(incrocio([9, 11], [10, 10]), "alto");
  assert.equal(incrocio([11, 12], [10, 10]), null); // era già sopra: non è un incrocio
});

test("incrocio: verso il basso", () => {
  assert.equal(incrocio([11, 9], [10, 10]), "basso");
});

test("incrocio: il tocco esatto e poi il sorpasso conta come incrocio", () => {
  assert.equal(incrocio([10, 11], [10, 10]), "alto");
});

test("incrocio: con un null dentro non si inventa niente", () => {
  assert.equal(incrocio([null, 11], [10, 10]), null);
  assert.equal(incrocio([9], [10]), null);
});

test("sopra: dice solo dove stanno adesso", () => {
  assert.equal(sopra([1, 11], [1, 10]), true);
  assert.equal(sopra([1, 9], [1, 10]), false);
  assert.equal(sopra([1, null], [1, 10]), null);
});

/* ------------------- incrocio dentro una finestra ------------------- */

test("incrocioRecente: con finestra 1 dice esattamente quello che dice incrocio()", () => {
  const casi = [
    [[9, 11], [10, 10]],      // incrocio verso l'alto
    [[11, 9], [10, 10]],      // verso il basso
    [[11, 12], [10, 10]],     // era già sopra: niente
    [[10, 11], [10, 10]],     // tocco esatto e sorpasso
    [[null, 11], [10, 10]],   // un buco dentro
    [[9], [10]]               // troppo corta
  ];
  for (const [a, b] of casi) {
    const atteso = incrocio(a, b);
    const ottenuto = incrocioRecente(a, b, 1);
    assert.equal(
      ottenuto?.direzione ?? null,
      atteso,
      `finestra 1 deve coincidere con incrocio() su ${JSON.stringify(a)} / ${JSON.stringify(b)}`
    );
  }
});

test("incrocioRecente: candeleFa vale 0 quando l'incrocio è su questa candela", () => {
  assert.deepEqual(incrocioRecente([9, 11], [10, 10], 1), { direzione: "alto", candeleFa: 0 });
});

test("incrocioRecente: trova un incrocio vecchio di tre candele solo se la finestra ci arriva", () => {
  // incrocio fra indice 0 e 1, poi la veloce resta sopra: candeleFa = 3
  const veloce = [9, 11, 12, 13, 14];
  const lenta = [10, 10, 10, 10, 10];

  assert.equal(incrocioRecente(veloce, lenta, 1), null, "con finestra 1 non lo vede");
  assert.equal(incrocioRecente(veloce, lenta, 3), null, "con finestra 3 nemmeno: manca una candela");
  assert.deepEqual(incrocioRecente(veloce, lenta, 4), { direzione: "alto", candeleFa: 3 });
  assert.deepEqual(incrocioRecente(veloce, lenta, 10), { direzione: "alto", candeleFa: 3 });
});

test("incrocioRecente: fra due incroci nella finestra vince il più recente", () => {
  // sale sopra fra 0 e 1, torna sotto fra 2 e 3
  const veloce = [9, 11, 11, 9, 9];
  const lenta = [10, 10, 10, 10, 10];
  assert.deepEqual(incrocioRecente(veloce, lenta, 5), { direzione: "basso", candeleFa: 1 });
});

test("incrocioRecente: cercando una direzione, un incrocio opposto più recente non la annulla", () => {
  // È la scelta che rende la regola applicabile: pretendere che l'incrocio al
  // rialzo «regga ancora» equivale a chiedere che la veloce sia tuttora sopra,
  // e con un RSI basso non capita mai.
  const veloce = [9, 11, 11, 9, 9];
  const lenta = [10, 10, 10, 10, 10];

  assert.deepEqual(incrocioRecente(veloce, lenta, 5, "alto"), { direzione: "alto", candeleFa: 3 });
  assert.deepEqual(incrocioRecente(veloce, lenta, 5, "basso"), { direzione: "basso", candeleFa: 1 });
  assert.equal(incrocioRecente(veloce, lenta, 2, "alto"), null, "fuori finestra resta fuori");
});

test("incrocioRecente: una finestra che non ha senso non inventa niente", () => {
  const veloce = [9, 11];
  const lenta = [10, 10];
  assert.equal(incrocioRecente(veloce, lenta, 0), null);
  assert.equal(incrocioRecente(veloce, lenta, -3), null);
  assert.equal(incrocioRecente(veloce, lenta, 1.5), null);
  assert.equal(incrocioRecente(null, lenta, 1), null);
});

test("incrocioRecente: guardare più indietro delle candele disponibili non rompe niente", () => {
  assert.equal(incrocioRecente([11, 12], [10, 10], 50), null);
  assert.deepEqual(incrocioRecente([9, 11], [10, 10], 50), { direzione: "alto", candeleFa: 0 });
});

/* --------------------- massimo delle precedenti ---------------------- */

test("massimoPrecedente: il massimo delle N candele prima dell'ultima", () => {
  const candele = [
    { massimo: 10 }, { massimo: 14 }, { massimo: 12 }, { massimo: 11 }, { massimo: 99 }
  ];
  // le 3 precedenti all'ultima sono 14, 12, 11: il 99 dell'ultima non conta
  assert.equal(massimoPrecedente(candele, 3), 14);
});

test("massimoPrecedente: l'ultima candela è esclusa per costruzione", () => {
  // se contasse anche l'ultima, «chiusura sopra il massimo» sarebbe quasi
  // sempre falso: nessuna chiusura supera il proprio stesso massimo
  const candele = [{ massimo: 10 }, { massimo: 11 }, { massimo: 50 }];
  assert.equal(massimoPrecedente(candele, 2), 11);
});

test("massimoPrecedente: senza abbastanza candele dice null, non un numero qualsiasi", () => {
  assert.equal(massimoPrecedente([{ massimo: 10 }, { massimo: 11 }], 2), null);
  assert.equal(massimoPrecedente([], 3), null);
  assert.equal(massimoPrecedente(null, 3), null);
  assert.equal(massimoPrecedente([{ massimo: 10 }], 0), null);
});

test("massimoPrecedente: un massimo illeggibile invalida la risposta", () => {
  const candele = [{ massimo: 10 }, { massimo: NaN }, { massimo: 12 }, { massimo: 13 }];
  assert.equal(massimoPrecedente(candele, 3), null);
});

/* ------------------ variazione su un periodo ------------------ */

test("variazioneSuPeriodo: misura il calo compiuto, col segno giusto", () => {
  const c = (chiusura) => ({ chiusura, massimo: chiusura, minimo: chiusura, volume: 1 });
  // con tolleranza: confrontare decimali con l'uguaglianza esatta è un test
  // che si rompe per l'aritmetica, non per il codice
  vicino(variazioneSuPeriodo([c(100), c(99), c(97)], 2), -3);
  vicino(variazioneSuPeriodo([c(100), c(101), c(103)], 2), 3);
});

test("variazioneSuPeriodo: guarda la chiusura di N candele fa, non il massimo", () => {
  const c = (chiusura, massimo) => ({ chiusura, massimo, minimo: chiusura, volume: 1 });
  // il massimo intermedio a 120 non deve contare: 100 → 95 è −5%
  assert.equal(variazioneSuPeriodo([c(100, 100), c(110, 120), c(95, 111)], 2), -5);
});

test("variazioneSuPeriodo: senza abbastanza candele dice null", () => {
  const c = (chiusura) => ({ chiusura, massimo: chiusura, minimo: chiusura, volume: 1 });
  assert.equal(variazioneSuPeriodo([c(100), c(99)], 2), null);
  assert.equal(variazioneSuPeriodo([], 1), null);
  assert.equal(variazioneSuPeriodo(null, 1), null);
  assert.equal(variazioneSuPeriodo([c(100), c(99)], 0), null);
});
