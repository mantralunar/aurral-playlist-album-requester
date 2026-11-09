# Playlist Album Requester for Aurral

Adds **Request hinted albums** to each playlist menu. It takes every unique album Aurral has already identified for the playlist and performs the API equivalent of pressing that album's **Download album** button, using Lidarr and starting its search immediately.

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
- performs no searching, title matching, or release selection of its own;
- sends each request to Lidarr with immediate search enabled;
- skips a track if Aurral has not attached complete album identity data to it.

The most recent detailed report is kept as `last-run.json` in the plugin's private data folder. It lists requested, unmatched, failed, and skipped entries.

## Safety limit

One run is limited to 100 unique albums by default. Change **Maximum albums per run** in the plugin settings if needed; the hard limit is 500.

## Requirements

- Aurral plugin API 1
- A configured Lidarr library manager in Aurral
- Playlist tracks whose albums have already been identified by Aurral

Plugins are currently a beta Aurral feature, so a future Aurral update may require a plugin update.
