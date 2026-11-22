/**
 * lib/laboratorio.js — il laboratorio letto dal disco: la configurazione, le strategie attive, lo stato salvato.
 *
 * È shell, come persistenza.js, ma legge soltanto: non scrive, non scarica, non decide. Il giro lo usa
 * per partire; la dashboard per vedere quello che il giro ha lasciato in risultati/ e dati/.
 */

import fs from "node:fs";
import path from "node:path";

import { leggiJson, leggiStoriaSettimanale } from "./persistenza.js";
import { leggiStrategia } from "./configurazione.js";
import { esecuzioneDi, nuovoStato } from "./simulazione.js";
import { problemiSettimanale, nuovoStatoProva } from "./prova.js";
import { problemiGiornaliera } from "./giornalieraProva.js";

/** laboratorio.json, con i campi che servono a tutti. */
export function caricaLaboratorio(radice) {
  const lab = leggiJson(path.join(radice, "laboratorio.json"));
  if (!lab) throw new Error("manca laboratorio.json");
  for (const campo of ["mercato", "intervalloMinuti", "capitaleIniziale", "fusoOrario"]) {
    if (lab[campo] === undefined) throw new Error(`laboratorio.json: manca «${campo}»`);
  }
  return lab;
}

/**
 * Le strategie di strategie/, validate, con il loro modo di girare. Una strategia che non passa la
 * validazione ferma tutto: meglio fermi che con valori inventati.
 */
export function caricaStrategie(radice, lab) {
  const cartella = path.join(radice, "strategie");
  const file = fs.readdirSync(cartella).filter((f) => f.endsWith(".json")).sort();
  if (file.length === 0) throw new Error("nessuna strategia in strategie/");
  return file.map((f) => {
    const percorso = path.join(cartella, f);
    const nome = path.basename(f, ".json");
    // le strategie settimanali (la prova di Liu e Tsyvinski) hanno una regola diversa: si validano a parte
    const grezza = leggiJson(percorso);
    if (grezza?.tipo === "settimanale") {
      const problemi = problemiSettimanale(grezza);
      if (problemi.length > 0) throw new Error(`strategia settimanale ${nome} non valida: ${problemi.join("; ")}`);
      return { nome, strategia: grezza, settimanale: true, intervallo: 1440, coppie: grezza.coppie, legacy: false, portafoglio: grezza.portafoglio === true };
    }
    // la variante «B giornaliera»: una regola sua, con storia e richieste proprie, vedi lib/giornalieraProva.js
    if (grezza?.tipo === "giornaliera") {
      const problemi = problemiGiornaliera(grezza);
      if (problemi.length > 0) throw new Error(`strategia giornaliera ${nome} non valida: ${problemi.join("; ")}`);
      return { nome, strategia: grezza, giornaliera: true, intervallo: 1440, coppie: grezza.coppie, legacy: false, portafoglio: false };
    }
    const strategia = leggiStrategia(percorso);
    return { nome, strategia, ...esecuzioneDi(strategia, lab) };
  });
}

/**
 * Gli elementi della sintesi come il giro li ha lasciati su disco, e le storie della variante giornaliera.
 * Stessa forma degli elementi che il giro costruisce; in più `partenza`, per chi vuole contare il tempo.
 * Uno stato che non c'è ancora è uno stato nuovo, come al primo giro.
 */
export function elementiSalvati(radice, strategie, lab) {
  const dentro = (...parti) => path.join(radice, ...parti);
  const elementi = [];
  const storieGiornaliere = {};
  for (const { nome, strategia, intervallo, coppie, legacy, settimanale, portafoglio, giornaliera } of strategie) {
    for (const coppia of coppie) {
      if (giornaliera) {
        storieGiornaliere[coppia] = leggiStoriaSettimanale(dentro("dati", "giornaliere", `${coppia}.csv`));
        continue;
      }
      if (settimanale) {
        elementi.push({
          nome,
          coppia,
          stato: leggiJson(dentro("risultati", nome, coppia, "stato.json")) ?? nuovoStatoProva({ lab, coppia }),
          storia: leggiStoriaSettimanale(dentro("dati", "settimanali", `${coppia}.csv`)),
          settimanale: true,
          portafoglio: portafoglio === true,
          partenza: strategia.partenza ?? null
        });
        continue;
      }
      const stato = leggiJson(dentro("risultati", ...(legacy ? [nome] : [nome, coppia]), "stato.json")) ??
        nuovoStato({ capitaleIniziale: lab.capitaleIniziale, mercato: coppia, intervalloMinuti: intervallo, fusoOrario: lab.fusoOrario });
      elementi.push({ nome, coppia, intervallo, stato, partenza: null });
    }
  }
  return { elementi, storieGiornaliere };
}
