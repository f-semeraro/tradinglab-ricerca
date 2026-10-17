/**
 * lib/blocchi.js — il predicato di accensione dei blocchi di ingresso e di
 * uscita. È puro: niente file, niente rete, niente orologio.
 *
 * Sta in un modulo a sé perché la logica di decisione (lib/strategia.js) lo
 * usa, e lib/strategia.js non deve dipendere da lib/configurazione.js — che
 * legge i file. Un modulo di decisione che importa un lettore di file non è
 * più un modulo puro, anche se le sue funzioni non leggono nulla da sole.
 */

/** Un blocco è acceso? `null` e assente sono lo stesso spegnimento. */
export const bloccoAttivo = (blocco) => blocco !== null && blocco !== undefined;
