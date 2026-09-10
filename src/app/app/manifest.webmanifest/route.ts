export function GET() {
  return Response.json({
    name: "활력 파트너스",
    short_name: "활력",
    start_url: "/app",
    scope: "/app",
    display: "standalone",
    background_color: "#f5f7f2",
    theme_color: "#17695a",
    lang: "ko",
    icons: [
      {
        src: "/app/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/member-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  });
}
