/*
 * Dubtrack Playlist Exporter
 * by Brinkie Pie (aka. jtbrinkmann)
 *
 * This exports playlists in the plug.dj format,
 * to provide compatibility with existing importers.
 * Technically it would only need  to save format and cid/fkid
 * of each song, for importers to work.
 */

// close previous instance, if any
var ref = window.pusher;
try {
  if (ref && ref.noConflict === "function") {
    ref.noConflict();
  }
} catch (e) {}

var aux = require("./auxiliaries.js");

// let FileSaver load in the background
aux.getScript(
  "FileSaver",
  "saveAs",
  "https://cdn.rawgit.com/koffsyrup/FileSaver.js/master/FileSaver.js"
);

// add CSS
aux.loadCSS(
  "jtb-css",
  "https://cdn.rawgit.com/JTBrinkmann/dubtrack-playlist-pusher/master/styles.css"
);

// show playlist manager (for maximum fun)
aux.click(document.querySelector(".play-song-link"));

// load Playlist Pusher API
window.pusher = require("./api.js");

// let JSZip load in the background, if downloading ZIPs is supported
if (window.pusher.browserSupportsZip) {
  aux.getScript(
    "JSZip",
    "JSZip",
    "https://cdnjs.cloudflare.com/ajax/libs/jszip/2.5.0/jszip.min.js"
  );
}

// load GUI
Dubtrack.app.loadUserPlaylists(function() {
  require("./gui.js");
  require("./split-playlist.js");
});
