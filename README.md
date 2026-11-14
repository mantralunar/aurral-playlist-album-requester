# Playlist Album Requester for Aurral

Adds **Request hinted albums** to each playlist menu. It takes every unique release Aurral has already identified for the playlist, verifies its primary type directly with MusicBrainz, and routes it to the appropriate library manager.

- **Album** → Lidarr, with an immediate search
- **EP or Single** → Aurral's own download pipeline
- **Other or unknown type** → skipped and reported

This is designed for playlists such as the NOW playlists where each entry points at an artist's original album rather than the compilation. The compilation remains a playlist in Aurral, while Lidarr manages the full original albums.

## Install

1. Extract the supplied ZIP.
2. Copy the `playlist-album-requester` folder into Aurral's data folder at `plugins/playlist-album-requester`. In the common Docker setup this is `/config/plugins/playlist-album-requester` inside the Aurral container.
3. Restart Aurral if the plugin does not appear automatically.
4. Open **Settings > Plugins > Playlist Album Requester**.
5. Enable the plugin, its **Admin access**, and the **Request hinted albums** action, then use **Test**.

## Use

Open a playlist's menu and choose **Request hinted albums**. The action runs in the background. Aurral shows a result when it finishes.

The plugin:

- reads Aurral's existing album identity from every playlist job, including unfinished entries;
- deduplicates repeated albums;
- performs no title matching or alternative release selection of its own;
- verifies Aurral's resolved release-group MBID directly with MusicBrainz rather than trusting a missing type that Aurral may represent as an album;
- sends albums to Lidarr with immediate search enabled;
- sends EPs and singles to Aurral, which tries its configured download sources in their normal order;
- skips rather than guesses when the release type is missing or unsupported;
- skips a track if Aurral has not attached complete album identity data to it.

The most recent detailed report is kept as `last-run.json` in the plugin's private data folder. Every requested entry records its `primaryType` and whether it was `managedBy` Lidarr or Aurral. The report also lists failures, unsupported release types, and tracks without complete album identity.

## Safety limit

One run is limited to 100 unique albums by default. Change **Maximum albums per run** in the plugin settings if needed; the hard limit is 500.

## Requirements

- Aurral plugin API 1
- A configured Lidarr library manager in Aurral
- At least one working Aurral download source if EPs and singles should be downloaded
- Network access from the Aurral container to `musicbrainz.org`
- Playlist tracks whose albums have already been identified by Aurral

MusicBrainz lookups are deliberately limited to approximately one per second. If MusicBrainz cannot verify a release type, the plugin makes no download request for that release; it never falls back to treating an unknown type as an album.

Plugins are currently a beta Aurral feature, so a future Aurral update may require a plugin update.
