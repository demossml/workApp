#!/usr/bin/env python3
"""Telegram photo upload helper — called from evo-backend (Node.js can't reach api.telegram.org).
Usage: python3 telegram_upload.py <photo_path> <bot_token> <chat_id>
Returns JSON with file_id on stdout.
"""
import json, sys, urllib.request, os

PHOTO_PATH = sys.argv[1]
BOT_TOKEN = sys.argv[2]
CHAT_ID = sys.argv[3]

BOUNDARY = "----FormBoundary7MA4YWxkTrZu0gW"
CRLF = "\r\n"

with open(PHOTO_PATH, "rb") as f:
    photo_data = f.read()

body = (
    f"--{BOUNDARY}{CRLF}"
    f'Content-Disposition: form-data; name="chat_id"{CRLF}{CRLF}'
    f"{CHAT_ID}{CRLF}"
    f"--{BOUNDARY}{CRLF}"
    f'Content-Disposition: form-data; name="photo"; filename="photo.jpg"{CRLF}'
    f"Content-Type: image/jpeg{CRLF}{CRLF}"
).encode("utf-8") + photo_data + f"{CRLF}--{BOUNDARY}--{CRLF}".encode("utf-8")

req = urllib.request.Request(
    f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto",
    data=body,
    headers={
        "Content-Type": f"multipart/form-data; boundary={BOUNDARY}",
    },
)

try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode())
        if not result.get("ok"):
            print(json.dumps({"error": f"Telegram API: {result.get('description', 'unknown')}"}))
            sys.exit(1)
        photos = result.get("result", {}).get("photo", [])
        if not photos:
            print(json.dumps({"error": "No photo in response"}))
            sys.exit(1)
        largest = photos[-1]
        print(json.dumps({
            "file_id": largest["file_id"],
            "file_unique_id": largest.get("file_unique_id", ""),
            "file_size": largest.get("file_size"),
            "width": largest.get("width"),
            "height": largest.get("height"),
        }))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
