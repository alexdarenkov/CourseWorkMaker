"""Ограничение HTTP-body до JSON-декодирования, включая chunked-запросы."""
from starlette.responses import JSONResponse

MAX_BODY_BYTES = 32 * 1024 * 1024


class RequestSizeLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in ("POST", "PUT", "PATCH"):
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        try:
            declared = int(headers.get(b"content-length", b"0"))
            if declared < 0:
                raise ValueError
        except ValueError:
            return await JSONResponse({"detail": "Некорректный Content-Length"}, status_code=400)(scope, receive, send)
        if declared > MAX_BODY_BYTES:
            return await self.reject(scope, receive, send)
        messages = []
        size = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            size += len(message.get("body", b""))
            if size > MAX_BODY_BYTES:
                return await self.reject(scope, receive, send)
            messages.append(message)
            if not message.get("more_body", False):
                break
        pending = iter(messages)

        async def replay():
            message = next(pending, None)
            return message if message is not None else await receive()

        await self.app(scope, replay, send)

    @staticmethod
    async def reject(scope, receive, send):
        await JSONResponse({"detail": "Запрос больше 32 МБ"}, status_code=413)(scope, receive, send)
