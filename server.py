from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen


class CRMHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/sheet.csv":
            self.proxy_sheet(parsed)
            return
        super().do_GET()

    def proxy_sheet(self, parsed):
        query = parse_qs(parsed.query)
        url = query.get("url", [""])[0]
        if not url.startswith("https://docs.google.com/spreadsheets/"):
            self.send_error(400, "Invalid Google Sheets URL")
            return

        request = Request(url, headers={"User-Agent": "AltaStudioCRM/1.0"})
        try:
            with urlopen(request, timeout=20) as response:
                body = response.read()
        except Exception as exc:
            self.send_error(502, f"Could not fetch sheet: {exc}")
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("localhost", 5173), CRMHandler)
    print("CRM local: http://localhost:5173")
    server.serve_forever()
