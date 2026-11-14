import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_MAX_ALBUMS = 100;
const HARD_MAX_ALBUMS = 500;
const MUSICBRAINZ_REQUEST_INTERVAL_MS = 1100;
let lastMusicBrainzRequestAt = 0;
const text = (value) => String(value ?? "").trim();

const apiHeaders = (api, json = false) => ({
  "X-Api-Key": api.key,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

async function responseMessage(response) {
  const body = await response.text();
  if (!body) return `HTTP ${response.status}`;
  try {
    const value = JSON.parse(body);
    return text(value.message || value.error) || `HTTP ${response.status}`;
  } catch {
    return body.slice(0, 300);
  }
}

async function getJson(api, route) {
  const response = await fetch(`${api.url}${route}`, { headers: apiHeaders(api) });
  if (!response.ok) throw new Error(await responseMessage(response));
  return response.json();
}

export function uniqueAurralAlbums(jobs) {
  const albums = new Map();
  const skipped = [];
  for (const job of Array.isArray(jobs) ? jobs : []) {
    const album = {
      albumMbid: text(job.albumMbid),
      albumName: text(job.albumName),
      artistMbid: text(job.artistMbid),
      artistName: text(job.artistName),
    };
    if (!album.albumMbid || !album.albumName || !album.artistMbid || !album.artistName) {
      skipped.push({
        track: text(job.trackName),
        album: album.albumName || null,
        artist: album.artistName || null,
        reason: "Aurral has not attached complete album identity data to this track",
      });
      continue;
    }
    if (!albums.has(album.albumMbid)) albums.set(album.albumMbid, album);
  }
  return { albums: [...albums.values()], skipped };
}

async function releaseType(album) {
  const wait = Math.max(
    0,
    MUSICBRAINZ_REQUEST_INTERVAL_MS - (Date.now() - lastMusicBrainzRequestAt),
  );
  if (wait) await pause(wait);

  const response = await fetch(
    `https://musicbrainz.org/ws/2/release-group/${encodeURIComponent(album.albumMbid)}?fmt=json`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Aurral-Playlist-Album-Requester/1.2.1",
      },
    },
  );
  lastMusicBrainzRequestAt = Date.now();
  if (!response.ok) {
    throw new Error(`MusicBrainz release-type lookup returned HTTP ${response.status}`);
  }

  const details = await response.json();
  const primaryType = text(details?.["primary-type"]);
  if (!primaryType) throw new Error("MusicBrainz returned no primary release type");
  return primaryType;
}

export function managerForReleaseType(value) {
  const normalized = text(value).toLowerCase();
  if (normalized === "album") return "lidarr";
  if (normalized === "ep" || normalized === "single") return "aurral";
  return null;
}

async function requestAlbum(api, album, managedBy) {
  const response = await fetch(`${api.url}/library/albums/request`, {
    method: "POST",
    headers: apiHeaders(api, true),
    body: JSON.stringify({
      ...album,
      triggerSearch: managedBy === "lidarr",
      managedBy,
    }),
  });
  if (!response.ok) throw new Error(await responseMessage(response));
  return response.json().catch(() => ({}));
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function maxAlbumsSetting(settings) {
  const value = Math.floor(Number(settings?.maxAlbums));
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_MAX_ALBUMS;
  return Math.min(value, HARD_MAX_ALBUMS);
}

async function saveReport(dataFolder, report) {
  await mkdir(dataFolder, { recursive: true });
  await writeFile(path.join(dataFolder, "last-run.json"), `${JSON.stringify(report, null, 2)}\n`);
}

async function requestPlaylistAlbums({ api, dataFolder, playlist, settings }) {
  if (!api?.url || !api?.key) throw new Error("Enable this plugin's Aurral API access first");
  if (!playlist?.id) throw new Error("Aurral did not provide a playlist ID");

  let jobs;
  try {
    jobs = await getJson(api, `/playlists/jobs/${encodeURIComponent(playlist.id)}`);
  } catch (error) {
    throw new Error(`Could not read Aurral's albums for this playlist: ${text(error?.message || error)}`);
  }

  const { albums, skipped } = uniqueAurralAlbums(jobs);
  const maximum = maxAlbumsSetting(settings);
  if (albums.length > maximum) {
    throw new Error(
      `This playlist contains ${albums.length} albums, above the safety limit of ${maximum}. Raise “Maximum albums per run” to continue.`,
    );
  }
  if (!albums.length) {
    throw new Error("Aurral has not attached a complete album identity to any playlist track");
  }

  const report = {
    pluginVersion: "1.2.1",
    ranAt: new Date().toISOString(),
    playlist: { id: playlist.id, name: playlist.name, kind: playlist.kind },
    albumsFound: albums.length,
    requested: [],
    failed: [],
    skippedReleases: [],
    skippedTracks: skipped,
  };

  for (const album of albums) {
    try {
      const primaryType = await releaseType(album);
      const managedBy = managerForReleaseType(primaryType);
      if (!managedBy) {
        report.skippedReleases.push({
          album,
          primaryType: primaryType || null,
          reason: primaryType
            ? `Unsupported MusicBrainz primary type: ${primaryType}`
            : "Aurral returned no MusicBrainz primary type",
        });
        await pause(150);
        continue;
      }

      const result = await requestAlbum(api, album, managedBy);
      report.requested.push({
        album,
        primaryType,
        managedBy,
        status: result?.status || null,
      });
    } catch (error) {
      report.failed.push({ album, reason: text(error?.message || error) });
    }
    await pause(150);
  }

  await saveReport(dataFolder, report);
  const skippedAlbums = new Set(skipped.map((item) => `${item.artist}\u0000${item.album}`)).size;
  const lidarrCount = report.requested.filter((item) => item.managedBy === "lidarr").length;
  const aurralCount = report.requested.filter((item) => item.managedBy === "aurral").length;
  return {
    message: [
      `${lidarrCount} album${lidarrCount === 1 ? "" : "s"} sent to Lidarr`,
      `${aurralCount} EP/single${aurralCount === 1 ? "" : "s"} sent to Aurral`,
      `${report.failed.length} failed`,
      `${report.skippedReleases.length} unsupported type${report.skippedReleases.length === 1 ? "" : "s"} skipped`,
      `${skippedAlbums} lacked Aurral album data`,
    ].join(" · "),
  };
}

export default {
  async test({ api }) {
    if (!api?.url || !api?.key) throw new Error("Enable this plugin's Aurral API access first");
    await getJson(api, "/health/bootstrap");
    return {
      message:
        "Connected to Aurral. Albums will use Lidarr; EPs and singles will use Aurral download sources.",
    };
  },
  actions: { "request-albums": requestPlaylistAlbums },
};
