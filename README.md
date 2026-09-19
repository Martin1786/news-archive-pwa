# News Archive — read-only PWA

A read-only, installable web app that indexes events from your Google Sheet
(Obits / People / Property / Enclosure), with search by free text, surname,
year range, and category, plus a detail "record card" view including the
newspaper clipping image.

All editing stays in the spreadsheet — this app only ever reads.

---

## File locations (read this before uploading changes)

If you're updating files on GitHub, each one has one correct home. Uploading
to the wrong place creates a stray duplicate that the live app never
actually uses:

| File | Belongs at |
|---|---|
| `index.html`, `manifest.json`, `service-worker.js`, `README.md` | repo root |
| `app.js`, `config.js` | inside `js/` |
| `styles.css` | inside `css/` |
| `icon-192.png`, `icon-512.png` | inside `icons/` |

Easiest way to upload correctly: navigate into the actual folder on GitHub
first (so the URL ends in `/tree/main/js`, `/tree/main/css`, etc.), *then*
use Add file → Upload files from inside it.

---

## 1. Prepare the Google Sheet

1. Open your spreadsheet.
2. Make sure the tab with your events has these headers in row 1 (any
   order): `ID`, `Surname`, `Forename`, `Date`, `Newspaper`, `Notes`,
   `Category`, `Submitted date`, `Submitted by`, and an image column (see
   below).
3. **File → Share → Publish to web.**
   - Choose the specific sheet/tab (not "Entire document" unless you only
     have one tab).
   - Format: **Web page** is fine — the app reads the tab's JSON feed
     directly, this step just switches on public read access to that tab.
   - Click **Publish**.
   - (If the tab is already shared as "Anyone with the link can view",
     the feed may already work without this step — worth testing first.)
4. Get two IDs from the sheet's URL, e.g.:
   `https://docs.google.com/spreadsheets/d/1AbCдефXYZ/edit#gid=482910238`
   - `SHEET_ID` = `1AbCдефXYZ`
   - `SHEET_GID` = `482910238` (open the correct tab first, then copy the
     number after `gid=`)

## 2. Images — no API key needed

Add a column called **`PWA_Image_URL`** and put each entry's photo link in
there. The app recognises any of these:

- A full Drive share link: `https://drive.google.com/file/d/1AbC.../view?usp=sharing`
- A Drive "open" or "uc" link: `https://drive.google.com/open?id=1AbC...`
- A bare Drive file ID on its own: `1AbC...`
- Any other direct `https://` image URL (doesn't have to be Drive at all)

For a Drive file: right-click → **Share** → **Anyone with the link — Viewer**
→ copy the link → paste it into that row's `PWA_Image_URL` cell.

If a row's `PWA_Image_URL` is empty, the app falls back to an older
`Image` column if you still have one — but `PWA_Image_URL` is the one to
use going forward.

## 3. Fill in `js/config.js`

```js
const CONFIG = {
  SHEET_ID: '1AbCдефXYZ',
  SHEET_GID: '482910238',
  APP_TITLE: 'News Archive',
  CACHE_HOURS: 24
};
```

## 4. Deploy on GitHub Pages

1. Create a new GitHub repo and push everything in this folder to it,
   respecting the file locations table above.
2. Repo **Settings → Pages** → Source: deploy from the `main` branch,
   root folder.
3. Visit the published URL. On phones and most desktop browsers, you'll
   get an **Install** / **Add to Home Screen** prompt (or option in the
   browser menu) — that's the PWA part.

## How it works

- **Data**: the app fetches your sheet's published JSON feed (`gviz/tq`)
  on load and on refresh, using a no-cache request so a manual refresh
  always gets truly current data rather than a stale browser-cached copy.
  No backend, no build step, no API key.
- **Images**: each entry's `PWA_Image_URL` (or legacy `Image`) value is
  parsed directly for a Drive file ID, or used as-is if it's already a
  plain image URL — no Drive API calls, no folder listing.
- **Offline**: 
  - A service worker caches the app shell (HTML/CSS/JS/icons) so the app
    can still *open* offline.
  - The event data itself is cached in **IndexedDB** after every
    successful fetch, with a timestamp.
  - On load, the app shows the cached data instantly, then refreshes
    quietly in the background if the cache is older than `CACHE_HOURS`
    (default 24) **and** the device is online.
  - The **Clear cache** link in the header wipes everything and
    re-downloads from scratch — the reliable option if data still looks
    stale after a normal refresh (Google's own published-sheet feed can
    take a couple of minutes to reflect an edit, so give it a moment
    first).
  - Images depend on a live connection, so they won't load offline even
    though the text entries will.
- **Search/filter**: free text (surname, forename, newspaper, notes,
  category), surname-only, a year range (not exact dates), and category
  chips, plus sorting by date or surname.
- **Colour-coding**: each newspaper and each category gets a consistent
  colour, shown in the index cards, the detail record card, and the
  category filter chips.
- **Mobile navigation**: on phones and tablets, the phone's back button
  (or gesture) closes an open entry and returns to the index, rather than
  leaving the app. A "back to top" button appears once you've scrolled
  down the index.
- **Layout**: single column on phones (filters tucked behind a
  tap-to-expand panel), two columns on tablets, and the full three-column
  layout (filters / index / detail) on desktop.

## Customising

- Column names: if your headers differ from the defaults, add aliases in
  `FIELD_ALIASES` at the top of `js/app.js`.
- Look and feel: all colours/fonts are CSS variables at the top of
  `css/styles.css`. The newspaper and category colour palettes are the
  `NEWSPAPER_COLORS` / `CATEGORY_COLOR_MAP` constants near the top of
  `js/app.js`.
- Categories: the category chips are built automatically from whatever
  values appear in your `Category` column — no need to hardcode
  Obits/People/Property/Enclosure. The four named categories get
  deliberately chosen colours; anything else gets one from a spare
  fallback palette automatically.
- Cache length: change `CACHE_HOURS` in `js/config.js`.

## Troubleshooting

- **"Could not reach the spreadsheet"** — check the sheet is published
  (or shared "Anyone with the link") and `SHEET_ID`/`SHEET_GID` are
  correct.
- **Entries show but no images** — check that cell's `PWA_Image_URL`
  value is a real link (not a filename or folder path) and that the file
  is shared "Anyone with the link".
- **Data looks stale after editing the sheet** — click **Clear cache**,
  then wait a minute or two; Google's published-feed can lag behind an
  edit briefly even with a forced refresh.
- **A code change doesn't seem to have taken effect** — after uploading,
  open the live site and unregister the service worker once (DevTools →
  Application → Service Workers → Unregister → reload). The app bumps
  its own cache version with most updates, but this guarantees it.
- **Blank list** — open the browser console (F12) for the exact error;
  most often it's a header name mismatch (see Customising above).
- **Nothing loads offline the first time** — the very first visit needs a
  live connection to populate the IndexedDB cache; after that, it'll open
  offline with whatever was last fetched.
