import { describe, expect, it } from "vitest";
import { parseYouTubeUrl } from "@/lib/youtube/parseYouTubeUrl";

const VIDEO = { type: "video", id: "dQw4w9WgXcQ" } as const;

describe("parseYouTubeUrl", () => {
  it("parses standard watch URLs", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual(VIDEO);
    expect(parseYouTubeUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42s")).toEqual(VIDEO);
    expect(parseYouTubeUrl("http://youtube.com/watch?v=dQw4w9WgXcQ")).toEqual(VIDEO);
    expect(parseYouTubeUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual(VIDEO);
  });

  it("parses youtu.be short links", () => {
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual(VIDEO);
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?si=abc123")).toEqual(VIDEO);
  });

  it("parses shorts, embed and live URLs", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual(VIDEO);
    expect(parseYouTubeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toEqual(VIDEO);
    expect(parseYouTubeUrl("https://www.youtube.com/live/dQw4w9WgXcQ")).toEqual(VIDEO);
    expect(parseYouTubeUrl("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toEqual(VIDEO);
  });

  it("parses playlist URLs", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI")).toEqual({
      type: "playlist",
      id: "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI",
    });
  });

  it("treats watch URLs with a list param as playlists", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI")).toEqual({
      type: "playlist",
      id: "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI",
    });
  });

  it("accepts input without a scheme and trims whitespace", () => {
    expect(parseYouTubeUrl("  youtube.com/watch?v=dQw4w9WgXcQ \n")).toEqual(VIDEO);
    expect(parseYouTubeUrl("youtu.be/dQw4w9WgXcQ")).toEqual(VIDEO);
  });

  it("rejects malformed or non-YouTube input", () => {
    expect(parseYouTubeUrl("")).toBeNull();
    expect(parseYouTubeUrl("   ")).toBeNull();
    expect(parseYouTubeUrl("not a url at all")).toBeNull();
    expect(parseYouTubeUrl("https://vimeo.com/12345")).toBeNull();
    expect(parseYouTubeUrl("https://www.youtube.com/")).toBeNull();
    expect(parseYouTubeUrl("https://www.youtube.com/watch")).toBeNull();
    expect(parseYouTubeUrl("ftp://youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYouTubeUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects malformed video ids", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=tooshort")).toBeNull();
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQQ")).toBeNull();
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXc!")).toBeNull();
  });
});
