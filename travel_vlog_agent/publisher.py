from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class YouTubePublishRequest:
    video_path: Path
    title: str
    description: str
    tags: list[str]
    privacy_status: str = "private"

    def to_dict(self) -> dict[str, Any]:
        return {
            "video_path": str(self.video_path),
            "title": self.title,
            "description": self.description,
            "tags": self.tags,
            "privacy_status": self.privacy_status,
        }


def build_description(trip_name: str, locations: list[str], highlights: list[str]) -> str:
    location_text = ", ".join(locations) if locations else "multiple spots"
    highlight_lines = "\n".join(f"- {item}" for item in highlights[:10])
    return (
        f"Welcome to my {trip_name} travel vlog.\n\n"
        f"In this episode we explore: {location_text}.\n\n"
        f"Highlights:\n{highlight_lines}\n\n"
        "Subscribe for the next trip and drop questions in the comments!"
    )


def write_publish_payload(path: Path, request: YouTubePublishRequest) -> None:
    path.write_text(json.dumps(request.to_dict(), indent=2), encoding="utf-8")


def upload_with_google_api(request: YouTubePublishRequest) -> str:
    """
    Optional upload helper.

    Requires:
      pip install google-api-python-client google-auth-oauthlib google-auth-httplib2
      and a client secrets file from Google Cloud.

    This function intentionally imports dependencies lazily so the agent
    can still run planning/rendering steps without upload libraries installed.
    """
    try:
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
    except ImportError as exc:  # pragma: no cover - dependency optional
        raise RuntimeError(
            "YouTube upload dependencies missing. Install google-api-python-client and auth libs."
        ) from exc

    token_path = Path("youtube_token.json")
    client_secrets_path = Path("youtube_client_secret.json")
    if not token_path.exists() or not client_secrets_path.exists():
        raise RuntimeError(
            "Missing OAuth files: youtube_token.json and youtube_client_secret.json"
        )

    from google.oauth2.credentials import Credentials

    credentials = Credentials.from_authorized_user_file(
        str(token_path),
        scopes=["https://www.googleapis.com/auth/youtube.upload"],
    )
    youtube = build("youtube", "v3", credentials=credentials)

    body = {
        "snippet": {
            "title": request.title,
            "description": request.description,
            "tags": request.tags,
            "categoryId": "19",  # Travel & Events
        },
        "status": {"privacyStatus": request.privacy_status},
    }

    media = MediaFileUpload(str(request.video_path), chunksize=-1, resumable=True)
    upload = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
    response = upload.execute()
    return str(response.get("id", ""))
