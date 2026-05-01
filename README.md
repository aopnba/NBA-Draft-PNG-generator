# NBA Draft Card Generator

This project is a static GitHub Pages app for building draft-style PNG cards from your spreadsheet and design assets.

## What It Uses

- `assets/background.png` as the base card image
- `assets/White Lines.png` as the overlay
- `assets/logos/` for school logos
- `assets/fonts/` for the `Born Strong` and `Winner` fonts
- `data/players.json` exported from `college_draft.xlsx`
- `data/team-colors.json` for school accent colors

## Local Workflow

1. Update `college_draft.xlsx`.
2. Regenerate player data:

```bash
python3 scripts/export_players.py
```

3. Open `index.html` in a browser or host the repo with GitHub Pages.

## GitHub Pages

This app has no build step. Push the repo to GitHub, then enable GitHub Pages for the repository root.

## Logo Coverage

The app can render any player in the spreadsheet, but it only shows a school logo when that team is mapped in `data/logo-aliases.json` and the logo file exists in `assets/logos/`.

When you add more logo PNGs:

1. Drop the file into `assets/logos/`.
2. Add the exact spreadsheet team name to `data/logo-aliases.json`.

## Team Colors

`data/team-colors.json` was sourced from Team Color Codes. A few schools are still unmatched in that file and currently fall back to the default blue styling until you fill them in.
