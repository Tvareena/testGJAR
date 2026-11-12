# Kaleidoscope Spellcasting — HTML prototype

## Run locally

From this folder:

```bash
python serve.py
```

Open http://localhost:8000. `serve.py` is a plain static server that turns off browser caching, so every reload runs your latest code and data. (`python -m http.server 8000` also works, but the browser may keep old JavaScript until you press Ctrl+F5.) Opening `index.html` straight from disk does not work, because modules and data loading need HTTP.

## Where things live

| Folder | Who edits it | What |
| --- | --- | --- |
| `data/config.json` | Designer | Global tuning: colours, sizes, snaps, rating and resonance bands, activation timings |
| `data/levels.json` | Designer | The spell chain, in play order |
| `data/text.json` | Writer | All words: UI, spells, hints, barks, tutorial, story scenes |
| `assets/art/` | Artist | Final PNGs, named exactly as in `src/assets.js` (`ART_REGISTRY`) |
| `assets/audio/` | Anyone | Sound effects (.mp3) |
| `src/` | Coder | Game code |

Bad values in the JSON files never crash the game: they are replaced by defaults and listed as warnings in the browser console (F12).

## Building a release (itch.io)

1. Bump the version in `src/version.js` and the matching `?v=` in `index.html`.
2. Run `python build.py`. It writes `../builds/kaleidoscope-spellcasting-<version>.zip` with `index.html` at the root (it refuses to build if the two versions differ).
3. On itch.io: new project, kind "HTML", upload the zip, tick "This file will be played in the browser", viewport 1920 x 1080, enable "Mobile friendly" (landscape) and "Fullscreen button".
4. Open the public page on a phone and play spell 1 to the end.

## Swapping placeholders for final art

Save the PNG with the exact registry name into `assets/art/` and reload with Ctrl+F5. No code changes. Missing files are drawn as placeholders.
