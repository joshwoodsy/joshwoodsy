from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from .config import AgentConfig
from .discovery import ClipDiscovery
from .models import VlogPlan
from .planner import TimelinePlanner
from .publisher import (
    YouTubePublishRequest,
    build_description,
    upload_with_google_api,
    write_publish_payload,
)
from .render import RenderArtifacts, RenderPlanner


@dataclass(slots=True)
class AgentOutputs:
    clips_path: Path
    plan_path: Path
    render_path: Path
    publish_path: Path
    artifacts: RenderArtifacts
    plan: VlogPlan


@dataclass(slots=True)
class TravelVlogAgent:
    config: AgentConfig

    def run_plan(self) -> tuple[VlogPlan, Path]:
        self.config.output_dir.mkdir(parents=True, exist_ok=True)
        clips = ClipDiscovery(self.config).discover()
        plan = TimelinePlanner(self.config).build(clips)
        plan_path = self.config.output_dir / "vlog_plan.json"
        plan_path.write_text(json.dumps(plan.to_dict(), indent=2), encoding="utf-8")
        return plan, plan_path

    def run_render_plan(self, plan: VlogPlan | None = None) -> tuple[RenderArtifacts, Path]:
        if plan is None:
            plan, _ = self.run_plan()
        artifacts = RenderPlanner(self.config.output_dir).build(plan)
        render_path = self.config.output_dir / "render_instructions.json"
        payload = {
            "concat_manifest": str(artifacts.concat_manifest),
            "ffmpeg_command": artifacts.ffmpeg_command,
            "output_video": str(artifacts.output_video),
        }
        render_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return artifacts, render_path

    def run_publish_plan(
        self,
        artifacts: RenderArtifacts,
        *,
        trip_name: str,
        locations: list[str],
        highlights: list[str],
    ) -> tuple[YouTubePublishRequest, Path]:
        title = self.config.youtube_title_template.format(
            trip_name=trip_name,
            episode_date=date.today().isoformat(),
        )
        description = build_description(
            trip_name=trip_name,
            locations=locations,
            highlights=highlights,
        )
        tags = dedupe_tags(
            [trip_name.lower(), "travel vlog", "travel", "adventure", *locations]
        )
        request = YouTubePublishRequest(
            video_path=artifacts.output_video,
            title=title,
            description=description,
            tags=tags[:15],
            privacy_status=self.config.youtube_privacy_status,
        )
        publish_path = self.config.output_dir / "publish_payload.json"
        write_publish_payload(publish_path, request)
        return request, publish_path

    def run_all(
        self,
        *,
        trip_name: str,
        locations: list[str],
        highlights: list[str],
    ) -> AgentOutputs:
        clips = ClipDiscovery(self.config).discover()
        clips_path = self.config.output_dir / "discovered_clips.json"
        self.config.output_dir.mkdir(parents=True, exist_ok=True)
        clips_path.write_text(
            json.dumps([clip.to_dict() for clip in clips], indent=2), encoding="utf-8"
        )
        plan = TimelinePlanner(self.config).build(clips)
        plan_path = self.config.output_dir / "vlog_plan.json"
        plan_path.write_text(json.dumps(plan.to_dict(), indent=2), encoding="utf-8")
        artifacts = RenderPlanner(self.config.output_dir).build(plan)
        render_path = self.config.output_dir / "render_instructions.json"
        render_path.write_text(
            json.dumps(
                {
                    "concat_manifest": str(artifacts.concat_manifest),
                    "ffmpeg_command": artifacts.ffmpeg_command,
                    "output_video": str(artifacts.output_video),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        _, publish_path = self.run_publish_plan(
            artifacts,
            trip_name=trip_name,
            locations=locations,
            highlights=highlights,
        )
        return AgentOutputs(
            clips_path=clips_path,
            plan_path=plan_path,
            render_path=render_path,
            publish_path=publish_path,
            artifacts=artifacts,
            plan=plan,
        )

    def upload(self, request: YouTubePublishRequest) -> str:
        return upload_with_google_api(request)


def dedupe_tags(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        normalized = item.strip().lower()
        if not normalized:
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result
