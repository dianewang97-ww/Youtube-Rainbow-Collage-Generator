import { auth } from "@/auth";
import { NextResponse } from "next/server";

const YOUTUBE_API_URL =
  "https://www.googleapis.com/youtube/v3/playlists";

export async function GET() {
  const session = await auth();

  if (!session?.youtubeAccessToken) {
    return NextResponse.json(
      {
        error: "Not authenticated with Google/YouTube",
      },
      { status: 401 }
    );
  }

  const url = new URL(YOUTUBE_API_URL);

  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("mine", "true");
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
      console.error("YouTube API error:", data);

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
    console.error("Failed to fetch YouTube playlists:", error);

    return NextResponse.json(
      {
        error: "Failed to connect to YouTube",
      },
      { status: 500 }
    );
  }
}