"use client";

import {
  ChangeEvent,
  useMemo,
  useRef,
  useState,
} from "react";

type HistoryItem = {
  title: string;
  channel: string;
  url: string;
  date: string;
  timestamp: number;
};

type MusicCandidate = HistoryItem & {
  reason: string;
};

type Album = {
  album: string;
  artist: string;
  cover: string | null;
  plays: number;
  albumId?: string;
  releaseId?: string;
};

type LookupResponse = {
  results?: any[];
  albums?: Album[];
  processed?: number;
  matched?: number;
  uniqueTracks?: number;
  uniqueAlbums?: number;
  coversFound?: number;
  error?: string;
};

const COLLAGE_SIZE = 1024;

const PERIODS = [
  {
    id: "30",
    label: "30 Days",
    days: 30,
  },
  {
    id: "90",
    label: "90 Days",
    days: 90,
  },
  {
    id: "365",
    label: "1 Year",
    days: 365,
  },
  {
    id: "all",
    label: "All Time",
    days: null,
  },
];

function isMusicVideo(
  title: string,
  channel: string
) {
  const text =
    `${title} ${channel}`.toLowerCase();

  const musicWords = [
    "official audio",
    "official music video",
    "music video",
    "lyrics",
    "lyric video",
    "audio",
    "soundtrack",
    "ost",
    "remix",
    "live performance",
    "live",
    "concert",
    "cover",
    "acoustic",
    "album",
    "full album",
    "song",
    "single",
  ];

  const excludeWords = [
    "gameplay",
    "walkthrough",
    "tutorial",
    "news",
    "review",
    "reaction",
    "podcast",
    "stream",
    "livestream",
    "vlog",
    "interview",
    "trailer",
    "analysis",
    "explained",
    "how to",
    "guide",
  ];

  if (
    excludeWords.some((word) =>
      text.includes(word)
    )
  ) {
    return false;
  }

  return musicWords.some((word) =>
    text.includes(word)
  );
}

function parseHistory(
  html: string
): HistoryItem[] {
  const parser =
    new DOMParser();

  const document =
    parser.parseFromString(
      html,
      "text/html"
    );

  const items: HistoryItem[] = [];

  const rows =
    Array.from(
      document.querySelectorAll(
        "div.content-cell"
      )
    );

  for (const row of rows) {
    const links =
      Array.from(
        row.querySelectorAll("a")
      );

    const youtubeLink =
      links.find((link) =>
        (link.getAttribute("href") || "")
          .includes(
            "youtube.com/watch"
          )
      );

    if (!youtubeLink) {
      continue;
    }

    const title =
      youtubeLink.textContent
        ?.trim() || "";

    const url =
      youtubeLink.getAttribute(
        "href"
      ) || "";

    const channelLink =
      links.find((link) => {
        const href =
          link.getAttribute(
            "href"
          ) || "";

        return (
          href.includes(
            "youtube.com/channel"
          ) ||
          href.includes(
            "youtube.com/@"
          )
        );
      });

    const channel =
      channelLink?.textContent
        ?.trim() || "";

    const text =
      row.textContent || "";

    const dateMatch =
      text.match(
        /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}(?:\s+at\s+[^<]+)?/i
      );

    let timestamp =
      Date.now();

    if (dateMatch) {
      const parsed =
        Date.parse(
          dateMatch[0]
        );

      if (!Number.isNaN(parsed)) {
        timestamp = parsed;
      }
    }

    items.push({
      title,
      channel,
      url,
      date:
        dateMatch?.[0] ||
        "",
      timestamp,
    });
  }

  /*
   * 去掉完全相同的 YouTube 紀錄。
   */
  const unique =
    new Map<
      string,
      HistoryItem
    >();

  for (const item of items) {
    const key =
      `${item.url}::${item.timestamp}`;

    if (!unique.has(key)) {
      unique.set(key, item);
    }
  }

  return Array.from(
    unique.values()
  ).sort(
    (a, b) =>
      b.timestamp -
      a.timestamp
  );
}

function shuffleArray<T>(
  array: T[]
) {
  const copy = [...array];

  for (
    let i = copy.length - 1;
    i > 0;
    i--
  ) {
    const j =
      Math.floor(
        Math.random() *
          (i + 1)
      );

    [
      copy[i],
      copy[j],
    ] = [
      copy[j],
      copy[i],
    ];
  }

  return copy;
}

function getGridSize(
  count: number
) {
  if (count <= 1) return 1;

  return Math.ceil(
    Math.sqrt(count)
  );
}

function loadImage(
  src: string
): Promise<HTMLImageElement> {
  return new Promise(
    (resolve, reject) => {
      const image =
        new Image();

      image.crossOrigin =
        "anonymous";

      image.onload = () =>
        resolve(image);

      image.onerror = () =>
        reject(
          new Error(
            "Image loading failed"
          )
        );

      image.src = src;
    }
  );
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  size: number
) {
  const imageRatio =
    image.width /
    image.height;

  const targetRatio = 1;

  let sourceWidth =
    image.width;

  let sourceHeight =
    image.height;

  let sourceX = 0;
  let sourceY = 0;

  if (
    imageRatio >
    targetRatio
  ) {
    sourceWidth =
      image.height;
    sourceX =
      (image.width -
        sourceWidth) /
      2;
  } else if (
    imageRatio <
    targetRatio
  ) {
    sourceHeight =
      image.width;
    sourceY =
      (image.height -
        sourceHeight) /
      2;
  }

  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    size,
    size
  );
}

async function renderCollage(
  albums: Album[],
  canvas: HTMLCanvasElement
) {
  const usableAlbums =
    albums.filter(
      (album) => album.cover
    );

  if (
    usableAlbums.length === 0
  ) {
    throw new Error(
      "沒有可以使用的專輯封面"
    );
  }

  const grid =
    getGridSize(
      usableAlbums.length
    );

  const tileSize =
    COLLAGE_SIZE / grid;

  canvas.width =
    COLLAGE_SIZE;

  canvas.height =
    COLLAGE_SIZE;

  const ctx =
    canvas.getContext("2d");

  if (!ctx) {
    throw new Error(
      "無法建立 Canvas"
    );
  }

  ctx.fillStyle =
    "#ffffff";

  ctx.fillRect(
    0,
    0,
    COLLAGE_SIZE,
    COLLAGE_SIZE
  );

  /*
   * 先全部載入圖片。
   * 某張失敗不影響其他圖片。
   */
  const loaded =
    await Promise.all(
      usableAlbums.map(
        async (album) => {
          try {
            if (!album.cover) {
              return null;
            }

            const image =
              await loadImage(
                album.cover
              );

            return {
              album,
              image,
            };
          } catch {
            return null;
          }
        }
      )
    );

  const valid =
    loaded.filter(
      (
        item
      ): item is {
        album: Album;
        image: HTMLImageElement;
      } => item !== null
    );

  if (!valid.length) {
    throw new Error(
      "專輯封面無法載入"
    );
  }

  valid.forEach(
    (
      { image },
      index
    ) => {
      const column =
        index % grid;

      const row =
        Math.floor(
          index / grid
        );

      drawCover(
        ctx,
        image,
        column *
          tileSize,
        row *
          tileSize,
        tileSize
      );
    }
  );
}

export default function PlaylistLoader() {
  const [
    history,
    setHistory,
  ] = useState<
    HistoryItem[]
  >([]);

  const [
    selectedPeriod,
    setSelectedPeriod,
  ] = useState("30");

  const [
    albums,
    setAlbums,
  ] = useState<Album[]>(
    []
  );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    analyzing,
    setAnalyzing,
  ] = useState(false);

  const [
    collageLoading,
    setCollageLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    status,
    setStatus,
  ] = useState(
    "請先上傳 YouTube History"
  );

  const [
    processed,
    setProcessed,
  ] = useState(0);

  const [
    matched,
    setMatched,
  ] = useState(0);

  const [
    uniqueTracks,
    setUniqueTracks,
  ] = useState(0);

  const canvasRef =
    useRef<HTMLCanvasElement>(
      null
    );

  const filteredHistory =
    useMemo(() => {
      if (!history.length) {
        return [];
      }

      if (
        selectedPeriod ===
        "all"
      ) {
        return history;
      }

      const period =
        PERIODS.find(
          (item) =>
            item.id ===
            selectedPeriod
        );

      if (
        !period ||
        period.days === null
      ) {
        return history;
      }

      const newest =
        Math.max(
          ...history.map(
            (item) =>
              item.timestamp
          )
        );

      const cutoff =
        newest -
        period.days *
          24 *
          60 *
          60 *
          1000;

      return history.filter(
        (item) =>
          item.timestamp >=
          cutoff
      );
    }, [
      history,
      selectedPeriod,
    ]);

  const musicCandidates =
    useMemo<MusicCandidate[]>(
      () => {
        return filteredHistory
          .filter((item) =>
            isMusicVideo(
              item.title,
              item.channel
            )
          )
          .map((item) => ({
            ...item,
            reason:
              "Music-related title/channel",
          }));
      },
      [filteredHistory]
    );

  async function handleFile(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    if (!file) return;

    setLoading(true);
    setError("");
    setAlbums([]);
    setStatus(
      "正在讀取 YouTube History..."
    );

    try {
      const html =
        await file.text();

      const parsed =
        parseHistory(html);

      if (!parsed.length) {
        throw new Error(
          "找不到 YouTube 紀錄，請確認上傳的是 Google Takeout 的 YouTube History HTML。"
        );
      }

      setHistory(parsed);

      setStatus(
        `成功讀取 ${parsed.length.toLocaleString()} 筆觀看紀錄`
      );
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "讀取檔案失敗"
      );

      setStatus(
        "讀取失敗"
      );
    } finally {
      setLoading(false);
    }
  }

  async function analyzeAlbums() {
    if (
      musicCandidates.length ===
      0
    ) {
      setError(
        "目前期間沒有找到音樂相關影片。"
      );

      return;
    }

    setAnalyzing(true);
    setCollageLoading(false);
    setError("");

    try {
      setStatus(
        `正在分析 ${musicCandidates.length.toLocaleString()} 筆音樂紀錄...`
      );

      const response =
        await fetch(
          "/api/music/lookup",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              candidates:
                musicCandidates,
            }),
          }
        );

      const data: LookupResponse =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "音樂分析失敗"
        );
      }

      const nextAlbums =
        Array.isArray(
          data.albums
        )
          ? data.albums.filter(
              (album) =>
                Boolean(
                  album.cover
                )
            )
          : [];

      setProcessed(
        data.processed ?? 0
      );

      setMatched(
        data.matched ?? 0
      );

      setUniqueTracks(
        data.uniqueTracks ?? 0
      );

      setAlbums(
        nextAlbums
      );

      if (
        nextAlbums.length ===
        0
      ) {
        setStatus(
          "分析完成，但沒有取得專輯封面。"
        );

        setError(
          "MusicBrainz 沒有找到可用的專輯封面。"
        );

        return;
      }

      setStatus(
        `找到 ${nextAlbums.length} 張專輯封面，正在產生拼貼圖...`
      );

      setCollageLoading(
        true
      );

      /*
       * 等 React 把 canvas render 出來。
       */
      await new Promise(
        (resolve) =>
          requestAnimationFrame(
            () =>
              resolve(null)
          )
      );

      const canvas =
        canvasRef.current;

      if (!canvas) {
        throw new Error(
          "找不到 Canvas"
        );
      }

      await renderCollage(
        nextAlbums,
        canvas
      );

      setStatus(
        `完成！共 ${nextAlbums.length} 張專輯封面`
      );
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "分析失敗"
      );

      setStatus(
        "分析失敗"
      );
    } finally {
      setAnalyzing(false);
      setCollageLoading(false);
    }
  }

  async function regenerateCollage() {
    if (!albums.length) {
      return;
    }

    const shuffled =
      shuffleArray(
        albums
      );

    setAlbums(shuffled);
    setCollageLoading(true);
    setError("");

    try {
      await new Promise(
        (resolve) =>
          requestAnimationFrame(
            () =>
              resolve(null)
          )
      );

      const canvas =
        canvasRef.current;

      if (!canvas) {
        throw new Error(
          "找不到 Canvas"
        );
      }

      await renderCollage(
        shuffled,
        canvas
      );

      setStatus(
        `已重新排列 ${shuffled.length} 張專輯`
      );
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "重新產生拼貼圖失敗"
      );
    } finally {
      setCollageLoading(false);
    }
  }

  function downloadPNG() {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    try {
      const link =
        document.createElement(
          "a"
        );

      link.download =
        "rainbow-collage-1024x1024.png";

      link.href =
        canvas.toDataURL(
          "image/png"
        );

      link.click();
    } catch (err) {
      console.error(err);

      setError(
        "圖片無法匯出。部分封面網站可能阻擋 Canvas 匯出。"
      );
    }
  }

  return (
    <main
      style={{
        minHeight:
          "100vh",
        padding:
          "40px 20px 80px",
        background:
          "linear-gradient(135deg, #f5f7ff 0%, #fff7fb 45%, #f4ffff 100%)",
        color: "#1f2937",
      }}
    >
      <div
        style={{
          maxWidth:
            "1100px",
          margin:
            "0 auto",
        }}
      >
        <header
          style={{
            marginBottom:
              "32px",
          }}
        >
          <h1
            style={{
              fontSize:
                "42px",
              fontWeight:
                800,
              margin:
                "0 0 10px",
            }}
          >
            Rainbow Collage Generator
          </h1>

          <p
            style={{
              margin: 0,
              color:
                "#6b7280",
              fontSize:
                "16px",
            }}
          >
            Upload your YouTube
            History and turn
            your music listening
            history into an album
            cover collage.
          </p>
        </header>

        <section
          style={{
            background:
              "rgba(255,255,255,0.72)",
            border:
              "1px solid rgba(255,255,255,0.8)",
            borderRadius:
              "24px",
            padding:
              "24px",
            marginBottom:
              "20px",
            boxShadow:
              "0 12px 40px rgba(31,41,55,0.08)",
            backdropFilter:
              "blur(20px)",
          }}
        >
          <h2>
            1. Upload YouTube
            History
          </h2>

          <input
            type="file"
            accept=".html,.htm"
            onChange={
              handleFile
            }
            disabled={
              loading ||
              analyzing
            }
          />

          <p
            style={{
              color:
                "#6b7280",
              marginBottom:
                0,
            }}
          >
            {status}
          </p>
        </section>

        <section
          style={{
            background:
              "rgba(255,255,255,0.72)",
            borderRadius:
              "24px",
            padding:
              "24px",
            marginBottom:
              "20px",
            boxShadow:
              "0 12px 40px rgba(31,41,55,0.08)",
            backdropFilter:
              "blur(20px)",
          }}
        >
          <h2>
            2. Select Period
          </h2>

          <div
            style={{
              display:
                "flex",
              flexWrap:
                "wrap",
              gap:
                "10px",
            }}
          >
            {PERIODS.map(
              (period) => (
                <button
                  key={
                    period.id
                  }
                  onClick={() =>
                    setSelectedPeriod(
                      period.id
                    )
                  }
                  style={{
                    padding:
                      "10px 18px",
                    borderRadius:
                      "999px",
                    border:
                      "1px solid #ddd",
                    background:
                      selectedPeriod ===
                      period.id
                        ? "#111827"
                        : "#fff",
                    color:
                      selectedPeriod ===
                      period.id
                        ? "#fff"
                        : "#111827",
                    cursor:
                      "pointer",
                  }}
                >
                  {
                    period.label
                  }
                </button>
              )
            )}
          </div>
        </section>

        <section
          style={{
            background:
              "rgba(255,255,255,0.72)",
            borderRadius:
              "24px",
            padding:
              "24px",
            marginBottom:
              "20px",
            boxShadow:
              "0 12px 40px rgba(31,41,55,0.08)",
            backdropFilter:
              "blur(20px)",
          }}
        >
          <h2>
            3. Music Candidates
          </h2>

          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(150px,1fr))",
              gap:
                "12px",
              marginBottom:
                "20px",
            }}
          >
            <StatCard
              label="History"
              value={
                filteredHistory.length
              }
            />

            <StatCard
              label="Music"
              value={
                musicCandidates.length
              }
            />

            <StatCard
              label="Matched"
              value={
                matched
              }
            />

            <StatCard
              label="Albums"
              value={
                albums.length
              }
            />
          </div>

          <button
            onClick={
              analyzeAlbums
            }
            disabled={
              analyzing ||
              !musicCandidates.length
            }
            style={{
              padding:
                "14px 24px",
              border: "none",
              borderRadius:
                "14px",
              background:
                analyzing
                  ? "#9ca3af"
                  : "#111827",
              color:
                "#fff",
              cursor:
                analyzing
                  ? "wait"
                  : "pointer",
              fontSize:
                "16px",
              fontWeight:
                700,
            }}
          >
            {analyzing
              ? "Analyzing..."
              : "Analyze Albums"}
          </button>

          {processed >
            0 && (
            <p
              style={{
                color:
                  "#6b7280",
              }}
            >
              Processed:{" "}
              {processed}{" "}
              · Matched:{" "}
              {matched}{" "}
              · Unique tracks:{" "}
              {uniqueTracks}
            </p>
          )}
        </section>

        <section
          style={{
            background:
              "rgba(255,255,255,0.72)",
            borderRadius:
              "24px",
            padding:
              "24px",
            marginBottom:
              "20px",
            boxShadow:
              "0 12px 40px rgba(31,41,55,0.08)",
            backdropFilter:
              "blur(20px)",
          }}
        >
          <h2>
            4. Top Albums
          </h2>

          {!albums.length ? (
            <p
              style={{
                color:
                  "#6b7280",
              }}
            >
              還沒有專輯資料。
            </p>
          ) : (
            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(auto-fill,minmax(150px,1fr))",
                gap:
                  "18px",
              }}
            >
              {albums.map(
                (
                  album,
                  index
                ) => (
                  <div
                    key={`${album.albumId}-${index}`}
                    style={{
                      overflow:
                        "hidden",
                      borderRadius:
                        "16px",
                      background:
                        "#fff",
                      boxShadow:
                        "0 6px 20px rgba(0,0,0,0.08)",
                    }}
                  >
                    {album.cover && (
                      <img
                        src={
                          album.cover
                        }
                        alt={
                          album.album
                        }
                        style={{
                          width:
                            "100%",
                          aspectRatio:
                            "1",
                          objectFit:
                            "cover",
                          display:
                            "block",
                        }}
                      />
                    )}

                    <div
                      style={{
                        padding:
                          "12px",
                      }}
                    >
                      <strong>
                        {
                          album.album
                        }
                      </strong>

                      <div
                        style={{
                          color:
                            "#6b7280",
                          fontSize:
                            "13px",
                          marginTop:
                            "4px",
                        }}
                      >
                        {
                          album.artist
                        }
                      </div>

                      <div
                        style={{
                          color:
                            "#9ca3af",
                          fontSize:
                            "12px",
                          marginTop:
                            "6px",
                        }}
                      >
                        {
                          album.plays
                        }{" "}
                        plays
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </section>

        <section
          style={{
            background:
              "rgba(255,255,255,0.72)",
            borderRadius:
              "24px",
            padding:
              "24px",
            boxShadow:
              "0 12px 40px rgba(31,41,55,0.08)",
            backdropFilter:
              "blur(20px)",
          }}
        >
          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
              gap:
                "12px",
              flexWrap:
                "wrap",
              marginBottom:
                "20px",
            }}
          >
            <div>
              <h2
                style={{
                  margin:
                    "0 0 6px",
                }}
              >
                5. Rainbow Collage
              </h2>

              <p
                style={{
                  margin: 0,
                  color:
                    "#6b7280",
                }}
              >
                {albums.length
                  ? `${albums.length} albums · ${getGridSize(
                      albums.length
                    )} × ${getGridSize(
                      albums.length
                    )} grid`
                  : "等待產生拼貼圖"}
              </p>
            </div>

            <div
              style={{
                display:
                  "flex",
                gap:
                  "10px",
              }}
            >
              <button
                onClick={
                  regenerateCollage
                }
                disabled={
                  !albums.length ||
                  collageLoading
                }
                style={{
                  padding:
                    "11px 18px",
                  borderRadius:
                    "12px",
                  border:
                    "1px solid #ddd",
                  background:
                    "#fff",
                  cursor:
                    albums.length
                      ? "pointer"
                      : "not-allowed",
                }}
              >
                Shuffle
              </button>

              <button
                onClick={
                  downloadPNG
                }
                disabled={
                  !albums.length ||
                  collageLoading
                }
                style={{
                  padding:
                    "11px 18px",
                  borderRadius:
                    "12px",
                  border:
                    "none",
                  background:
                    "#111827",
                  color:
                    "#fff",
                  cursor:
                    albums.length
                      ? "pointer"
                      : "not-allowed",
                }}
              >
                Download PNG
              </button>
            </div>
          </div>

          <div
            style={{
              width:
                "100%",
              maxWidth:
                "1024px",
              margin:
                "0 auto",
              position:
                "relative",
            }}
          >
            <canvas
              ref={
                canvasRef
              }
              width={
                COLLAGE_SIZE
              }
              height={
                COLLAGE_SIZE
              }
              style={{
                display:
                  "block",
                width:
                  "100%",
                height:
                  "auto",
                aspectRatio:
                  "1",
                background:
                  "#fff",
                borderRadius:
                  "8px",
                boxShadow:
                  "0 12px 40px rgba(0,0,0,0.12)",
              }}
            />

            {collageLoading && (
              <div
                style={{
                  position:
                    "absolute",
                  inset: 0,
                  display:
                    "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  background:
                    "rgba(255,255,255,0.65)",
                  backdropFilter:
                    "blur(8px)",
                  borderRadius:
                    "8px",
                  fontWeight:
                    700,
                }}
              >
                Generating collage...
              </div>
            )}
          </div>
        </section>

        {error && (
          <div
            style={{
              marginTop:
                "20px",
              padding:
                "16px 20px",
              borderRadius:
                "14px",
              background:
                "#fff1f2",
              color:
                "#be123c",
              border:
                "1px solid #fecdd3",
            }}
          >
            {error}
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div
      style={{
        padding:
          "16px",
        borderRadius:
          "16px",
        background:
          "rgba(255,255,255,0.8)",
        border:
          "1px solid rgba(0,0,0,0.05)",
      }}
    >
      <div
        style={{
          fontSize:
            "13px",
          color:
            "#6b7280",
          marginBottom:
            "5px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize:
            "28px",
          fontWeight:
            800,
        }}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}