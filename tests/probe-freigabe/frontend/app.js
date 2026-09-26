// Die Seite der Proben-App (J35, 26.09.2026): einreichen und danach zeigen,
// was das Geraet zum Lauf sagt. Der Satz kommt aus `freigabe.satz` -- die App
// formuliert die Regel nicht selbst, genau das misst die Abnahme.
const knopf = document.getElementById('einreichen');
const stand = document.getElementById('stand');
const wer = document.getElementById('wer');

const STATUS = {
  laeuft: 'Ihr Vorgang läuft.',
  wartend: 'Ihr Vorgang wartet auf eine Freigabe.',
  fertig: 'Ihr Vorgang ist freigegeben und erledigt.',
  abgebrochen: 'Ihr Vorgang wurde abgelehnt.',
  abgelaufen: 'Ihr Vorgang wurde nicht rechtzeitig freigegeben.',
  fehler: 'Ihr Vorgang ist gescheitert.',
};

async function zeige(lauf) {
  const antwort = await fetch(`api/lauf?lauf=${encodeURIComponent(lauf)}`);
  const daten = await antwort.json();
  stand.textContent = STATUS[daten.status] || `Stand: ${daten.status}`;
  wer.textContent = daten.status === 'wartend' && daten.freigabe ? daten.freigabe.satz : '';
  if (daten.status === 'laeuft' || daten.status === 'wartend') {
    setTimeout(() => zeige(lauf), 3000);
  }
}

knopf.addEventListener('click', async () => {
  knopf.disabled = true;
  stand.textContent = 'Wird eingereicht …';
  const antwort = await fetch('api/einreichen', { method: 'POST' });
  const daten = await antwort.json();
  if (!daten.lauf) {
    stand.textContent = `Einreichen ging nicht: ${daten.fehler || antwort.status}`;
    knopf.disabled = false;
    return;
  }
  knopf.dataset.lauf = String(daten.lauf);
  await zeige(daten.lauf);
});
