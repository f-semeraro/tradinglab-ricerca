import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  aggiornaStoria,
  decisioniSettimanali,
  passoPerCoppia,
  improntaRegola,
  problemiSettimanale,
  nuovoStatoProva
} from "../lib/prova.js";
import { rendimentiSettimanali, segnali, settimaneDentro } from "../lib/settimane.js";

const GIORNO = 86400000;
const SETTIMANA = 7 * GIORNO;
const LAB = { capitaleIniziale: 100, fusoOrario: "Europe/Rome" };
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const domenica = (i) => iso(Date.parse("2020-01-05") + i * SETTIMANA);
const STRATEGIA = JSON.parse(fs.readFileSync(new URL("../strategie/liu-b.json", import.meta.url), "utf8"));

/** Una candela giornaliera di domenica a un dato prezzo. */
const candelaDomenica = (i, prezzo) => ({ momento: (Date.parse(domenica(i)) / 1000), chiusura: prezzo });

/** Una candela oraria del lunedì 00:00 UTC dopo la domenica i. */
const oraLunedi = (i, prezzo) => ({ momento: Date.parse(iso(Date.parse(domenica(i)) + GIORNO)) / 1000, chiusura: prezzo });

/** Una storia di domeniche con rendimenti scelti: rendimenti[i] è la settimana che chiude alla domenica i. */
function storiaConRendimenti(rendimenti) {
  let prezzo = 100;
  const candele = rendimenti.map((r, i) => {
    prezzo = i === 0 ? 100 : prezzo * (1 + r);
    return candelaDomenica(i, prezzo);
  });
  return aggiornaStoria([], candele);
}

test("aggiornaStoria: una riga per domenica, null dove manca la candela, e nessun duplicato al secondo passaggio", () => {
  const candele = [candelaDomenica(0, 100), candelaDomenica(2, 110)];
  const storia = aggiornaStoria([], candele);
  assert.deepEqual(storia.map((r) => r.data), [domenica(0), domenica(1), domenica(2)]);
  assert.deepEqual(storia.map((r) => r.chiusura), [100, null, 110]);
  assert.equal(aggiornaStoria(storia, candele).length, 3);
});

test("decisioniSettimanali: la decisione per la settimana successiva usa solo le domeniche fino a K", () => {
  // rendimenti piccoli e alternati, poi una settimana forte alla domenica 25
  const rend = Array.from({ length: 30 }, (_, i) => (i % 2 ? -0.01 : 0.01));
  rend[25] = 0.5;
  const storia = storiaConRendimenti(rend);
  // cambiare i dati dopo K non cambia la decisione di K
  const futuro = storia.map((r, i) => (i > 25 ? { ...r, chiusura: r.chiusura * 3 } : r));
  const a = decisioniSettimanali(storia.slice(0, 26));
  const b = decisioniSettimanali(futuro.slice(0, 26));
  assert.equal(a.apre, b.apre);
  assert.equal(a.K, 25);
});

test("decisioniSettimanali: il batch e l'incrementale danno la stessa tenuta per ogni settimana", () => {
  const rend = Array.from({ length: 40 }, (_, i) => Math.sin(i * 1.3) * 0.05);
  const storia = storiaConRendimenti(rend);
  const batch = settimaneDentro(segnali("B", rendimentiSettimanali(storia.map((r) => r.chiusura))).concat([null]), 1);
  for (let k = 20; k < storia.length - 1; k++) {
    const inc = decisioniSettimanali(storia.slice(0, k + 1));
    assert.equal(inc.dentro[k + 1], batch[k + 1], `settimana ${k + 1}`);
  }
});

test("problemiSettimanale: la candidata passa la validazione; una variante diversa no", () => {
  assert.deepEqual(problemiSettimanale(STRATEGIA), []);
  assert.ok(problemiSettimanale({ ...STRATEGIA, variante: "C" }).length > 0);
  assert.ok(problemiSettimanale({ ...STRATEGIA, lato: "entrambi" }).length > 0);
});

test("improntaRegola: cambia se cambia la regola, non se cambia il nome", () => {
  assert.equal(improntaRegola(STRATEGIA), improntaRegola({ ...STRATEGIA, nome: "altro" }));
  assert.notEqual(improntaRegola(STRATEGIA), improntaRegola({ ...STRATEGIA, percentile: 0.9 }));
});

test("prova: attivazione, apertura il lunedì dopo il segnale, chiusura la settimana dopo, nessun doppione", () => {
  const stato = nuovoStatoProva({ lab: LAB, coppia: "XBTUSD" });
  // 30 domeniche con rendimenti piccoli: attivazione alla domenica 29, nessun segnale forte
  const rend = Array.from({ length: 30 }, (_, i) => (i % 2 ? -0.01 : 0.01));
  const storia30 = storiaConRendimenti(rend);
  passoPerCoppia({ stato, strategia: STRATEGIA, storia: storia30, orarie: [], coppia: "XBTUSD", lab: LAB });
  assert.equal(stato.prova.K0, 29);
  assert.equal(stato.posizione, null);

  // domenica 30: rendimento forte → segnale → apertura il lunedì 31 (candela oraria 00:00–01:00)
  const storia31 = storiaConRendimenti([...rend, 0.5]);
  const eventi1 = passoPerCoppia({ stato, strategia: STRATEGIA, storia: storia31, orarie: [oraLunedi(30, 120)], coppia: "XBTUSD", lab: LAB });
  assert.deepEqual(eventi1.map((e) => e.tipo), ["apertura"]);
  assert.notEqual(stato.posizione, null);

  // domenica 31: rendimento piccolo → nessun segnale → chiusura il lunedì 32
  const storia32 = storiaConRendimenti([...rend, 0.5, -0.01]);
  const eventi2 = passoPerCoppia({ stato, strategia: STRATEGIA, storia: storia32, orarie: [oraLunedi(30, 120), oraLunedi(31, 130)], coppia: "XBTUSD", lab: LAB });
  assert.deepEqual(eventi2.map((e) => e.tipo), ["chiusura"]);
  assert.equal(stato.posizione, null);
  assert.equal(stato.operazioni.length, 1);

  // ripetere il passo non ripete niente
  const eventi3 = passoPerCoppia({ stato, strategia: STRATEGIA, storia: storia32, orarie: [oraLunedi(30, 120), oraLunedi(31, 130)], coppia: "XBTUSD", lab: LAB });
  assert.deepEqual(eventi3, []);
  assert.equal(stato.operazioni.length, 1);
});

test("prova: un segnale prima dell'attivazione non apre nessuna posizione", () => {
  const stato = nuovoStatoProva({ lab: LAB, coppia: "XBTUSD" });
  const rend = Array.from({ length: 30 }, (_, i) => (i % 2 ? -0.01 : 0.01));
  rend[29] = 0.5; // il segnale è già presente alla domenica di attivazione
  const storia = storiaConRendimenti(rend);
  const eventi = passoPerCoppia({ stato, strategia: STRATEGIA, storia, orarie: [oraLunedi(29, 120)], coppia: "XBTUSD", lab: LAB });
  assert.deepEqual(eventi, []);
  assert.equal(stato.posizione, null);
});

test("prova: se la candela oraria manca, l'evento resta in sospeso e si esegue quando arriva", () => {
  const stato = nuovoStatoProva({ lab: LAB, coppia: "XBTUSD" });
  const rend = Array.from({ length: 30 }, (_, i) => (i % 2 ? -0.01 : 0.01));
  const storia30 = storiaConRendimenti(rend);
  passoPerCoppia({ stato, strategia: STRATEGIA, storia: storia30, orarie: [], coppia: "XBTUSD", lab: LAB });
  const storia31 = storiaConRendimenti([...rend, 0.5]);
  const senza = passoPerCoppia({ stato, strategia: STRATEGIA, storia: storia31, orarie: [], coppia: "XBTUSD", lab: LAB });
  assert.deepEqual(senza, []);
  assert.notEqual(stato.prova.inSospeso, null);
  const con = passoPerCoppia({ stato, strategia: STRATEGIA, storia: storia31, orarie: [oraLunedi(30, 120)], coppia: "XBTUSD", lab: LAB });
  assert.deepEqual(con.map((e) => e.tipo), ["apertura"]);
  assert.equal(stato.prova.inSospeso, null);
});

test("prova: se la regola cambia durante la prova, il passo si ferma", () => {
  const stato = nuovoStatoProva({ lab: LAB, coppia: "XBTUSD" });
  const rend = Array.from({ length: 30 }, (_, i) => (i % 2 ? -0.01 : 0.01));
  passoPerCoppia({ stato, strategia: STRATEGIA, storia: storiaConRendimenti(rend), orarie: [], coppia: "XBTUSD", lab: LAB });
  assert.throws(
    () => passoPerCoppia({ stato, strategia: { ...STRATEGIA, percentile: 0.9 }, storia: storiaConRendimenti(rend), orarie: [], coppia: "XBTUSD", lab: LAB }),
    /registra una nuova strategia/
  );
});
