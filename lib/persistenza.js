/**
 * lib/persistenza.js — le scritture e le letture su disco, in un punto solo.
 *
 * È shell: qui si tocca il file system, e solo qui. Le scritture passano da un
 * file temporaneo e da una rinomina, così un processo che muore a metà non
 * lascia un file mezzo scritto.
 */

import fs from "node:fs";
import path from "node:path";

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
