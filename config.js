// ────────────────────────────────────────────────────────────────
// CONFIGURATION — fill these in with your own values.
// See README.md for exactly how to obtain each one.
// ────────────────────────────────────────────────────────────────
const CONFIG = {
  // The long ID from your Google Sheet's URL:
  // https://docs.google.com/spreadsheets/d/THIS_PART/edit
  SHEET_ID: '1Mcm0Mls25vypw4d0KyqmFpdumoKmEIQmf2cJtsQLFhE',

  // The gid of the tab holding your events (0 is usually the first tab).
  // Find it in the URL after "#gid=" when that tab is open.
  SHEET_GID: '0',

  APP_TITLE: 'News Archive',

  // How long (hours) cached data is trusted before a silent refresh is
  // triggered on load. The UI always shows cached data instantly, and
  // falls back to it automatically whenever the device is offline.
  CACHE_HOURS: 24
};

// ────────────────────────────────────────────────────────────────
// IMAGES
// The Image column can hold any of these, and the app will resolve
// them all to a viewable picture automatically:
//   - A full Drive share link, e.g.
//     https://drive.google.com/file/d/1AbC.../view?usp=sharing
//   - A Drive "open" or "uc" link, e.g.
//     https://drive.google.com/open?id=1AbC...
//   - A bare Drive file ID on its own, e.g. 1AbC...
//
// Whatever's in the Image column right now (a relative folder path)
// won't resolve to a picture until it's replaced with one of the
// above — the rest of the entry (name, date, notes, etc.) still
// displays fine either way.
//
// Each file must be shared as "Anyone with the link — Viewer" for
// the image to load without the visitor signing in.
// ────────────────────────────────────────────────────────────────
