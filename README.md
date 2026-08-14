# News Archive — read-only PWA

A read-only, installable web app that indexes events from your Google Sheet
(Obits / People / Property / Enclosure), with search by free text, surname,
and date, and a detail "record card" view including the image held on
Google Drive.

All editing stays in the spreadsheet — this app only ever reads.

---

## 1. Prepare the Google Sheet

1. Open your spreadsheet.
2. Make sure the tab with your events has these headers in row 1 (any
   order): `ID`, `Surname`, `Forename`, `Date`, `Newspaper`, `Notes`,
   `Image`, `Category`, `Submitted date`, `Submitted by`.
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

The `Image` column needs to hold a **Drive share link** (or a bare file
ID) for each row, rather than just a filename. The app recognises any of
these:

- A full share link: `https://drive.google.com/file/d/1AbC.../view?usp=sharing`
- An "open" or "uc" link: `https://drive.google.com/open?id=1AbC...`
- A bare file ID on its own: `1AbC...`

For each file: right-click → **Share** → **Anyone with the link — Viewer**
→ copy the link → paste it into that row's `Image` cell.

> Your current sheet stores folder-relative paths (e.g.
> `Events by date_Images/ID-xxxx.png`) rather than links, so images won't
> show until those cells are replaced with real share links — every other
> field displays fine in the meantime. If you'd rather not hand-edit
> hundreds of rows, a short Apps Script or a find-and-replace formula can
> convert a list of filenames to links in bulk — say the word if you'd
> like help with that once you're ready.

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

1. Create a new GitHub repo and push everything in this folder to it.
2. Repo **Settings → Pages** → Source: deploy from the `main` branch,
   root folder.
3. Visit the published URL. On phones and most desktop browsers, you'll
   get an **Install** / **Add to Home Screen** prompt (or option in the
   browser menu) — that's the PWA part.

## How it works

- **Data**: the app fetches your sheet's published JSON feed
  (`gviz/tq`) on load and on refresh. No backend, no build step, no API
  key.
- **Images**: each entry's `Image` value is parsed directly for a Drive
  file ID and turned into a viewable thumbnail URL — no Drive API calls,
  no listing folders.
- **Offline**: works the same way as the St John's burials app —
  - A service worker caches the app shell (HTML/CSS/JS/icons) so the app
    can still *open* offline.
  - The event data itself is cached in **IndexedDB** after every
    successful fetch, with a timestamp.
  - On load, the app shows the cached data instantly, then refreshes
    quietly in the background if the cache is older than `CACHE_HOURS`
    (default 24) **and** the device is online. If the device is offline,
    it just keeps showing the cached data rather than trying to fetch.
  - Images depend on a live connection to Drive, so they won't load
    offline even though the text entries will.
- **Search/filter**: everything happens client-side against the currently
  loaded rows — free text (surname, forename, newspaper, notes,
  category), surname-only, a date range, and category chips, plus sorting
  by date or surname.

## Customising

- Column names: if your headers differ from the defaults, add aliases in
  `FIELD_ALIASES` at the top of `js/app.js`.
- Look and feel: all colours/fonts are CSS variables at the top of
  `css/styles.css`.
- Categories: the category chips are built automatically from whatever
  values appear in your `Category` column — no need to hardcode
  Obits/People/Property/Enclosure.
- Cache length: change `CACHE_HOURS` in `js/config.js`.

## Troubleshooting

- **"Could not reach the spreadsheet"** — check the sheet is published
  (or shared "Anyone with the link") and `SHEET_ID`/`SHEET_GID` are
  correct.
- **Entries show but no images** — check that cell's `Image` value is a
  real Drive share link (not a filename or folder path) and that the file
  is shared "Anyone with the link".
- **Blank list** — open the browser console (F12) for the exact error;
  most often it's a header name mismatch (see Customising above).
- **Nothing loads offline the first time** — the very first visit needs a
  live connection to populate the IndexedDB cache; after that, it'll open
  offline with whatever was last fetched.
