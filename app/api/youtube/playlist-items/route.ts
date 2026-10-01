import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.youtubeAccessToken) {
    return NextResponse.json(
      { error: "Not authenticated with Google/YouTube" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get("playlistId");

  if (!playlistId) {
    return NextResponse.json(
      { error: "Missing playlistId" },
      { status: 400 }
    );
  }

  const url = new URL(
    "https://www.googleapis.com/youtube/v3/playlistItems"
  );

  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("playlistId", playlistId);
  url.searchParams.set("maxResults", "50");

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.youtubeAccessToken}`,
      },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("YouTube playlist items error:", data);

      return NextResponse.json(
        {
          error: "YouTube API request failed",
          details: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      items: data.items ?? [],
      nextPageToken: data.nextPageToken ?? null,
    });
  } catch (error) {
    console.error("Failed to fetch playlist items:", error);

    return NextResponse.json(
      {
        error: "Failed to connect to YouTube",
      },
      { status: 500 }
    );
  }
}