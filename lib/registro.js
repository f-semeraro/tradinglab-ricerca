/**
 * lib/registro.js — le righe di registro/esperimenti.md.
 *
 * Funzioni pure: costruiscono testo, non toccano il disco (lib/persistenza.js lo scrive).
 *
 * Il registro è a sola aggiunta: una riga per ogni esecuzione, mai riscritta. Tutti gli strumenti
 * scrivono le stesse dieci colonne, nello stesso ordine, passando da qui.
 */

import { cella } from "./formato.js";

export const COLONNE_REGISTRO = [
  "data (UTC)", "strategia", "coppia", "impronta", "periodo", "operazioni", "capitale", "vs comprato e basta", "drawdown", "nota"
];

/** Il testo di un registro appena nato: titolo, regola e intestazione della tabella. */
export const INTESTAZIONE_REGISTRO = [
  "# Registro degli esperimenti",
  "",
  "Sola aggiunta: ogni backtest aggiunge una riga e non riscrive mai quelle precedenti.",
  "Il risultato è sempre confrontato col «comprato e basta» sullo stesso periodo.",
  "",
  `| ${COLONNE_REGISTRO.join(" | ")} |`,
  "|---|---|---|---|---|---:|---:|---:|---:|---|",
  ""
].join("\n");

/**
 * Una riga del registro. Ogni valore diventa una cella: barre verticali e a capo si tolgono, perché
 * una nota scritta a mano non deve poter rompere la tabella.
 */
export function rigaRegistro({ data, strategia, coppia, impronta, periodo, operazioni, capitale, vsCompratoEBasta, drawdown, nota = "" }) {
  const celle = [data, strategia, coppia, impronta, periodo, operazioni, capitale, vsCompratoEBasta, drawdown, nota];
  return `| ${celle.map(cella).join(" | ")} |`;
}

/**
 * Dice se un esperimento è già nel registro, cioè se una riga ha quel nome nella colonna «strategia».
 * Serve ai test pre-registrati, che si eseguono una volta sola.
 */
export function giaRegistrato(testoRegistro, strategia) {
  return testoRegistro.split(/\r?\n/).some((riga) => riga.startsWith("|") && riga.split("|")[2]?.trim() === strategia);
}
