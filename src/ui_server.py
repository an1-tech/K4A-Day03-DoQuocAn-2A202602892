"""Local web demo for comparing the baseline chatbot with the ReAct agent."""

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from app import run_react_agent
from mcp_server import MCPAcademicServer
from prompts import CHATBOT_BASELINE_PROMPT
from providers import get_llm_provider


WEB_DIR = Path(__file__).resolve().parent / "web"
STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "application/javascript; charset=utf-8"),
}


class DemoHandler(BaseHTTPRequestHandler):
    def _send(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status, value):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8")

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/meta":
            provider = get_llm_provider()
            server = MCPAcademicServer()
            self._json(200, {
                "provider": provider.__class__.__name__,
                "model": getattr(provider, "model_name", ""),
                "mcp_server": server.server_name,
                "tools": [tool["name"] for tool in server.list_tools()],
            })
            return

        static_file = STATIC_FILES.get(path)
        if static_file is None:
            self._json(404, {"error": "Không tìm thấy trang."})
            return
        filename, content_type = static_file
        self._send(200, (WEB_DIR / filename).read_bytes(), content_type)

    def do_POST(self):
        if urlsplit(self.path).path != "/api/compare":
            self._json(404, {"error": "Không tìm thấy API."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 8192:
                raise ValueError("Câu hỏi quá dài hoặc rỗng.")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("Dữ liệu gửi lên không hợp lệ.")
            question = payload.get("question")
            if not isinstance(question, str) or not 0 < len(question.strip()) <= 500:
                raise ValueError("Nhập câu hỏi từ 1 đến 500 ký tự.")
            question = question.strip()
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            self._json(400, {"error": str(exc)})
            return

        try:
            provider = get_llm_provider()
            baseline_answer = provider.generate(
                question, system_prompt=CHATBOT_BASELINE_PROMPT
            )
            trace = run_react_agent(question, provider, MCPAcademicServer())
            final_answer = next(
                (event.get("output", "") for event in reversed(trace)
                 if event.get("action_type") == "FINAL_ANSWER"),
                "Agent chưa đưa ra câu trả lời cuối.",
            )
            self._json(200, {
                "question": question,
                "baseline_answer": baseline_answer,
                "agent_answer": final_answer,
                "trace": trace,
                "provider": provider.__class__.__name__,
                "model": getattr(provider, "model_name", ""),
            })
        except Exception as exc:
            print(f"Lỗi khi chạy so sánh: {type(exc).__name__}")
            self._json(500, {"error": "Không thể chạy phép so sánh. Kiểm tra terminal của máy chủ."})


def main():
    parser = argparse.ArgumentParser(description="Local VinUni Chatbot vs ReAct demo")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), DemoHandler)
    print(f"Mở giao diện tại http://127.0.0.1:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nĐã dừng giao diện.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
