var aux = require('./auxiliaries.js');
var handleInputFiles = require('./input-file-handler.js').handleInputFiles;

// song limit when fetching songs from a playlist.
// This is configured on Dubtrack's servers,
// do NOT increase the number in this code!
// It will only result in exported playlists MISSING songs!
const MAX_PAGE_SIZE = 20
const FORMATS = [void 8, 'youtube', 'soundcloud'];
const PLAYLIST_LOADED_RESET_TIMEOUT = 2 * 60000;
const PLAYLIST_LIST_RESET_TIMEOUT = 2 * 60000;

//== API ==
var pusher = {
    //== misc ==
    _debug: {},
    aux: aux,
    avgPageFetch: '200ms',
    avgPageFetchSamples: 2,
    avgSongAdd: '200ms',
    avgSongAddSamples: 2,
    playlistLoadedResetTimeouts: {},
    working: false,
    
    // data
    playlists: {},
    isImporting: false,
    
    // browser data
    browserSupportsZip = window.Blob && ((ref1$ = navigator.vendor) != null ? ref1$.indexOf('Apple') : void 8) === -1 && ((ref2$ = navigator.userAgent) != null ? ref2$.indexOf('CriOS') : void 8) === -1,

    browserSupportsDragnDrop = 'draggable' in document.body,
    // the C in this font looks like a cheap circle-arrow icon ^_^
    loadingIcon : aux.el('i', { 'class': 'jtb-spin'}, 'C'),
    setWorking : function(val){
        val = !!val;
        pusher.working = val;
        if (pusher.$browser != null) {
          pusher.$browser.classList.toggle('jtb-working', val);
        }
    },
    noConflict: function(){
        document.querySelector('.jtb').remove();
        
        pusher.$browser.classList.remove("jtb-dropping", "jtb-importing", "jtb-working")
        
        pusher.$browser.removeEventListener('dragover');
        pusher.$browser.removeEventListener('dragend');
        pusher.$browser.removeEventListener('dragleave');
        pusher.$browser.removeEventListener('drop');

        document.querySelector('.close-import-playlist').removeEventListener('click', pusher._closeBtnClick);

        document.querySelector(".sidebar .import-playlist").childNodes[1].textContent = pusher._importBtnText;

        Dubtrack.View.ImportPlaylistBrowser.prototype.openView = Dubtrack.View.ImportPlaylistBrowser.prototype.openView_;
        delete Dubtrack.View.ImportPlaylistBrowser.prototype.openView_;
        Dubtrack.View.ImportPlaylistBrowser.prototype.closeView = Dubtrack.View.ImportPlaylistBrowser.prototype.closeView_;
        delete Dubtrack.View.ImportPlaylistBrowser.prototype.closeView_;
        Dubtrack.View.playlistItem.prototype.viewDetails = Dubtrack.View.playlistItem.prototype.viewDetails_;
        delete Dubtrack.View.playlistItem.prototype.viewDetails_;
        delete Dubtrack.View.BrowserInfo.prototype.events["click .jtb-split-btn"];
        delete Dubtrack.View.BrowserInfo.prototype.events["click .jtb-split-size-btn"];
        Dubtrack.els.templates.playlist.playlistInfo = Dubtrack.els.templates.playlist.playlistInfo_;
    },
     //== EXPORTER ==
    fetchPlaylistsList: function(callback){
        var pls, i, playlistsArr, res$;
        if (typeof callback !== 'function') {
            return;
        }
        if (pusher._playlistsArr) {
            callback(void 8, pusher._playlistsArr);
        } else if (Dubtrack.app.browserView) {
            pls = Dubtrack.app.browserView.model.models;
            i = pls.length;
            res$ = [];
            while (i--) {
              res$.push(pls[i].attributes);
            }
            playlistsArr = res$;
            callback(void 8, playlistsArr);
        } else {
            aux.fetch("playlists", "https://api.dubtrack.fm/playlist", function(playlistsArr){
              if (!('length' in playlistsArr)) {
                  console.warn("playlists data not an array", playlistsArr);
                  return callback(new TypeError("couldn't parse playlists data"));
              }
              playlistsArr = playlistsArr.sort(function(a, b){
                  if (a.name < b.name) {
                    return -1;
                  } else if (a.name > b.name) {
                    return +1;
                  } else {
                    return 0;
                  }
              });
              pusher._playlistsArr = playlistsArr;
              setTimeout(function(){
                  delete pusher._playlistsArr;
              }, PLAYLIST_LIST_RESET_TIMEOUT);
              callback(void 8, playlistsArr);
            });
        }
    },
    getPlaylist: function(playlist, callback){
      var plID;
      if (typeof callback !== 'function') {
        return;
      }
      if (!playlist) {
        callback(new TypeError("no valid playlist specified"));
      } else if (playlist._id) {
        callback(void 8, playlist);
      } else {
        if (typeof playlist === 'string') {
          plID = playlist;
        } else if ('id' in playlist) {
          plID = playlist.id;
        } else {
          callback(new TypeError("no valid playlist specified"));
          return;
        }
        pusher.fetchPlaylistsList(function(err, playlistsArr){
          var i$, len$, pl;
          if (err) {
            return callback(err);
          }
          for (i$ = 0, len$ = playlistsArr.length; i$ < len$; ++i$) {
            pl = playlistsArr[i$];
            if (pl._id === plID) {
              return callback(void 8, pl);
            }
          }
          callback(new TypeError("playlist not found"));
        });
      }
    },
    fetchPlaylist: function(playlist, callback, etaCallback){
      var d;
      d = Date.now();
      pusher.getPlaylist(playlist, function(err, pl){
        var totalItems, $playlist, pages;
        if (err) {
          return typeof callback == 'function' ? callback(err) : void 8;
        }
        totalItems = pl.totalItems || 0;
        if (totalItems === 0) {
          console.log("skipping empty playlist '" + pl.name + "'");
        }
        $playlist = document.querySelector(".playlist-" + pl._id);$playlist.appendChild(pusher.$loadingIcon);
        pusher._debug.playlists = {};
        pages = Math.ceil(totalItems / MAX_PAGE_SIZE);
        $.Deferred(function(defFetchSongs){
          var songs, offset, page, fetchPage;
          songs = new Array(totalItems);
          offset = 0;
          page = 0;
          (fetchPage = function(){
            if (++page <= pages) {
              if (typeof etaCallback == 'function') {
                etaCallback(page, pages);
              }
              aux.fetch("songs (" + pl.name + ") [" + page + "/" + pages + "]", "https://api.dubtrack.fm/playlist/" + pl._id + "/songs?page=" + page, function(page){
                var i$, len$, o, _song, err;
                try {
                  for (i$ = 0, len$ = page.length; i$ < len$; ++i$) {
                    o = i$;
                    _song = page[i$]._song;
                    songs[o + offset] = {
                      id: _song._id,
                      cid: _song.fkid,
                      format: FORMATS.indexOf(_song.type),
                      artist: '',
                      title: _song.name,
                      duration: ~~(_song.songLength / 1000),
                      image: _song.images.thumbnail
                    };
                  }
                  offset += page.length;
                } catch (e$) {
                  err = e$;
                  callback(new TypeError("couldn't parse song data (" + err + ")"));
                }
                fetchPage();
              });
            } else {
              defFetchSongs.resolve(songs);
            }
          })();
        }).then(function(songs){
          $playlist.addClass('jtb-playlist-loaded');
          pusher.$loadingIcon.remove();
          clearTimeout(pusher.playlistLoadedResetTimeouts[pl._id]);
          pusher.playlistLoadedResetTimeouts[pl._id] = setTimeout(function(){
            $playlist.removeClass('jtb-playlist-loaded');
          }, PLAYLIST_LOADED_RESET_TIMEOUT);
          if (pages !== 0) {
            pusher.avgPageFetch *= pusher.avgPageFetchSamples;
            pusher.avgPageFetch += (Date.now() - d) / pages;
            pusher.avgPageFetch /= ++pusher.avgPageFetchSamples;
          }
          if (typeof callback == 'function') {
            callback(null, {
              id: pl._id,
              name: pl.name,
              totalItems: totalItems,
              data: {
                time: Date.now() - d,
                status: 'ok',
                dubtrackPlaylistPusherFormat: 2,
                data: songs,
                meta: {
                  id: pl.id,
                  name: pl.name,
                  totalItems: totalItems
                }
              }
            });
          }
        });
      });
    };
}


   


    fetchPlaylist: (playlist, callback, etaCallback) !->
        // get current time for benchmarking
        d = Date.now!

        // get playlist object, if pl is just the playlist ID
        (err, pl) <-! pusher.getPlaylist(playlist)
        return callback?(err) if err

        // check if currently displayed playlist in playlist manager
        // matches the playlist we're fetching (so we can avoid manually
        // fetching the songs)
        /*if Dubtrack.app.browserView?.browserItemsList
            songs = Dubtrack.app.browserView.browserItemsList.model.models
            if songs.0?.attributes.playlistid == pl._id
                for pl in Dubtrack.app.browserView.browserItemsList.model.models
                    ...
        */

        // new and untouched playlists might not have a totalItems attribute
        totalItems = pl.totalItems || 0
        if totalItems == 0
            console.log "skipping empty playlist '#{pl.name}'"
            // we don't actually run any code to skip the playlist
            // fetchPage will just synchroneously finish instantly
            // as the amount of pages to load is 0

        // visually indicate that the playlist is loading
        $playlist = $ ".playlist-#{pl._id}"
            .append pusher.$loadingIcon

        // fetch all songs
        // the Dubtrack server only lets us download MAX_PAGE_SIZE (20)
        // songs of a playlist per request, so we need to do multiple
        // requests to actually get all songs of the playlist
        pusher._debug.playlists = {}
        pages = Math.ceil(totalItems / MAX_PAGE_SIZE)
        $.Deferred (defFetchSongs) !->
            songs = new Array(totalItems)
            offset = 0
            page = 0

            // fetch a single page
            do fetchPage = !->
                if ++page <= pages
                    etaCallback?(page, pages)
                    (page) <-! aux.fetch "songs (#{pl.name}) [#page/#pages]", "https://api.dubtrack.fm/playlist/#{pl._id}/songs?page=#page"
                    try
                        // convert song data to plug.dj format
                        for {_song}, o in page
                            songs[o + offset] =
                                id:       _song._id
                                cid:      _song.fkid
                                format:   FORMATS.indexOf(_song.type)
                                artist:   ''
                                title:    _song.name
                                duration: ~~(_song.songLength / 1000)
                                image:    _song.images.thumbnail
                        offset += page.length
                    catch err
                        callback new TypeError "couldn't parse song data (#err)"

                    // fetch the next page
                    fetchPage!
                else
                    // fetched all pages! continue
                    defFetchSongs.resolve(songs)

        .then (songs) !-> // fetched all songs, continue
            // visually indicate we're done loading
            $playlist .addClass \jtb-playlist-loaded
            pusher.$loadingIcon .remove!
            clearTimeout pusher.playlistLoadedResetTimeouts[pl._id]
            pusher.playlistLoadedResetTimeouts[pl._id] = setTimeout do
                !->
                    $playlist .removeClass \jtb-playlist-loaded
                PLAYLIST_LOADED_RESET_TIMEOUT

            // update avg. page fetch speed
            if pages != 0
                pusher.avgPageFetch *= pusher.avgPageFetchSamples
                pusher.avgPageFetch += (Date.now! - d)/pages
                pusher.avgPageFetch /= ++pusher.avgPageFetchSamples

            // call callback, if any
            callback? null,
                id: pl._id
                name: pl.name
                totalItems: totalItems
                data:
                    // rather unnecessary meta data… but why not
                    time: Date.now! - d
                    status: \ok
                    dubtrackPlaylistPusherFormat: 2

                    // songs
                    data: songs

                    // for easier re-importing
                    meta:
                        id: pl.id
                        name: pl.name
                        totalItems: totalItems

    etaFetchAllPlaylists: (callback) !->
        // calculate the estimated time to fetch all playlists
        (err, playlistsArr) <-! pusher.fetchPlaylistsList
        return callback?(err) if err

        // loop through all playlists and increase the eta by
        // the amount of pages * average time to fetch a page
        eta = 0ms
        for pl in playlistsArr when pl.totalItems and pl._id not of pusher.playlists
            eta += pusher.avgPageFetch * Math.ceil(pl.totalItems / MAX_PAGE_SIZE)

        console.info "ETA for fetching all songs: %c#{Math.round(eta/1000)}s", 'font-weight: bold'
        callback(,eta)

    fetchAllPlaylists: (callback, etaCallback) !->
        // get list of all playlists
        // if already cached, this will be synchroneous

        (err, playlistsArr) <-! pusher.fetchPlaylistsList
        return callback?(err) if err

        if typeof etaCallback == \function
            // calculate eta
            remainingPages = 0

            // loop through all playlists and increase the eta by
            // the amount of pages * average time to fetch a page
            for pl in playlistsArr when pl.totalItems
                remainingPages += Math.ceil(pl.totalItems / MAX_PAGE_SIZE)

            var etaTimeout
            updateETA = !->
                clearTimeout etaTimeout
                etaCallback(,Math.round remainingPages*pusher.avgPageFetch/1000ms_to_s)
                etaTimeout := setTimeout updateETA, 1_000ms

        // asynchroneously load all playlists and add them to zip
        title = "fetched playlists' songs"
        $.Deferred (defFetchPlaylists) !->
            console.time title
            res = {}
            i = 0
            do fetchNextPlaylist = (err, playlist) !->
                return callback?(err) if err
                if playlist
                    res[playlist.id] = playlist

                pl = playlistsArr[i++]

                // update eta
                updateETA! if updateETA

                // load next playlist, if any
                if pl
                    pusher.fetchPlaylist pl, fetchNextPlaylist,
                        updateETA && (page) !-> // eta update
                            remainingPages--
                            updateETA!
                else
                    defFetchPlaylists.resolve res

        .then (res) !->
            // done fetching playlist data!
            console.timeEnd title

            // clear eta update timeout
            clearTimeout etaTimeout if updateETA

            // call callback, if any
            callback?(,res)

    downloadPlaylist: (playlist, callback) !->
        (err, pl) <-! pusher.fetchPlaylist(playlist)
        return callback?(err) if err

        // make sure Import/Export Dialog is displayed
        $ ".play-song-link, .sidebar .import-playlist" .click!

        json = JSON.stringify(pl.data)
        if not pusher.browserSupportsZip // show in text area
            pusher.$data.val json
            pusher.$name.text "#{pl.name}.json"
        else // download as file (worst case: open it in a new tab/window)
            saveTextAs json, "#{pl.name}.json"
        callback?(, pl)

    downloadZip: (callback, etaCallback) !->
        // fetch all songs
        (err, playlists) <-! pusher.fetchAllPlaylists _, etaCallback
        return callback?(err) if err

        // create ZIP file
        zip = new JSZip()
        for ,pl of playlists
            // Autorename file, if file with same name already present
            // (Dubtrack allows multiple playlists to have the same name
            // however, files in ZIPs cannot have the same name,
            // while being in the same folder)
            o = 1
            filename = pl.name
            while filename of zip.files
                filename = "#{pl.name} (#{++o})"

            // add file to zip
            zip.file "#{filename}.json", JSON.stringify pl.data

        // download ZIP
        date = /[^T]+/.exec(new Date().toISOString!).0
        saveAs zip.generate(type:\blob), "#{date}_dubtrack_playlists.zip"
        console.log "zip download started!"
        callback?(,playlists)





    //== IMPORTER ==
    createPlaylist: (name, optSongs, callback, etaCallback) !->
        if not optSongs or typeof optSongs == \function
            callback = optSongs
            optSongs = null

        // clear playlists-list cache (because we're adding a playlist now, duh)
        delete pusher._playlistsArr

        // create playlist
        new Dubtrack.Model.Playlist(name: name)
            ..parse = Dubtrack.helpers.parse
            ..save {}, success: (pl) !->
                // add playlist locally (might not always trigger a redraw)
                Dubtrack.app.browserView.model.add ..
                #Dubtrack.app.browserView.appendEl pl
                if optSongs
                    pusher.importSongs pl.id, optSongs, callback, etaCallback, ..
                else
                    callback?(,pl)
    importSongs: (playlistID, songsArray, callback, etaCallback, _internal_pl) !->
        etaCallback = null if typeof etaCallback != \function
        i = 0
        title = "imported #{songsArray.length} songs into #playlistID"

        console.time title
        d = Date.now!
        url = Dubtrack.config.apiUrl +
            Dubtrack.config.urls.playlistSong.split \:id .join playlistID
        do !function importSong
            if i // update avg. song add speed
                pusher.avgSongAdd *= pusher.avgSongAddSamples
                pusher.avgSongAdd += Date.now! - d
                pusher.avgSongAdd /= ++pusher.avgSongAddSamples
                d := Date.now!
            song = songsArray[i++]

            etaCallback(i) if etaCallback

            if song
                if typeof song.cid != \string or song.format not in [1, 2]
                    // skip invalid song
                    console.warn "skipping song with unknown format", song
                    i++
                    importSong!
                else
                    // send import request
                    Dubtrack.helpers.sendRequest do
                        url
                        fkid: song.cid || song.fkid
                        type: FORMATS[song.format] || song.type
                        \post
                        importSong
            else
                console.timeEnd title
                if typeof callback == \function
                    if _internal_pl
                        callback(,_internal_pl, songsArray)
                    else
                        callback(,songsArray)

    handleInputFiles: handleInputFiles

export close = pusher.noConflict

module.exports = pusher;