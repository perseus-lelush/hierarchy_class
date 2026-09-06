import { NextResponse } from "next/server";
import type { MusicPlatform, ResolvedMusic } from "@/lib/musicTypes";
import { enforceRateLimit } from "@/lib/server/rateLimit";

// Music metadata resolution - post-music-by-link.
//
// The student pastes a music URL and this endpoint resolves title, artist and
// album artwork server-side. The route is FREE and OPEN: no login, no API
// credentials, no quota to buy. It only ever calls each platform's keyless
// public metadata endpoint (never the arbitrary user-supplied URL), which
// also keeps this route safe from SSRF. Because it is open, a per-IP rate
// limit protects it from abuse.
//
// Supported platforms:
//   - YouTube / SoundCloud / Vimeo  - keyless oEmbed (no credentials needed)
//   - Apple Music                   - keyless iTunes lookup API
//   - Spotify                       - keyless oEmbed endpoint (title + cover)
//                                     with the artist parsed from the public
//                                     page's og:description when oEmbed omits
//                                     it. Tracks, albums, playlists, artists,
//                                     episodes and show links all resolve.
//                                     spotify.link short links are resolved
//                                     (redirects followed, final host
//                                     verified) first.

// Types live in lib/musicTypes.ts (shared with client code - see there).
export type { MusicPlatform, ResolvedMusic } from "@/lib/musicTypes";

const OEmbed_TIMEOUT_MS = 8000;

function detectPlatform(host: string): MusicPlatform | null {
  const h = host.replace(/^www\./, "").replace(/^m\./, "");
  if (h === "youtube.com" || h === "youtu.be") return "youtube";
  if (h === "soundcloud.com") return "soundcloud";
  if (h === "vimeo.com") return "vimeo";
  if (h === "open.spotify.com" || h === "play.spotify.com" || h === "spotify.link") return "spotify";
  if (h === "music.apple.com" || h === "itunes.apple.com") return "apple";
  return null;
}

/** Extracts a YouTube video id from watch/shorts/embed/youtu.be URLs. */
function youtubeVideoId(url: URL): string | null {
  if (url.hostname === "youtu.be") {
    return url.pathname.split("/")[1] ?? null;
  }
  const v = url.searchParams.get("v");
  if (v) return v;
  const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/);
  return m ? m[1] : null;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OEmbed_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "HierarchyClass/1.0 (music metadata resolution)",
        ...init?.headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetchWithTimeout(url, init);
  if (!res.ok) throw new Error(`metadata endpoint responded ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** Retries a keyless JSON fetch a few times - Spotify's oEmbed endpoint can
 *  occasionally return an empty body under load. */
async function fetchJsonRetry(url: string, attempts = 3): Promise<Record<string, unknown>> {
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchJson(url);
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastError;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Parses the artist out of a Spotify public track page - the og:description
 *  meta is "Artist · Album · Song · Year", so the artist is the first
 *  segment. Keyless; only used when oEmbed omits the artist (track pages
 *  only - other Spotify content types have no artist line to parse). */
async function spotifyArtistFromPage(trackId: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`https://open.spotify.com/track/${trackId}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HierarchyClass/1.0)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/property="og:description" content="([^"]*)"/i);
    if (!match) return null;
    const artist = decodeEntities(match[1]).split(" · ")[0]?.trim();
    return artist || null;
  } catch {
    return null;
  }
}

function error(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  // Per-IP rate limit: 30 resolves per minute, enforced cross-instance in
  // Upstash Redis (lib/server/rateLimit.ts) so it survives cold starts and
  // holds across concurrent instances. Keeps the open endpoint safe from
  // scripted hammering without ever requiring a login.
  const limit = await enforceRateLimit(request, "resolve-music", 30, 60);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many music lookups right now - try again in a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  let body: { url?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // malformed body handled below
  }

  const raw = typeof body.url === "string" ? body.url.trim() : "";
  if (!raw) return error("Enter a valid music link.", 400);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return error("Enter a valid music link.", 400);
  }
  if (url.protocol !== "https:") return error("Enter a valid music link.", 400);

  const platform = detectPlatform(url.hostname);
  if (!platform) return error("That music platform isn't supported yet.", 422);

  try {
    if (platform === "youtube") {
      const id = youtubeVideoId(url);
      if (!id) return error("Music information could not be retrieved.", 422);
      const canonicalUrl = `https://www.youtube.com/watch?v=${id}`;
      const data = await fetchJson(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`
      );
      return ok(canonicalUrl, platform, data.title, data.author_name, data.thumbnail_url);
    }

    if (platform === "soundcloud") {
      const data = await fetchJson(
        `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(raw)}`
      );
      return ok(raw, platform, data.title, data.author_name, data.thumbnail_url);
    }

    if (platform === "vimeo") {
      const data = await fetchJson(
        `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(raw)}`
      );
      return ok(raw, platform, data.title, data.author_name, data.thumbnail_url);
    }

    if (platform === "spotify") {
      // Resolve Spotify short links (spotify.link) - fetch follows the
      // redirect, then verify the final host before trusting it.
      if (url.hostname === "spotify.link") {
        const res = await fetchWithTimeout(url.toString());
        const finalUrl = new URL(res.url);
        if (finalUrl.hostname !== "open.spotify.com" && finalUrl.hostname !== "play.spotify.com") {
          return error("Music information could not be retrieved.", 422);
        }
        url = finalUrl;
      }

      // Tracks, albums, playlists, artists, episodes and shows all resolve -
      // every type has a public oEmbed endpoint with title + cover.
      const match = url.pathname.match(/^\/(track|album|playlist|artist|episode|show)\/([\w]+)/);
      if (!match) return error("Music information could not be retrieved.", 422);
      const [, contentType, contentId] = match;
      const canonicalUrl = `https://open.spotify.com/${contentType}/${contentId}`;

      // Keyless: Spotify's public oEmbed endpoint returns title + cover with
      // no credentials. Artist is not included, so for tracks we parse it
      // from the public page's og:description ("Artist · Album · Song · Year").
      const data = await fetchJsonRetry(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`
      );
      const artist =
        contentType === "track"
          ? (data.author_name as string | undefined) ?? (await spotifyArtistFromPage(contentId))
          : (data.author_name as string | undefined) ?? null;
      return ok(canonicalUrl, platform, data.title, artist, data.thumbnail_url);
    }

    // apple
    const trackId = url.searchParams.get("i");
    const albumMatch = url.pathname.match(/\/id(\d+)/);
    const id = trackId ?? albumMatch?.[1];
    if (!id) return error("Music information could not be retrieved.", 422);
    const lookup = (await fetchJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}`)) as {
      results?: {
        trackName?: string;
        collectionName?: string;
        artistName?: string;
        artworkUrl100?: string;
        trackViewUrl?: string;
        collectionViewUrl?: string;
      }[];
    };
    const result = lookup.results?.[0];
    const title = (result?.trackName ?? result?.collectionName ?? "").trim();
    if (!title) return error("Music information could not be retrieved.", 422);
    const artwork = (result?.artworkUrl100 ?? "").replace("100x100bb", "600x600bb");
    return ok(
      result?.trackViewUrl ?? result?.collectionViewUrl ?? raw,
      platform,
      title,
      result?.artistName,
      artwork || null
    );
  } catch (err) {
    return error("Music information could not be retrieved.", 502);
  }
}

function ok(
  url: string,
  platform: MusicPlatform,
  title: unknown,
  author: unknown,
  thumbnail: unknown
) {
  const t = typeof title === "string" ? title.trim() : "";
  if (!t) return error("Music information could not be retrieved.", 422);
  const artist = typeof author === "string" ? author.trim() : "";
  const coverUrl = typeof thumbnail === "string" ? thumbnail : null;
  const resolved: ResolvedMusic = { url, platform, title: t, artist: artist || null, coverUrl };
  return NextResponse.json({ ok: true, data: resolved });
}
