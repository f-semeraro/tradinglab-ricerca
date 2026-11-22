/**
 * scripts/giro.js — un giro del laboratorio, poi esce.
 *
 *     npm run giro
 *
 * Scarica le candele chiuse da Kraken (endpoint pubblico, nessuna chiave), fa
 * avanzare ogni strategia sulle candele che non ha ancora elaborato, salva lo
 * stato, e aggiorna la sintesi. GitHub Actions lo lancia ogni ora.
 *
 * Ogni strategia gira sul suo intervallo e sulle sue coppie. Quelle vecchie
 * (senza `intervallo` né `coppie`) girano sul mercato di laboratorio.json, come
 * sempre, e il loro stato resta in risultati/<nome>/. Le altre hanno uno stato
 * per coppia, in risultati/<nome>/<coppia>/.
 *
 * Si scarica solo quando serve: una candela si può elaborare quando è chiusa da
 * più di un intervallo, quindi un'occhiata a Kraken basta una volta per candela.
 *
 * Due regole di scrittura:
 *   · se un download fallisce, non si scrive niente: meglio un giro saltato che
 *     uno parziale che sembra completo;
 *   · per ogni portafoglio prima lo stato intero, poi il cursore. Se il processo
 *     muore in mezzo, lo stato dice la verità e nessuna candela si conta due volte.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { candeleChiuse } from "../lib/kraken.js";
import { domenicaChiusa, richiesteDaFare, richiestaGiornalieraDaFare } from "../lib/politicaRichieste.js";
import { paginaMonete, curvaMedia } from "../lib/portafoglioSintesi.js";
import { verdettoDovuto } from "../lib/verdettoPortafoglio.js";
import { aggiornaStoriaGiornaliera, verdetto as verdettoGiornaliera, sintesiGiornaliera } from "../lib/giornalieraProva.js";
import { candeleNecessarie } from "../lib/configurazione.js";
import { nuovoStato, avanza, pianoDelGiro, ultimaCandelaElaborata } from "../lib/simulazione.js";
import { leggiJson, scriviJson, scriviAtomico, leggiStoriaSettimanale, scriviStoriaSettimanale } from "../lib/persistenza.js";
import { aggiornaStoria, passoPerCoppia, nuovoStatoProva } from "../lib/prova.js";
import { caricaLaboratorio, caricaStrategie } from "../lib/laboratorio.js";
import { testoSintesi } from "../lib/sintesi.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dentro = (...parti) => path.join(RADICE, ...parti);
const PAUSA_TRA_RICHIESTE_MS = 1000; // Kraken è pubblico e gratuito: si chiede con calma
const GIORNO_MS = 86400000;
const giornoIso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Lo stato delle richieste di una coppia settimanale: l'ultima domenica per cui ciascuna è andata a buon fine. */
function statoRichieste(coppia) {
  const stato = leggiJson(dentro("dati", "settimanali", `${coppia}.richieste.json`)) ?? {};
  return { ultimaGiornaliera: stato.ultimaGiornaliera ?? null, ultimaOraria: stato.ultimaOraria ?? null };
}

/** L'ultimo giorno in cui la richiesta giornaliera della variante è stata tentata: vedi lib/politicaRichieste.js. */
function statoRichiesteGiornaliere(coppia) {
  return leggiJson(dentro("dati", "giornaliere", `${coppia}.richieste.json`)) ?? { ultimoTentativo: null };
}

/** Le chiavi (coppia, intervallo) che servono davvero adesso: una candela nuova è chiusa da almeno un intervallo. */
function chiaviDaScaricare(strategie, adessoSecondi, adessoMs) {
  const chiavi = new Map();
  for (const { nome, intervallo, coppie, legacy, settimanale, giornaliera } of strategie) {
    const durata = intervallo * 60;
    for (const coppia of coppie) {
      if (giornaliera) {
        // una richiesta giornaliera per coppia al giorno, anche se fallisce: vedi lib/politicaRichieste.js
        const richiesta = richiestaGiornalieraDaFare({ adessoMs, ultimoTentativo: statoRichiesteGiornaliere(coppia).ultimoTentativo });
        if (richiesta.fare) chiavi.set(`${coppia}|1440`, true);
        continue;
      }
      if (settimanale) {
        // al più una richiesta giornaliera e una oraria per coppia a settimana: vedi lib/politicaRichieste.js
        const richieste = richiesteDaFare({ adessoMs, ...statoRichieste(coppia) });
        if (richieste.giornaliera) chiavi.set(`${coppia}|1440`, true);
        if (richieste.oraria) chiavi.set(`${coppia}|60`, true);
        continue;
      }
      const cursore = leggiJson(dentro("risultati", ...(legacy ? [nome] : [nome, coppia]), "cursore.json"));
      // la candela dopo l'ultima elaborata si chiude a ultima + 2 intervalli: prima non c'è niente da fare
      const serve = !cursore || adessoSecondi >= cursore.ultimaCandelaElaborata + 2 * durata;
      const chiave = `${coppia}|${intervallo}`;
      chiavi.set(chiave, chiavi.get(chiave) || serve);
    }
  }
  return [...chiavi].filter(([, serve]) => serve).map(([chiave]) => chiave);
}

/** Registra il tentativo della richiesta giornaliera, riuscito o no: una al giorno per coppia, vedi lib/politicaRichieste.js. */
function registraTentativiGiornalieri(strategie, adessoMs) {
  for (const { coppie, giornaliera } of strategie) {
    if (!giornaliera) continue;
    for (const coppia of coppie) {
      if (richiestaGiornalieraDaFare({ adessoMs, ultimoTentativo: statoRichiesteGiornaliere(coppia).ultimoTentativo }).fare) {
        scriviJson(dentro("dati", "giornaliere", `${coppia}.richieste.json`), { ultimoTentativo: giornoIso(adessoMs) });
      }
    }
  }
}

async function main() {
  const lab = caricaLaboratorio(RADICE);
  const strategie = caricaStrategie(RADICE, lab);

  // l'orologio si legge qui, nella parte che parla con il mondo: il resto riceve i numeri
  const adessoMs = Date.now();
  const ultimoGiroPrecedente = leggiJson(dentro("risultati", "ultimo-giro.json"))?.ultimoGiroMs ?? null;
  const daScaricare = chiaviDaScaricare(strategie, Math.floor(adessoMs / 1000), adessoMs);

  /* tutti i download prima di scrivere: se uno fallisce, non si scrive niente */
  const candele = new Map();
  const errori = [];
  for (const [i, chiave] of daScaricare.entries()) {
    const [coppia, intervallo] = chiave.split("|");
    if (i > 0) await new Promise((risolvi) => setTimeout(risolvi, PAUSA_TRA_RICHIESTE_MS));
    const risposta = await candeleChiuse({ coppia, intervalloMinuti: Number(intervallo), adessoMs });
    if (risposta.errore) errori.push(`${coppia} (${intervallo} min): ${risposta.errore}`);
    else if (risposta.candele.length === 0) errori.push(`${coppia} (${intervallo} min): nessuna candela chiusa`);
    else candele.set(chiave, risposta.candele);
  }
  // il tentativo giornaliero si registra anche se il download è fallito: al più uno al giorno
  registraTentativiGiornalieri(strategie, adessoMs);
  if (errori.length > 0) {
    console.error(`mercato non raggiungibile: ${errori.join("; ")}. Riprovo al prossimo giro.`);
    process.exitCode = 1;
    return;
  }

  const elementi = [];
  const storieGiornaliere = new Map();
  for (const { nome, strategia, intervallo, coppie, legacy, settimanale, portafoglio, giornaliera } of strategie) {
    for (const coppia of coppie) {
      if (giornaliera) {
        // lo storico giornaliero cresce con le candele del giro; le decisioni si ricalcolano dalla storia, a ogni giro
        const storiaPath = dentro("dati", "giornaliere", `${coppia}.csv`);
        if (!fs.existsSync(storiaPath)) {
          throw new Error(`storia giornaliera di ${coppia} mancante: va costruita con scripts/b-giornaliera-universo.js`);
        }
        const nuove = candele.get(`${coppia}|1440`);
        const storia = aggiornaStoriaGiornaliera(leggiStoriaSettimanale(storiaPath), nuove ?? []);
        if (nuove) scriviStoriaSettimanale(storiaPath, storia);
        storieGiornaliere.set(coppia, storia);
        continue;
      }
      if (settimanale) {
        // prima lo storico delle domeniche, poi lo stato: un'interruzione tra i due non conta due volte
        const storiaPath = dentro("dati", "settimanali", `${coppia}.csv`);
        const precedente = leggiStoriaSettimanale(storiaPath);
        const storia = aggiornaStoria(precedente, candele.get(`${coppia}|1440`) ?? []);
        if (storia.length !== precedente.length) scriviStoriaSettimanale(storiaPath, storia);
        // una richiesta conta come fatta solo se ha portato la candela che serve: altrimenti si ripete al giro successivo
        const domenica = domenicaChiusa(adessoMs);
        const lunedi = Date.parse(domenica) / 1000 + 86400;
        const fatte = statoRichieste(coppia);
        const ultimaRiga = storia.at(-1);
        if (ultimaRiga?.data === domenica && ultimaRiga.chiusura !== null) fatte.ultimaGiornaliera = domenica;
        if ((candele.get(`${coppia}|60`) ?? []).some((c) => c.momento === lunedi)) fatte.ultimaOraria = domenica;
        scriviJson(dentro("dati", "settimanali", `${coppia}.richieste.json`), fatte);

        const statoPath = dentro("risultati", nome, coppia, "stato.json");
        const stato = leggiJson(statoPath) ?? nuovoStatoProva({ lab, coppia });
        const eseguiti = passoPerCoppia({ stato, strategia, storia, orarie: candele.get(`${coppia}|60`) ?? [], coppia, lab });
        scriviJson(statoPath, stato);
        console.log(`${nome} · ${coppia}: ${eseguiti.length} eventi eseguiti`);
        elementi.push({ nome, coppia, stato, storia, settimanale: true, portafoglio: portafoglio === true });
        continue;
      }

      const cartella = dentro("risultati", ...(legacy ? [nome] : [nome, coppia]));
      const statoPath = path.join(cartella, "stato.json");
      const cursorePath = path.join(cartella, "cursore.json");
      const etichetta = legacy ? nome : `${nome} · ${coppia}`;

      const stato = leggiJson(statoPath) ?? nuovoStato({
        capitaleIniziale: lab.capitaleIniziale,
        mercato: coppia,
        intervalloMinuti: intervallo,
        fusoOrario: lab.fusoOrario
      });

      const serie = candele.get(`${coppia}|${intervallo}`);
      if (!serie) {
        console.log(`${etichetta}: niente di nuovo`);
      } else {
        const primaValutabile = candeleNecessarie(strategia) - 1;
        const { da, a, lacuna } = pianoDelGiro(stato, serie, primaValutabile, intervallo);

        if (da < a) {
          if (lacuna) stato.lacune.push(lacuna);
          avanza(stato, serie, da, a, strategia);

          // prima lo stato intero, poi il cursore: vedi il commento in testa
          scriviJson(statoPath, stato);
          scriviJson(cursorePath, { ultimaCandelaElaborata: ultimaCandelaElaborata(stato) });
          console.log(`${etichetta}: ${a - da} candele elaborate`);
        } else {
          console.log(`${etichetta}: niente di nuovo`);
        }
      }

      elementi.push({ nome, coppia, intervallo, stato });
    }
  }

  // la variante giornaliera: la sezione in SINTESI, e il verdetto una sola volta, quando quello di liu-b è dovuto
  const giornaliere = strategie.filter((s) => s.giornaliera);
  if (giornaliere.length > 1) throw new Error("una sola variante giornaliera alla volta");
  let giornaliera = null;
  if (giornaliere.length === 1) {
    const { nome, strategia } = giornaliere[0];
    const storie = Object.fromEntries(storieGiornaliere);
    const verdettoPath = dentro("risultati", nome, "verdetto.json");
    let verdettoEmesso = leggiJson(verdettoPath);
    const liuB = elementi.filter((e) => e.portafoglio);
    const curvaLiuB = curvaMedia(liuB, lab.capitaleIniziale, "portafoglio");
    const operazioniLiuB = liuB.reduce((somma, e) => somma + (e.stato.operazioni?.length ?? 0), 0);
    if (!verdettoEmesso && curvaLiuB.length > 0 && verdettoDovuto({ settimaneTrascorse: curvaLiuB.length, operazioniChiuse: operazioniLiuB }).dovuto) {
      // la domenica in cui il verdetto di liu-b è diventato dovuto: l'ultima della sua curva
      const domenica = giornoIso(Math.max(...curvaLiuB.map((c) => c.momento)) * 1000 - GIORNO_MS);
      verdettoEmesso = { ...verdettoGiornaliera({ storie, partenza: strategia.partenza, domenica }), emesso: giornoIso(adessoMs) };
      scriviJson(verdettoPath, verdettoEmesso);
    }
    giornaliera = sintesiGiornaliera({ nome, strategia, storie, portafoglio: liuB, capitale: lab.capitaleIniziale, adessoMs, verdetto: verdettoEmesso });
  }

  scriviJson(dentro("risultati", "ultimo-giro.json"), { ultimoGiroMs: adessoMs });
  scriviAtomico(dentro("risultati", "SINTESI.md"), testoSintesi(elementi, lab, { adessoMs, ultimoGiroPrecedente, giornaliera }));
  const portafoglio = elementi.filter((e) => e.portafoglio);
  if (portafoglio.length > 0) {
    scriviAtomico(dentro("report", "b-portafoglio-monete.md"), paginaMonete(portafoglio, lab.capitaleIniziale));
  }
}

main().catch((errore) => {
  console.error(`giro interrotto: ${errore.message}`);
  process.exitCode = 1;
});
