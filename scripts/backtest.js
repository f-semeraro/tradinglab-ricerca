/**
 * scripts/backtest.js — la strategia sul passato, dal CSV in dati/storico/.
 *
 *     npm run backtest -- --strategia rsi-base --coppia XXBTZEUR --intervallo 1440
 *     npm run backtest -- --strategia rsi-base --da 2025-01-01 --a 2025-06-30
 *     npm run backtest -- --nota "primo confronto"
 *
 * Coppia e intervallo predefiniti sono quelli di laboratorio.json. Il file letto è
 * dati/storico/<COPPIA>-<intervallo>.csv. Senza --strategia si rigiocano tutte le strategie a
 * blocchi di strategie/; le prove in avanti settimanali e giornaliere hanno un motore loro e si saltano.
 *
 * Il calcolo è in lib/backtest.js, sulle stesse funzioni del giro (lib/simulazione.js →
 * lib/strategia.js → valuta()). Questo file legge gli argomenti e i file, e scrive i risultati.
 *
 * L'ultimo anno di dati è ESCLUSO per configurazione (laboratorio.json, escludiUltimiGiorni). Si
 * include solo con --usa-ultimo-anno, che va scritto apposta nel comando: l'ultimo anno è quello
 * che si guarda per primo, e quello su cui è più facile sbagliare.
 *
 * Non tocca risultati/: quello è lo stato dal vivo. Scrive report/<strategia>-<coppia>-<intervallo>.md
 * (sovrascritto) e aggiunge una riga a registro/esperimenti.md (mai riscritto). Prima valida tutte
 * le strategie richieste, poi scrive: un errore non lascia mai il registro aggiornato a metà.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { leggiStrategia } from "../lib/configurazione.js";
import {
  rigiocabile,
  finestraCandele,
  primaCandelaValutabile,
  eseguiBacktest,
  periodoDi,
  reportBacktest,
  rigaRegistroBacktest,
  riepilogoBacktest
} from "../lib/backtest.js";
import { impronta } from "../lib/impronta.js";
import { dataOraUTC } from "../lib/formato.js";
import { giornoUTCInSecondi } from "../lib/tempo.js";
import { leggiJson, leggiCandele, scriviAtomico, aggiungiAlRegistro } from "../lib/persistenza.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dentro = (...parti) => path.join(RADICE, ...parti);
const REGISTRO = dentro("registro", "esperimenti.md");

function leggiArgomenti(argv) {
  const opzioni = { strategie: [], coppia: null, intervallo: null, da: null, a: null, usaUltimoAnno: false, nota: "" };
  const valore = (i, nome) => {
    if (argv[i + 1] === undefined) throw new Error(`${nome} vuole un valore`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--strategia": opzioni.strategie.push(valore(i, "--strategia")); i++; break;
      case "--coppia": opzioni.coppia = valore(i, "--coppia"); i++; break;
      case "--intervallo": opzioni.intervallo = Number(valore(i, "--intervallo")); i++; break;
      case "--da": opzioni.da = valore(i, "--da"); i++; break;
      case "--a": opzioni.a = valore(i, "--a"); i++; break;
      case "--nota": opzioni.nota = valore(i, "--nota"); i++; break;
      case "--usa-ultimo-anno": opzioni.usaUltimoAnno = true; break;
      default: throw new Error(`opzione sconosciuta: ${argv[i]}`);
    }
  }
  return opzioni;
}

/** Una data AAAA-MM-GG come mezzanotte UTC in secondi; null se l'opzione non è stata data. */
function giorno(testo, opzione) {
  if (testo === null) return null;
  const secondi = giornoUTCInSecondi(testo);
  if (secondi === null) throw new Error(`${opzione} vuole una data AAAA-MM-GG vera, non ${testo}`);
  return secondi;
}

/** I nomi delle strategie da rigiocare: quelle chieste, oppure tutte quelle a blocchi di strategie/. */
function nomiStrategie(richieste) {
  const configurazione = (nome) => leggiJson(dentro("strategie", `${nome}.json`));
  if (richieste.length > 0) {
    for (const nome of richieste) {
      const grezza = configurazione(nome);
      if (!grezza) throw new Error(`manca strategie/${nome}.json`);
      if (!rigiocabile(grezza)) {
        throw new Error(`${nome} è una prova in avanti di tipo «${grezza.tipo}»: non si rigioca con questo comando`);
      }
    }
    return richieste;
  }
  const tutte = fs.readdirSync(dentro("strategie")).filter((f) => f.endsWith(".json")).map((f) => path.basename(f, ".json")).sort();
  const nomi = tutte.filter((nome) => rigiocabile(configurazione(nome)));
  if (nomi.length === 0) throw new Error("in strategie/ non c'è nessuna strategia a blocchi da rigiocare");
  return nomi;
}

function main() {
  const lab = leggiJson(dentro("laboratorio.json"));
  if (!lab) throw new Error("manca laboratorio.json");
  const opzioni = leggiArgomenti(process.argv.slice(2));

  const coppia = opzioni.coppia ?? lab.mercato;
  const intervallo = opzioni.intervallo ?? lab.intervalloMinuti;
  if (!Number.isFinite(intervallo) || intervallo <= 0) {
    throw new Error(`--intervallo vuole un numero di minuti positivo, non ${opzioni.intervallo}`);
  }

  const fonte = `dati/storico/${coppia}-${intervallo}.csv`;
  if (!fs.existsSync(dentro(fonte))) throw new Error(`manca ${fonte}`);

  // l'orologio si legge qui: serve a decidere dove finisce «l'ultimo anno» e a datare la riga di registro
  const adessoMs = Date.now();
  const { candele, escluse } = finestraCandele(leggiCandele(dentro(fonte)), {
    da: giorno(opzioni.da, "--da"),
    a: giorno(opzioni.a, "--a"),
    chiuseEntro: opzioni.usaUltimoAnno ? null : Math.floor(adessoMs / 1000) - lab.escludiUltimiGiorni * 86400,
    intervalloMinuti: intervallo
  });
  if (candele.length === 0) {
    throw new Error("nessuna candela nella finestra richiesta (ricorda: l'ultimo anno è escluso di default)");
  }

  // prima si valida tutto, poi si scrive: il registro è a sola aggiunta
  const strategie = nomiStrategie(opzioni.strategie).map((nome) => {
    const strategia = leggiStrategia(dentro("strategie", `${nome}.json`));
    const servono = primaCandelaValutabile(strategia) + 1;
    if (candele.length < servono) {
      throw new Error(`${nome}: servono almeno ${servono} candele, nella finestra ce ne sono ${candele.length}`);
    }
    return { nome, strategia };
  });

  const base = { capitaleIniziale: lab.capitaleIniziale, mercato: coppia, intervalloMinuti: intervallo, fusoOrario: lab.fusoOrario };
  const periodo = periodoDi(candele, lab.fusoOrario);
  const corse = strategie.map(({ nome, strategia }) => ({
    nome,
    impronta: impronta(strategia),
    ...eseguiBacktest({ strategia, candele, base })
  }));

  for (const corsa of corse) {
    scriviAtomico(dentro("report", `${corsa.nome}-${coppia}-${intervallo}.md`), reportBacktest({
      nome: corsa.nome,
      impronta: corsa.impronta,
      coppia,
      intervalloMinuti: intervallo,
      fonte,
      candele,
      fuso: lab.fusoOrario,
      escluse,
      giorniEsclusi: lab.escludiUltimiGiorni,
      stato: corsa.stato,
      metriche: corsa.metriche
    }));
    aggiungiAlRegistro(REGISTRO, rigaRegistroBacktest({
      data: dataOraUTC(adessoMs),
      nome: corsa.nome,
      coppia,
      impronta: corsa.impronta,
      periodo,
      metriche: corsa.metriche,
      nota: opzioni.nota
    }));
    console.log(riepilogoBacktest({ nome: corsa.nome, coppia, metriche: corsa.metriche }));
  }

  if (escluse > 0) {
    console.log(`\n(${escluse} candele dell'ultimo anno escluse: configurazione. Per includerle: --usa-ultimo-anno)`);
  }
  console.log("Report in report/. Riga aggiunta a registro/esperimenti.md.");
}

try {
  main();
} catch (errore) {
  console.error(`backtest interrotto: ${errore.message}`);
  process.exitCode = 1;
}
