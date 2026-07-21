from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        url = query.get("url", [""])[0]
        if not url.startswith("https://docs.google.com/spreadsheets/"):
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Invalid Google Sheets URL")
            return

        request = Request(url, headers={"User-Agent": "AltaStudioCRM/1.0"})
        try:
            with urlopen(request, timeout=20) as response:
                body = response.read()
        except Exception as exc:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(f"Could not fetch sheet: {exc}".encode())
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)
