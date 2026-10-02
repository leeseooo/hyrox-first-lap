// Keep Space a held race control, including auto-repeat and native button keyup.
export function bindRaceKeyboard({ document, start, stop, getInput, escape }) {
  let spaceHeld = false;
  const gameplayTarget = (target) =>
    !target?.closest?.(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), button:not(#hold), a, summary, [role="button"]:not(#hold)',
    );
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      escape();
      return;
    }
    if (e.code !== 'Space' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!spaceHeld && !gameplayTarget(e.target)) return;
    // Cancel the browser action BEFORE ignoring repeats; repeats otherwise scroll.
    e.preventDefault();
    if (e.repeat) return;
    spaceHeld = true;
    if (!getInput()) start('keyboard');
  });
  document.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    if (spaceHeld || gameplayTarget(e.target)) e.preventDefault();
    spaceHeld = false;
    if (getInput() === 'keyboard') stop();
  });
}
