import { NextResponse } from "next/server";

type Candidate = {
  title: string;
  channel: string;
  url: string;
  date: string;
};

type AlbumResult = {
  album: string;
  artist: string;
  albumId: string;
  releaseId: string;
  cover: string | null;
  plays: number;
};

function cleanText(value: string) {
  return value
    .replace(/\[Official.*?\]/gi, "")
    .replace(/\(Official.*?\)/gi, "")
    .replace(/\[.*?official.*?\]/gi, "")
    .replace(/\(.*?official.*?\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string) {
  const aa = normalize(a);
  const bb = normalize(b);

  if (!aa || !bb) return 0;
  if (aa === bb) return 1;

  if (aa.includes(bb) || bb.includes(aa)) {
    return 0.9;
  }

  const aWords = new Set(aa.split(" "));
  const bWords = new Set(bb.split(" "));

  let intersection = 0;

  for (const word of aWords) {
    if (bWords.has(word)) {
      intersection++;
    }
  }

  const union = new Set([...aWords, ...bWords]).size;

  return union === 0 ? 0 : intersection / union;
}

function parseArtistAndSong(title: string, channel: string) {
  let cleanTitle = cleanText(title);
  const cleanChannel = cleanText(channel);

  cleanTitle = cleanTitle
    .replace(/^\[full album\]\s*/i, "")
    .replace(/^\[album\]\s*/i, "")
    .replace(/^full album\s*[:\-]?\s*/i, "");

  if (/^.+\s*-\s*Topic$/i.test(cleanChannel)) {
    return {
      artist: cleanChannel
        .replace(/\s*-\s*Topic$/i, "")
        .trim(),
      song: cleanTitle,
    };
  }

  const dashMatch = cleanTitle.match(
    /^(.+?)\s+[-–—]\s+(.+)$/
  );

  if (dashMatch) {
    return {
      artist: dashMatch[1].trim(),
      song: dashMatch[2].trim(),
    };
  }

  const weakChannel = cleanChannel
    .replace(/\s*VEVO$/i, "")
    .replace(/\s*-\s*Topic$/i, "")
    .trim();

  return {
    artist: weakChannel,
    song: cleanTitle,
  };
}

function escapeLucene(value: string) {
  return value.replace(
    /([+\-&|!(){}\[\]^"~*?:\\/])/g,
    "\\$1"
  );
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchMusicBrainz(
  artist: string,
  song: string
): Promise<any | null> {
  const safeArtist = escapeLucene(artist);
  const safeSong = escapeLucene(song);

  const query =
    `recording:"${safeSong}" AND artist:"${safeArtist}"`;

  const url =
    "https://musicbrainz.org/ws/2/recording" +
    `?query=${encodeURIComponent(query)}` +
    "&fmt=json" +
    "&limit=10" +
    "&inc=releases";

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "RainbowCollageGenerator/1.0 (https://localhost)",
        },
        cache: "no-store",
      });

      if (response.ok) {
        const data = await response.json();

        if (
          !data.recordings ||
          data.recordings.length === 0
        ) {
          return null;
        }

        let best: any = null;
        let bestScore = 0;

        for (const recording of data.recordings) {
          const recordingScore = similarity(
            song,
            recording.title ?? ""
          );

          const artistName =
            recording["artist-credit"]
              ?.map((credit: any) => credit.name)
              .join(" ") ?? "";

          const artistScore = similarity(
            artist,
            artistName
          );

          const score =
            recordingScore * 0.65 +
            artistScore * 0.35;

          if (score > bestScore) {
            bestScore = score;
            best = recording;
          }
        }

        if (!best || bestScore < 0.55) {
          return null;
        }

        return best;
      }

      if (
        response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504
      ) {
        const retryAfter =
          response.headers.get("Retry-After");

        const retrySeconds = retryAfter
          ? Number(retryAfter)
          : 3 + attempt * 3;

        await sleep(retrySeconds * 1000);
        continue;
      }

      console.warn(
        "MusicBrainz HTTP error:",
        response.status
      );

      return null;
    } catch (error) {
      console.warn(
        "MusicBrainz network error:",
        error
      );

      if (attempt < 2) {
        await sleep(3000 + attempt * 3000);
      }
    }
  }

  return null;
}

async function getCover(releaseId: string) {
  if (!releaseId) return null;

  try {
    const response = await fetch(
      `https://coverartarchive.org/release/${releaseId}`,
      {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    const front =
      data.images?.find(
        (image: any) => image.front === true
      ) ?? data.images?.[0];

    if (!front) {
      return null;
    }

    return (
      front.thumbnails?.["1200"] ??
      front.thumbnails?.["500"] ??
      front.image ??
      null
    );
  } catch {
    return null;
  }
}

function chooseRelease(recording: any) {
  const releases = recording.releases ?? [];

  if (!releases.length) {
    return null;
  }

  const sorted = [...releases].sort(
    (a: any, b: any) => {
      const typeScore = (release: any) => {
        const type =
          release["release-group"]?.["primary-type"];

        if (type === "Album") return 4;
        if (type === "EP") return 3;
        if (type === "Single") return 2;

        return 1;
      };

      return typeScore(b) - typeScore(a);
    }
  );

  return sorted[0];
}

function getArtistName(
  recording: any,
  fallback: string
) {
  const name = recording["artist-credit"]
    ?.map((credit: any) => credit.name)
    .join(" & ");

  return name || fallback || "Unknown Artist";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const candidates: Candidate[] =
      Array.isArray(body.candidates)
        ? body.candidates
        : [];

    if (!candidates.length) {
      return NextResponse.json({
        results: [],
        albums: [],
        processed: 0,
        matched: 0,
        uniqueTracks: 0,
        coversFound: 0,
      });
    }

    /*
     * 去除完全重複的歌曲。
     * 同一首歌看 20 次，只查 MusicBrainz 一次。
     */
    const uniqueMap = new Map<
      string,
      {
        candidate: Candidate;
        plays: number;
      }
    >();

    for (const candidate of candidates) {
      const parsed = parseArtistAndSong(
        candidate.title,
        candidate.channel
      );

      const key =
        `${normalize(parsed.artist)}::${normalize(
          parsed.song
        )}`;

      if (!key || key === "::") continue;

      const existing = uniqueMap.get(key);

      if (existing) {
        existing.plays += 1;
      } else {
        uniqueMap.set(key, {
          candidate,
          plays: 1,
        });
      }
    }

    const uniqueItems = Array.from(
      uniqueMap.values()
    );

    const results: any[] = [];

    const albumMap = new Map<
      string,
      AlbumResult
    >();

    for (let i = 0; i < uniqueItems.length; i++) {
      const item = uniqueItems[i];
      const candidate = item.candidate;

      const parsed = parseArtistAndSong(
        candidate.title,
        candidate.channel
      );

      try {
        const recording =
          await searchMusicBrainz(
            parsed.artist,
            parsed.song
          );

        if (!recording) {
          await sleep(1500);
          continue;
        }

        const release =
          chooseRelease(recording);

        if (!release) {
          await sleep(1500);
          continue;
        }

        const releaseGroup =
          release["release-group"];

        const albumId =
          releaseGroup?.id ??
          release.id;

        const releaseId = release.id;

        const albumName =
          releaseGroup?.title ??
          release.title ??
          "Unknown Album";

        const artistName =
          getArtistName(
            recording,
            parsed.artist
          );

        if (!albumId) {
          await sleep(1500);
          continue;
        }

        let album =
          albumMap.get(albumId);

        if (!album) {
          let cover = await getCover(
            releaseId
          );

          /*
           * 如果第一個 release 沒封面，
           * 嘗試其他 release。
           */
          if (!cover) {
            const releases =
              recording.releases ?? [];

            for (
              const alternative of releases.slice(
                0,
                5
              )
            ) {
              if (
                alternative.id === releaseId
              ) {
                continue;
              }

              cover = await getCover(
                alternative.id
              );

              if (cover) {
                break;
              }
            }
          }

          album = {
            album: albumName,
            artist: artistName,
            albumId,
            releaseId,
            cover,
            plays: 0,
          };

          albumMap.set(
            albumId,
            album
          );
        }

        album.plays += item.plays;

        results.push({
          title: candidate.title,
          channel: candidate.channel,
          url: candidate.url,
          date: candidate.date,

          artist: artistName,
          song: recording.title,

          album: albumName,
          albumId,
          releaseId,

          cover: album.cover,

          plays: item.plays,
        });
      } catch (error) {
        console.warn(
          "Failed to process:",
          candidate.title,
          error
        );
      }

      /*
       * MusicBrainz 公開 API 限速。
       */
      if (i < uniqueItems.length - 1) {
        await sleep(1500);
      }
    }

    const albums = Array.from(
      albumMap.values()
    )
      .filter((album) => album.cover)
      .sort(
        (a, b) =>
          b.plays - a.plays
      );

    return NextResponse.json({
      results,
      albums,

      processed: candidates.length,
      matched: results.length,

      uniqueTracks:
        uniqueItems.length,

      uniqueAlbums:
        albums.length,

      coversFound:
        albums.filter(
          (album) => album.cover
        ).length,
    });
  } catch (error) {
    console.error(
      "Album analysis failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Album analysis failed",
      },
      {
        status: 500,
      }
    );
  }
}