import '@fontsource/exo-2/600.css';

// Page des essais de gameplay (ouverte par « Tests » de l'accueil).
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-go]')) {
  b.addEventListener('click', () => {
    const go = b.getAttribute('data-go');
    if (go) location.href = go;
  });
}
document.body.dataset.ready = '1';
