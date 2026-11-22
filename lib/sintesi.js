/**
 * lib/sintesi.js — risultati/SINTESI.md: che cosa dice e con quali numeri.
 *
 * Funzioni pure. Il giro scrive la sintesi; la dashboard mostra le stesse cose in un'altra forma.
 * Entrambi prendono i numeri dalle stesse funzioni — datiLegacy() qui, datiSintesiSettimanale() in
 * prova.js, datiSezionePortafoglio() in portafoglioSintesi.js, datiSezioneGiornaliera() in
 * giornalieraProva.js — così la pagina e la sintesi non possono dire due cose diverse.
 */

import { avvisi, sezionePortafoglio } from "./portafoglioSintesi.js";
import { sezioneGiornaliera } from "./giornalieraProva.js";
import { righeSintesiSettimanale } from "./prova.js";
import { ultimaCandelaElaborata } from "./simulazione.js";
import { calcolaMetriche } from "./metriche.js";
import { formattaMomento } from "./tempo.js";
import { numero } from "./formato.js";

/** Come si chiamano le candele di un intervallo nella sintesi. */
export function etichettaCandele(intervallo) {
  return intervallo === 1440 ? "giornaliere" : `${intervallo} min`;
}

/**
 * I numeri di una strategia a blocchi per la sintesi, all'ultima candela elaborata, o null se non ne
 * ha ancora elaborata nessuna.
 */
export function datiLegacy({ stato }) {
  const ultimo = stato.istantanee.at(-1);
  if (!ultimo) return null;
  return {
    metriche: calcolaMetriche(stato, { prezzoMercato: ultimo.prezzo, prezzoBenchmark: null, adessoSecondi: ultimo.momento }),
    prezzo: ultimo.prezzo
  };
}

/**
 * Il testo di SINTESI.md. Deterministico: a parità di stato e di istante dà lo stesso testo.
 *
 * @param {Array} elementi  le strategie a blocchi e settimanali, come le lascia il giro
 * @param {object} lab      laboratorio.json
 * @param {object} opzioni  { adessoMs, ultimoGiroPrecedente, giornaliera }: `giornaliera` è il risultato di
 *                          sintesiGiornaliera() in giornalieraProva.js, o null
 */
export function testoSintesi(elementi, lab, opzioni = {}) {
  const fuso = lab.fusoOrario;
  const ultime = elementi.map((e) => ultimaCandelaElaborata(e.stato)).filter((m) => m !== null);
  const ultima = ultime.length > 0 ? Math.max(...ultime) : null;

  // gli avvisi in testa: giro fermo, domeniche in ritardo, giornate in ritardo
  const avvisiRighe = [
    ...avvisi({ elementi, adessoMs: opzioni.adessoMs, ultimoGiroPrecedente: opzioni.ultimoGiroPrecedente }),
    ...(opzioni.giornaliera?.avvisi ?? [])
  ];
  const righe = [
    "# Sintesi del laboratorio",
    "",
    ...(avvisiRighe.length > 0 ? [...avvisiRighe, ""] : []),
    `Ogni riga è un portafoglio di carta indipendente, partito con ${numero(lab.capitaleIniziale)} €. ` +
    "Il confronto è con il «comprato e basta» sulla stessa coppia, dallo stesso punto di partenza.",
    ultima === null
      ? "Nessuna candela ancora elaborata."
      : `Ultima candela elaborata: quella che apre alle ${formattaMomento(ultima, fuso, { conAnno: true })} (ora di ${fuso}).`,
    "",
    "| strategia | coppia | candele | capitale | vs comprato e basta | operazioni chiuse | drawdown massimo | posizione aperta |",
    "|---|---|---|---:|---:|---:|---:|---|"
  ];

  const note = [];
  for (const { nome, coppia, intervallo, stato } of elementi.filter((e) => !e.settimanale)) {
    const etichetta = etichettaCandele(intervallo);
    const dati = datiLegacy({ stato });
    if (!dati) {
      righe.push(`| ${nome} | ${coppia} | ${etichetta} | in attesa di candele | — | — | — | — |`);
      continue;
    }
    const m = dati.metriche;
    const aperta = stato.posizione
      ? `sì, dal ${formattaMomento(stato.posizione.momentoIngresso, fuso, { conAnno: true })}`
      : "no";
    righe.push(
      `| ${nome} | ${coppia} | ${etichetta} | ${numero(m.capitaleAttuale)} € (${numero(m.variazionePercento)}%) | ` +
      `${numero(m.benchmark.differenzaDalMercato)} punti | ` +
      `${m.operazioni.chiuse} | ${m.drawdownMassimo === null ? "—" : numero(m.drawdownMassimo) + "%"} | ${aperta} |`
    );
    if (stato.lacune.length > 0) {
      const candeleMancanti = stato.lacune.reduce((somma, l) => somma + l.candele, 0);
      const buchi = stato.lacune.length === 1 ? "buco" : "buchi";
      note.push(`- ${nome} · ${coppia}: ${candeleMancanti} candele mancanti nei dati (${stato.lacune.length} ${buchi}), dichiarate e non inventate.`);
    }
  }

  const settimanali = elementi.filter((e) => e.settimanale && !e.portafoglio);
  if (settimanali.length > 0) {
    righe.push(
      "",
      "## Strategie settimanali (prova in avanti)",
      "",
      "Esecuzione al prezzo di chiusura della candela oraria del lunedì 00:00–01:00 UTC. Il confronto è con il buy and hold della stessa coppia dalla prima settimana della prova.",
      "",
      "| strategia | coppia | operazioni chiuse | settimane dentro | rendimento contro buy and hold | drawdown massimo | campione |",
      "|---|---|---:|---:|---|---:|---|",
      ...righeSintesiSettimanale(settimanali)
    );
  }

  const portafoglio = elementi.filter((e) => e.portafoglio);
  if (portafoglio.length > 0) {
    righe.push("", ...sezionePortafoglio({ elementi: portafoglio, capitale: lab.capitaleIniziale, nome: portafoglio[0].nome }));
  }

  const giornaliera = opzioni.giornaliera;
  if (giornaliera) {
    righe.push("", ...(giornaliera.dati
      ? sezioneGiornaliera({ nome: giornaliera.nome, dati: giornaliera.dati, capitale: giornaliera.capitale, verdetto: giornaliera.verdetto, liuB: giornaliera.liuB })
      : ["## Variante «B giornaliera» (prova in avanti)", "", `In attesa della partenza di lunedì ${giornaliera.partenza}.`, ""]));
  }

  righe.push("");
  if (note.length > 0) righe.push("## Buchi nei dati", "", ...note, "");
  righe.push(
    "---",
    "",
    "Portafoglio di carta: nessun ordine è inviato a nessun exchange, nessun soldo vero è in gioco. " +
    "Non è consulenza finanziaria."
  );
  return righe.join("\n") + "\n";
}
