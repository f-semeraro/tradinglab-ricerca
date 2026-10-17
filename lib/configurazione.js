/**
 * lib/configurazione.js — legge e controlla config/strategia.json.
 *
 * Il file va riletto all'avvio del ciclo e a ogni giro, così una modifica ha
 * effetto senza riavviare niente. Se è malformato o manca un campo, il ciclo
 * **non parte** e lo dice chiaramente: meglio fermo che con dei valori
 * inventati.
 *
 * Chi applica cosa — perché il valutatore non può applicare tutto:
 *   · ingresso, uscita e costi   -> li applica valuta() in lib/strategia.js
 *   · perdita massima giornaliera -> la controlla il ciclo, che vede lo storico
 *   · posizioni massime           -> la controlla il ciclo
 * Un parametro che sta nella configurazione e non è applicato da nessuno è
 * peggio che non averlo, quindi qui sotto sono dichiarati tutti e tre.
 *
 * ---------------------------------------------------------------------
 * L'ingresso è fatto di BLOCCHI, e ognuno si può spegnere
 * ---------------------------------------------------------------------
 * Un blocco presente viene validato campo per campo; un blocco a `null` (o
 * assente) è spento e non partecipa alla decisione. Almeno uno deve essere
 * acceso — una strategia senza condizioni comprerebbe a ogni candela.
 *
 * Un blocco nuovo si aggiunge in TRE posti, sempre insieme:
 *   1. qui, in BLOCCHI_INGRESSO (validazione + candele necessarie)
 *   2. in lib/strategia.js, in `condizioniIngresso()` (che è anche la
 *      decisione: `valutaIngresso()` la usa)
 *   3. nella legenda di lib/backtest.js e nelle schede
 * Se ne manca uno, o il ciclo decide su una regola che la scheda non mostra,
 * o la scheda mostra una regola che nessuno applica. Sono due bugie diverse
 * con la stessa radice.
 */

import fs from "node:fs";
import path from "node:path";

import { bloccoAttivo } from "./blocchi.js";

const FILE_STRATEGIA = path.join(process.cwd(), "config", "strategia.json");

const intero = (minimo) => (v) => Number.isInteger(v) && v >= minimo;

/**
 * I blocchi di ingresso conosciuti: campi, regole di validità, descrizioni.
 * L'ordine qui è anche l'ordine canonico ovunque (motivi, diagnostica, schede).
 */
const BLOCCHI_INGRESSO = [
  ["rsi", [
    ["periodi", intero(2), "un numero intero di almeno 2"],
    ["sotto", (v) => Number.isFinite(v) && v > 0 && v < 100, "un numero fra 0 e 100"]
  ]],
  ["incrocioMedie", [
    ["veloce", intero(2), "un numero intero di almeno 2"],
    ["lenta", intero(2), "un numero intero di almeno 2"],
    ["direzione", (v) => v === "alto" || v === "basso", '"alto" oppure "basso"'],
    ["entroCandele", intero(1), "un numero intero di almeno 1 (1 = l'incrocio deve avvenire su questa candela)"]
  ]],
  ["volume", [
    ["periodi", intero(1), "un numero intero di almeno 1"],
    ["almeno", (v) => Number.isFinite(v) && v > 0, "un numero maggiore di zero"]
  ]],
  ["tendenza", [
    ["veloce", intero(2), "un numero intero di almeno 2"],
    ["lenta", intero(2), "un numero intero di almeno 2"]
  ]],
  ["rottura", [
    ["periodi", intero(1), "un numero intero di almeno 1"]
  ]],
  ["sopraMedia", [
    ["periodi", intero(2), "un numero intero di almeno 2 (la media che definisce il regime)"]
  ]],
  ["crollo", [
    ["periodi", intero(1), "un numero intero di almeno 1 (su quante candele misurare il calo)"],
    ["almenoPercento", (v) => Number.isFinite(v) && v > 0, "una percentuale maggiore di zero, SENZA il meno davanti (quanto deve essere sceso)"]
  ]],
  ["macd", [
    ["veloce", intero(2), "un numero intero di almeno 2"],
    ["lenta", intero(2), "un numero intero di almeno 2"],
    ["segnale", intero(1), "un numero intero di almeno 1 (i periodi della linea di segnale)"]
  ]],
  ["bollinger", [
    ["periodi", intero(2), "un numero intero di almeno 2"],
    ["deviazioni", (v) => Number.isFinite(v) && v > 0, "un numero maggiore di zero (quante deviazioni standard dalla media)"],
    ["lato", (v) => v === "sotto" || v === "sopra", '"sotto" (il prezzo scende sotto la banda inferiore) oppure "sopra" (il prezzo sale sopra la banda superiore)']
  ]]
];

const NOMI_BLOCCHI = BLOCCHI_INGRESSO.map(([nome]) => nome);

// il predicato sta in blocchi.js (puro): qui solo per chi lo importa da questo file
export { bloccoAttivo };

/** Il resto della configurazione: obbligatorio com'è sempre stato. */
const CAMPI_ATTESI = [
  ["uscita.presaDiProfittoPercento", (v) => Number.isFinite(v) && v > 0, "una percentuale maggiore di zero"],
  ["uscita.stopDiPerditaPercento", (v) => Number.isFinite(v) && v > 0, "una percentuale maggiore di zero (senza il meno davanti)"],
  ["uscita.tempoMassimoCandele", (v) => v === null || (Number.isInteger(v) && v > 0), "un numero intero di candele, oppure null per non usarla"],
  ["rischio.quotaCapitalePercento", (v) => Number.isFinite(v) && v > 0 && v <= 100, "una percentuale fra 0 e 100"],
  ["rischio.posizioniMassime", intero(1), "un numero intero di almeno 1"],
  ["rischio.perditaMassimaGiornalieraPercento", (v) => v === null || (Number.isFinite(v) && v > 0), "una percentuale maggiore di zero, oppure null"],
  ["costi.commissionePercentoPerLato", (v) => Number.isFinite(v) && v >= 0, "una percentuale, anche zero"],
  ["costi.slippagePercento", (v) => Number.isFinite(v) && v >= 0, "una percentuale, anche zero"]
];

function prendi(oggetto, percorso) {
  return percorso.split(".").reduce((corrente, chiave) => (corrente == null ? undefined : corrente[chiave]), oggetto);
}

export class ConfigurazioneNonValida extends Error {
  constructor(problemi) {
    super(
      `config/strategia.json non va bene, quindi non parto:\n` +
      problemi.map((p) => `  · ${p}`).join("\n")
    );
    this.name = "ConfigurazioneNonValida";
    this.problemi = problemi;
  }
}

/**
 * Il trailing è facoltativo come i blocchi di ingresso: `null` o assente vuol
 * dire spento, e una configurazione scritta prima che esistesse continua a
 * significare esattamente quello che significava.
 */
const CAMPI_TRAILING = [
  ["attivaSopraPercento", (v) => Number.isFinite(v) && v >= 0, "una percentuale di almeno zero (sotto questo guadagno il trailing non si attiva)"],
  ["scendeDiPercento", (v) => Number.isFinite(v) && v > 0, "una percentuale maggiore di zero (di quanto può ripiegare dal massimo)"]
];

function validaUscita(strategia, problemi) {
  /* l'uscita che segue la tendenza invece di un livello */
  const sottoMedia = strategia.uscita?.sottoMedia;
  if (bloccoAttivo(sottoMedia)) {
    if (!intero(2)(sottoMedia.periodi)) {
      problemi.push(
        `uscita.sottoMedia.periodi vale ${JSON.stringify(sottoMedia.periodi)}, dovrebbe essere ` +
        `un numero intero di almeno 2 (la media sotto cui si esce)`
      );
    }
  }

  /* lo stop che si sposta al pareggio: un campo solo, e facoltativo */
  const pareggio = strategia.uscita?.pareggio;
  if (bloccoAttivo(pareggio)) {
    const m = pareggio.marginePercento;
    if (m !== undefined && !(Number.isFinite(m) && m >= 0)) {
      problemi.push(
        `uscita.pareggio.marginePercento vale ${JSON.stringify(m)}, dovrebbe essere ` +
        `una percentuale di almeno zero (quanto sopra il pareggio esatto mettere lo stop)`
      );
    }
  }

  const trailing = strategia.uscita?.trailing;
  if (!bloccoAttivo(trailing)) return;

  for (const [campo, valido, descrizione] of CAMPI_TRAILING) {
    const valore = trailing[campo];
    if (valore === undefined) {
      problemi.push(`manca uscita.trailing.${campo} — dovrebbe essere ${descrizione}`);
    } else if (!valido(valore)) {
      problemi.push(`uscita.trailing.${campo} vale ${JSON.stringify(valore)}, dovrebbe essere ${descrizione}`);
    }
  }

  /* Un trailing che insegue più largo dello stop non scatterà mai prima di
     lui: è un parametro che sembra fare qualcosa e non lo fa. */
  const stop = strategia.uscita?.stopDiPerditaPercento;
  if (Number.isFinite(stop) && Number.isFinite(trailing.scendeDiPercento) &&
      Number.isFinite(trailing.attivaSopraPercento) &&
      trailing.attivaSopraPercento - trailing.scendeDiPercento < -stop) {
    problemi.push(
      `uscita.trailing scatterebbe sotto lo stop di perdita (attiva a +${trailing.attivaSopraPercento}%, ` +
      `scende di ${trailing.scendeDiPercento}%, stop a −${stop}%): lo stop arriverebbe sempre prima`
    );
  }
}

function validaIngresso(strategia, problemi) {
  const ingresso = strategia.ingresso;
  if (!ingresso || typeof ingresso !== "object") {
    problemi.push("manca ingresso — l'oggetto con le condizioni di acquisto");
    return;
  }

  /* un nome sbagliato non deve sparire in silenzio: «rotura» scritta male
     sarebbe una condizione che credi attiva e che nessuno applica */
  for (const chiave of Object.keys(ingresso)) {
    if (!NOMI_BLOCCHI.includes(chiave)) {
      problemi.push(`ingresso.${chiave} non è un blocco che conosco (conosco: ${NOMI_BLOCCHI.join(", ")})`);
    }
  }

  let accesi = 0;
  for (const [nome, campi] of BLOCCHI_INGRESSO) {
    const blocco = ingresso[nome];
    if (!bloccoAttivo(blocco)) continue;
    accesi += 1;

    for (const [campo, valido, descrizione] of campi) {
      const valore = blocco[campo];
      if (valore === undefined) {
        problemi.push(`manca ingresso.${nome}.${campo} — dovrebbe essere ${descrizione}`);
      } else if (!valido(valore)) {
        problemi.push(`ingresso.${nome}.${campo} vale ${JSON.stringify(valore)}, dovrebbe essere ${descrizione}`);
      }
    }
  }

  if (accesi === 0) {
    problemi.push(
      "nessuna condizione di ingresso è attiva (sono tutte null o assenti): " +
      "una strategia senza condizioni comprerebbe a ogni candela"
    );
  }

  /* le due medie devono incrociarsi come credi, in tutti e due i blocchi che le usano */
  for (const nome of ["incrocioMedie", "tendenza", "macd"]) {
    const blocco = ingresso[nome];
    if (!bloccoAttivo(blocco)) continue;
    if (Number.isInteger(blocco.veloce) && Number.isInteger(blocco.lenta) && blocco.veloce >= blocco.lenta) {
      problemi.push(
        `in ingresso.${nome} la media veloce (${blocco.veloce}) deve essere più corta della lenta (${blocco.lenta})`
      );
    }
  }
}

/**
 * Legge e controlla la configurazione della strategia.
 * Lancia ConfigurazioneNonValida se qualcosa non torna: è l'unico posto del
 * sistema dove fermarsi è meglio che tirare avanti.
 *
 * Il percorso si può passare da fuori: il backtest prova delle varianti, e una
 * variante va validata dallo stesso validatore del file vero. Un JSON scritto a
 * mano e non controllato produce un backtest che gira e dei numeri che non
 * vogliono dire niente.
 */
export function leggiStrategia(percorso = FILE_STRATEGIA) {
  let grezzo;
  try {
    grezzo = fs.readFileSync(percorso, "utf8");
  } catch (errore) {
    throw new ConfigurazioneNonValida([
      errore.code === "ENOENT"
        ? "il file non esiste. Crealo: senza regole non c'è niente da mettere alla prova."
        : `non riesco a leggerlo: ${errore.message}`
    ]);
  }

  let strategia;
  try {
    strategia = JSON.parse(grezzo);
  } catch (errore) {
    throw new ConfigurazioneNonValida([`non è JSON valido: ${errore.message}`]);
  }

  const problemi = problemiStrategia(strategia);
  if (problemi.length > 0) throw new ConfigurazioneNonValida(problemi);
  return strategia;
}

/**
 * Tutti i problemi di una strategia già letta, senza lanciare. Il generatore di
 * ricerca la usa per scartare le combinazioni non valide prima di provarle: le
 * stesse regole di leggiStrategia, senza passare dal file.
 *
 * @returns {string[]} l'elenco dei problemi; vuoto se la strategia è valida
 */
export function problemiStrategia(strategia) {
  const problemi = [];

  validaIngresso(strategia, problemi);
  validaUscita(strategia, problemi);

  for (const [percorsoCampo, valido, descrizione] of CAMPI_ATTESI) {
    const valore = prendi(strategia, percorsoCampo);
    if (valore === undefined) {
      problemi.push(`manca ${percorsoCampo} — dovrebbe essere ${descrizione}`);
    } else if (!valido(valore)) {
      problemi.push(`${percorsoCampo} vale ${JSON.stringify(valore)}, dovrebbe essere ${descrizione}`);
    }
  }

  return problemi;
}

/**
 * Quante candele servono prima di poter valutare qualsiasi cosa.
 * La scheda Strategia lo usa per dire «me ne mancano ancora N» invece di
 * restare misteriosamente ferma.
 *
 * Si contano solo i blocchi accesi. Per l'incrocio, la finestra si somma alla
 * media lenta: per sapere se un incrocio è avvenuto N candele fa serve che la
 * serie della media esista già N candele prima. Senza questa somma la scheda
 * direbbe «ho abbastanza dati» mentre la regola sta ancora guardando nel vuoto.
 */
export function candeleNecessarie(strategia) {
  const ingresso = strategia.ingresso;
  const necessarie = [];

  if (bloccoAttivo(ingresso.rsi)) necessarie.push(ingresso.rsi.periodi + 1);
  if (bloccoAttivo(ingresso.incrocioMedie)) {
    necessarie.push(ingresso.incrocioMedie.lenta + (ingresso.incrocioMedie.entroCandele ?? 1));
  }
  if (bloccoAttivo(ingresso.volume)) necessarie.push(ingresso.volume.periodi + 1);
  if (bloccoAttivo(ingresso.tendenza)) necessarie.push(ingresso.tendenza.lenta + 1);
  if (bloccoAttivo(ingresso.rottura)) necessarie.push(ingresso.rottura.periodi + 1);
  if (bloccoAttivo(ingresso.crollo)) necessarie.push(ingresso.crollo.periodi + 1);
  if (bloccoAttivo(ingresso.sopraMedia)) necessarie.push(ingresso.sopraMedia.periodi + 1);
  // il MACD conta candele, non differenze: la linea di segnale esiste dopo lenta + segnale - 1 valori
  if (bloccoAttivo(ingresso.macd)) necessarie.push(ingresso.macd.lenta + ingresso.macd.segnale - 1);
  if (bloccoAttivo(ingresso.bollinger)) necessarie.push(ingresso.bollinger.periodi);

  return Math.max(...necessarie);
}

/** Il costo di un'andata e ritorno completo, prima ancora che il mercato si muova. */
export function costoAndataERitornoPercento(strategia) {
  return 2 * (strategia.costi.commissionePercentoPerLato + strategia.costi.slippagePercento);
}

export const PERCORSO_STRATEGIA = FILE_STRATEGIA;
