# WebsiteBench project page

The homepage for the paper *WebsiteBench: Can AI Agents Rebuild Websites through Browser Exploration?*

It is a static site with no build step and no dependencies beyond two Google Fonts.

## Preview locally

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy on GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The `.nojekyll` file stops GitHub from running Jekyll on the site.

## Things to update before going public

- **Paper, code and data links.** The page links to none of them and serves no PDF. In `index.html`, replace the `<span class="soon">Paper, code and data coming soon</span>` note in the hero with buttons once they are public (copy the `btn` markup of the Cite button).
- **Social preview.** Some platforms need an absolute URL. Change `<meta property="og:image" content="assets/og.png">` to the full URL once the page has a domain.
- **Authors.** The page names no authors while the paper is anonymous. Add them to the hero, the footer, the BibTeX block and `CITATION.cff` once it can be de-anonymized.
- **Venue.** Never mention the conference, its year or the review status anywhere on the page, in `llms.txt`, `CITATION.cff`, the social card or the PDF.

## Files

| Path | What it holds |
|---|---|
| `index.html` | All page content |
| `assets/css/site.css` | Styles, including light and dark themes |
| `assets/js/site.js` | The failure tree in the hero, the live demo, leaderboard data, charts, tabs and lightbox |
| `assets/figures/` | Figures 1, 2, 4 and 5 cropped from the paper, as WebP and PNG |
| `assets/og.png` | Social preview card, 1200 × 630 |
| `CITATION.cff`, `llms.txt` | Citation metadata and a plain-text summary for crawlers |
| `tools/` | Maintenance scripts and the social card template |

Leaderboard numbers live in the `MODELS` array in `assets/js/site.js`. They match Table 1 of the paper.

## Maintenance scripts

Both scripts need Node and Playwright (`npm i -D playwright`, or point `PLAYWRIGHT` at an existing install).

- `node tools/prerender.js` copies the leaderboard, charts and test list that `site.js` draws back into `index.html`, so they show without JavaScript and to crawlers. Serve the repo on port 8000 first, or set `BASE_URL`. Run it after changing any data in `site.js`.
- `node tools/render-og.js` redraws the social card `assets/og.png` from `tools/og.html`.
