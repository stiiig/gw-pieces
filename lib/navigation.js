// Navigation entre les écrans, en restant sur le même dossier (écrans Dossiers, Pièces, Criblage, Avis).
//
// Liens : ancre Grist #a1.s<section>.r<ligne>.c<colonne> vers la page de l'écran voulu. Les écrans sont repérés dans les
// métadonnées du document par le dossier de leur adresse (avis/, criblage/, dossiers/ ; la racine = validation des pièces).
//
// Suivi du curseur : Grist renvoie onRecord à chaque modification de données, avec la ligne où se trouve son curseur
// (grist-core, WidgetFrame.ts : TableNotifier). L'écran ne réagit donc qu'à un déplacement du curseur, et place le curseur
// de Grist sur le dossier qu'il affiche (setCursorPos) : une écriture ne le renvoie plus sur une autre ligne.
// Le curseur reçu avant le chargement des données est gardé et ouvert au démarrage (lien arrivant d'un autre écran).
// Un clic sur un bouton note aussi le dossier (stockage local, partagé par les écrans servis depuis la même adresse) :
// l'écran Dossiers, qui s'ouvre d'ordinaire sur la liste, sait ainsi qu'on lui demande la fiche.
const Navigation = (() => {
  const lignes = t => (t.id || []).map((id, i) => { const o = { id }; for (const k in t) o[k] = t[k][i]; return o; });
  let ecrans = {}, curseur = null;

  async function reperer(tableDossiers) {
    const [sec, pages, tables, cols, jeton, nomDoc] = await Promise.all(['_grist_Views_section', '_grist_Pages', '_grist_Tables', '_grist_Tables_column']
      .map(t => grist.docApi.fetchTable(t).then(lignes)).concat(grist.docApi.getAccessToken({ readOnly: true }), grist.docApi.getDocName()));
    const m = /^(https?:\/\/[^/]+)(.*)\/api\/docs\/([^/?#]+)/.exec(jeton.baseUrl || ''); if (!m) return;
    // Avec le nom du document dans l'adresse (…/<doc>/<nom>/p/…) : sans lui, Grist redirige et perd l'ancre #a1…
    // (constaté le 14/10). Nom fabriqué comme Grist (gristUrls.ts, nameToSlug) : sans accents, alphanumérique, espaces en tirets.
    const slug = String(nomDoc || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9\s-]/g, '').trim().split(/[\s-]+/).filter(Boolean).join('-');
    const base = `${m[1]}${m[2] || '/o/docs'}/${m[3]}${slug ? '/' + slug : ''}`;
    const table = (tables.find(t => t.tableId === tableDossiers) || {}).id;
    const col = (cols.find(c => c.parentId === table && c.colId === 'dossier_number') || {}).id;
    const out = {};
    for (const sct of sec) {
      if (sct.tableRef !== table || !sct.options) continue;
      let url; try { url = new URL(JSON.parse(JSON.parse(sct.options).customView || '{}').url); } catch (e) { continue; }
      const dossier = url.pathname.split('/').filter(Boolean).pop();
      const nom = { avis: 'avis', criblage: 'criblage', dossiers: 'fiche' }[dossier] || (['export', 'tableau-de-bord', 'espace'].includes(dossier) ? null : 'pieces');
      const page = pages.find(p => p.viewRef === sct.parentId);
      if (nom && page) out[nom] = { page: page.id, section: sct.id, col, base };
    }
    ecrans = out;
  }
  const lien = (nom, rowId) => { const e = ecrans[nom]; return e ? `${e.base}/p/${e.page}#a1.s${e.section}.r${rowId}.c${e.col}` : ''; };
  const LIBELLES = [['fiche', 'Détail'], ['pieces', 'Pièces'], ['criblage', 'Criblage'], ['avis', 'Avis']];
  // Boutons vers les autres écrans pour ce dossier (sauf l'écran courant) ; rien hors Grist ou si l'écran n'est pas trouvé.
  const boutons = (ici, rowId, esc) => LIBELLES.filter(([k]) => k !== ici && lien(k, rowId))
    .map(([k, l]) => `<a class="bouton" target="_top" data-nav="${rowId}" href="${esc(lien(k, rowId))}">${l} →</a>`).join(' ');
  const CLE = 'cassiopee-lien';
  document.addEventListener('click', e => { const a = e.target.closest('a[data-nav]'); if (!a) return;
    try { localStorage.setItem(CLE, JSON.stringify({ rowId: Number(a.dataset.nav), t: Date.now() })); } catch (err) { /* stockage indisponible : la fiche ne s'ouvrira pas d'elle-même */ } });
  function lienRecent() {  // dossier d'un bouton cliqué il y a moins de 30 secondes (lu une seule fois)
    try { const v = JSON.parse(localStorage.getItem(CLE) || 'null'); localStorage.removeItem(CLE); return v && Date.now() - v.t < 30000 ? v.rowId : null; }
    catch (err) { return null; }
  }

  // L'écran affiche le dossier rowId : le curseur de Grist le suit.
  function placer(rowId) {
    if (window.self === window.top || rowId == null || rowId === curseur) return;
    curseur = rowId; grist.setCursorPos({ rowId });
  }
  // ouvrir(rowId) est appelé quand l'utilisateur déplace le curseur de Grist (ou arrive par un lien), une fois les données chargées.
  let voulu = null, pret = false;
  function suivre(ouvrir) {
    grist.onRecord(r => {
      if (!r || r.id === curseur) return;  // simple modification de données : le curseur n'a pas bougé
      curseur = r.id;
      if (pret) ouvrir(r.id); else voulu = r.id;
    });
  }
  // À appeler à la fin du chargement : renvoie le dossier à ouvrir (ou null).
  // D'abord celui du bouton cliqué sur un autre écran : l'ancre du lien ne déplace pas le curseur d'un écran
  // personnalisé (constaté dans le doc de test le 14/10). Sinon le curseur reçu avant le chargement,
  // sauf avec { lienSeulement: true } (écrans qui s'ouvrent d'ordinaire sur une liste).
  function demarre(opt = {}) {
    pret = true; const v = voulu, l = lienRecent(); voulu = null;
    if (l != null) { placer(l); return l; }
    return opt.lienSeulement ? null : v;
  }

  return { reperer, lien, boutons, placer, suivre, demarre };
})();
