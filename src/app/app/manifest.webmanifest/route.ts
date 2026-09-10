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
        src: "/member-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  });
}
