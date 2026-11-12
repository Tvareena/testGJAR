// Game flow (T25): Title -> [scene before] -> Puzzle (+ Activating) -> [scene after] -> next spell ... -> End.
// States follow the TDD diagram: Boot, Title, Story, Puzzle, Activating, End, Author. Activating lives inside
// the puzzle scene (the casting ceremony overlays the puzzle screen, Phase 5).

export function createFlow(game) {
  const levels = () => game.data.levels;

  /** Play a story scene, then continue. Skipped with ?nostory or when the scene id is empty. */
  function story(sceneId, next) {
    if (!sceneId || game.flags.nostory) { next(); return; }
    game.go('story', { sceneId, next });
  }

  function playLevel(i) {
    story(levels()[i].sceneBefore, () => game.go('puzzle', { levelIndex: i }));
  }

  return {
    toTitle() {
      game.go('title');
    },

    newGame() {
      for (const k of Object.keys(game.results)) delete game.results[k];
      playLevel(0);
    },

    /** Called when the player dismisses a successful activation. */
    levelPassed(i) {
      story(levels()[i].sceneAfter, () => {
        if (i + 1 < levels().length) playLevel(i + 1);
        else game.go('end');
      });
    },
  };
}
