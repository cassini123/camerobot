"""Minimal standard-library HTTP API for Camerobot MVP0."""

from __future__ import annotations

import argparse
import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from camerobot.models import Intent, OutputType, ShotConstraints, to_jsonable
from camerobot.pipeline import run_shot_pipeline


class CamerobotRequestHandler(BaseHTTPRequestHandler):
    """HTTP endpoints for local MVP0 experiments."""

    server_version = "CamerobotMVP0/0.1"

    def do_GET(self) -> None:  # noqa: N802 - stdlib method name
        if self.path == "/health":
            self._send_json({"status": "ok"})
            return
        self._send_json({"error": "not_found"}, status=HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802 - stdlib method name
        if self.path != "/shot-requests":
            self._send_json({"error": "not_found"}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            payload = self._read_json_body()
            result = self._handle_shot_request(payload)
        except Exception as exc:  # pragma: no cover - exercised manually by clients
            self._send_json(
                {"error": type(exc).__name__, "message": str(exc)},
                status=HTTPStatus.BAD_REQUEST,
            )
            return

        self._send_json(result, status=HTTPStatus.CREATED)

    def _handle_shot_request(self, payload: dict[str, Any]) -> dict[str, object]:
        asset_path = str(payload["asset_path"])
        constraints_payload = payload.get("constraints", {})

        return run_shot_pipeline(
            asset_path,
            intent=Intent(payload.get("intent", Intent.REPLICATE_COMPOSITION.value)),
            output=OutputType(payload.get("output", OutputType.PORTRAIT_PHOTO.value)),
            constraints=ShotConstraints(
                indoor=bool(constraints_payload.get("indoor", True)),
                max_distance_m=float(constraints_payload.get("max_distance_m", 4.0)),
                use_drone=bool(constraints_payload.get("use_drone", False)),
                allow_arm_motion=bool(
                    constraints_payload.get("allow_arm_motion", True)
                ),
                allow_lighting_adjustment=bool(
                    constraints_payload.get("allow_lighting_adjustment", True)
                ),
            ),
        )

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length)
        if not raw_body:
            return {}
        payload = json.loads(raw_body.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("JSON body must be an object")
        return payload

    def _send_json(
        self,
        payload: object,
        *,
        status: HTTPStatus = HTTPStatus.OK,
    ) -> None:
        body = json.dumps(to_jsonable(payload), ensure_ascii=False, indent=2).encode(
            "utf-8"
        )
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        """Reduce default HTTP logging noise in CLI use."""

        return


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Camerobot MVP0 HTTP API.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), CamerobotRequestHandler)
    print(f"Camerobot API listening on http://{args.host}:{args.port}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
