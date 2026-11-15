/**
 * lib/persistenza.js — le scritture e le letture su disco, in un punto solo.
 *
 * È shell: qui si tocca il file system, e solo qui. Le scritture passano da un
 * file temporaneo e da una rinomina, così un processo che muore a metà non
 * lascia un file mezzo scritto.
 */

import fs from "node:fs";
import path from "node:path";

import { righeDi, candeleDaCsv, csvDaCandele, candeleDaArchivio } from "./storico.js";
import { INTESTAZIONE_REGISTRO } from "./registro.js";

export function scriviAtomico(percorso, testo) {
  fs.mkdirSync(path.dirname(percorso), { recursive: true });
  const temporaneo = `${percorso}.${process.pid}.tmp`;
  fs.writeFileSync(temporaneo, testo, "utf8");
  fs.renameSync(temporaneo, percorso);
}

/** Legge un JSON, o restituisce null se il file non esiste. */
export function leggiJson(percorso) {
  if (!fs.existsSync(percorso)) return null;
  return JSON.parse(fs.readFileSync(percorso, "utf8"));
}

/** Scrive un JSON indentato: git mostra le istantanee aggiunte come righe nuove, senza riscrivere le vecchie. */
export function scriviJson(percorso, dato) {
  scriviAtomico(percorso, JSON.stringify(dato, null, 2) + "\n");
}

/**
 * La storia delle domeniche da CSV: data e chiusura, con chiusura vuota dove manca la candela.
 * Le righe si separano con LF o CRLF: con il solo LF, su un clone Windows la chiusura vuota
 * sarebbe «\r», e diventerebbe un prezzo zero invece di un dato mancante.
 */
export function leggiStoriaSettimanale(percorso) {
  if (!fs.existsSync(percorso)) return [];
  return righeDi(fs.readFileSync(percorso, "utf8")).slice(1).map((riga) => {
    const [data, chiusura = ""] = riga.split(",");
    return { data, chiusura: chiusura.trim() === "" ? null : Number(chiusura) };
  });
}

/** Scrive la storia delle domeniche in CSV, in modo atomico. */
export function scriviStoriaSettimanale(percorso, storia) {
  const righe = storia.map((r) => `${r.data},${r.chiusura === null ? "" : r.chiusura}`);
  scriviAtomico(percorso, ["data,chiusura", ...righe].join("\n") + "\n");
}

/** Le candele di un CSV di dati/storico/. Se il file manca, l'errore dice quale. */
export function leggiCandele(percorso) {
  if (!fs.existsSync(percorso)) throw new Error(`manca ${percorso}`);
  return candeleDaCsv(fs.readFileSync(percorso, "utf8"));
}

/** Scrive le candele in un CSV di dati/storico/, in modo atomico. */
export function scriviCandele(percorso, candele) {
  scriviAtomico(percorso, csvDaCandele(candele));
}

/** Le candele di un file dell'archivio Kraken, o null se la coppia non è in archivio. */
export function leggiArchivio(percorso) {
  if (!fs.existsSync(percorso)) return null;
  return candeleDaArchivio(fs.readFileSync(percorso, "utf8"));
}

/**
 * Aggiunge una riga in fondo al registro, creandolo con la sua intestazione se non esiste.
 * È l'unica scrittura non atomica: un'aggiunta in coda non riscrive mai le righe precedenti.
 */
export function aggiungiAlRegistro(percorso, riga) {
  if (!fs.existsSync(percorso)) scriviAtomico(percorso, INTESTAZIONE_REGISTRO);
  const testo = fs.readFileSync(percorso, "utf8");
  fs.appendFileSync(percorso, `${testo.endsWith("\n") ? "" : "\n"}${riga}\n`, "utf8");
}
