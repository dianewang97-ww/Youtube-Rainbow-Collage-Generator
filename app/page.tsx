import { auth, signIn, signOut } from "@/auth";
import PlaylistLoader from "./components/PlaylistLoader";

export default async function Home() {
  const session = await auth();

  return (
    <main
      style={{
        maxWidth: 780,
        margin: "70px auto",
        padding: 24,
        fontFamily: "system-ui",
      }}
    >
      <p
        style={{
          letterSpacing: 3,
          color: "#8a63ce",
          fontWeight: 700,
        }}
      >
        YOUR MUSIC, IN COLOR
      </p>

      <h1
        style={{
          fontSize: 48,
          lineHeight: 1.05,
        }}
      >
        Rainbow Collage Generator
      </h1>

      <p
        style={{
          color: "#655d70",
          lineHeight: 1.7,
        }}
      >
        Connect a Google account to explore supported YouTube data.
        Official APIs do not provide complete personal listening history,
        so this starter does not claim to calculate true most-played
        albums yet.
      </p>

      {session?.user ? (
        <>
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
          >
            <p>Signed in as {session.user.email}</p>

            <button type="submit">
              Sign out
            </button>
          </form>

          <hr
            style={{
              margin: "30px 0",
              borderColor: "#eee",
            }}
          />

          <h2>My YouTube Music data</h2>

          <p
            style={{
              color: "#655d70",
              lineHeight: 1.7,
            }}
          >
            Start by loading the playlists available to your
            YouTube account.
          </p>

          <PlaylistLoader />
        </>
      ) : (
        <form
          action={async () => {
            "use server";
            await signIn("google");
          }}
        >
          <button
            type="submit"
            style={{
              padding: "12px 18px",
              borderRadius: 12,
              cursor: "pointer",
            }}
          >
            Continue with Google
          </button>
        </form>
      )}

      <hr
        style={{
          margin: "40px 0 30px",
          borderColor: "#eee",
        }}
      />

      <h2></h2>

      <p
  style={{
    color: "#655d70",
    lineHeight: 1.7,
  }}
>
  Made By Diane Wang, Still testing!💖
</p>
    </main>
  );
}