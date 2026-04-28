from __future__ import annotations

import argparse
import json
from pathlib import Path

from .agent import TravelVlogAgent
from .config import AgentConfig


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="travel-vlog-agent",
        description="Automate planning, rendering, and publishing travel vlogs.",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("agent_config.json"),
        help="Path to JSON config file.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("init-config", help="Write a starter config JSON.")
    subparsers.add_parser("plan", help="Discover clips and build a vlog plan.")
    subparsers.add_parser("render", help="Generate FFmpeg concat manifest and command.")

    publish = subparsers.add_parser("publish", help="Build YouTube publish payload.")
    publish.add_argument("--trip-name", required=True)
    publish.add_argument("--locations", default="")
    publish.add_argument("--highlights", default="")
    publish.add_argument(
        "--upload",
        action="store_true",
        help="Attempt direct upload to YouTube via Google API.",
    )

    run = subparsers.add_parser("run", help="Run end-to-end workflow.")
    run.add_argument("--trip-name", required=True)
    run.add_argument("--locations", default="")
    run.add_argument("--highlights", default="")

    return parser


def parse_csv(value: str) -> list[str]:
    if not value.strip():
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def cmd_init_config(config_path: Path) -> int:
    if config_path.exists():
        raise SystemExit(f"Config already exists: {config_path}")
    config_path.write_text(json.dumps(AgentConfig.template(), indent=2), encoding="utf-8")
    print(f"Wrote config template to {config_path}")
    return 0


def load_agent(config_path: Path) -> TravelVlogAgent:
    if not config_path.exists():
        raise SystemExit(
            f"Config file not found: {config_path}. Run `travel-vlog-agent init-config` first."
        )
    config = AgentConfig.from_file(config_path)
    return TravelVlogAgent(config)


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "init-config":
        return cmd_init_config(args.config)

    agent = load_agent(args.config)

    if args.command == "plan":
        plan, plan_path = agent.run_plan()
        print(f"Plan written: {plan_path}")
        print(f"Segments: {len(plan.segments)}")
        print(f"Estimated runtime: {int(plan.estimated_duration_seconds)} seconds")
        return 0

    if args.command == "render":
        plan, _ = agent.run_plan()
        artifacts, render_path = agent.run_render_plan(plan)
        print(f"Render instructions written: {render_path}")
        print(f"Concat manifest: {artifacts.concat_manifest}")
        print("Run this command to render:")
        print(artifacts.ffmpeg_command)
        return 0

    if args.command == "publish":
        plan, _ = agent.run_plan()
        artifacts, _ = agent.run_render_plan(plan)
        request, publish_path = agent.run_publish_plan(
            artifacts,
            trip_name=args.trip_name,
            locations=parse_csv(args.locations),
            highlights=parse_csv(args.highlights),
        )
        print(f"Publish payload written: {publish_path}")
        if args.upload:
            video_id = agent.upload(request)
            print(f"YouTube upload complete. Video ID: {video_id}")
        return 0

    if args.command == "run":
        outputs = agent.run_all(
            trip_name=args.trip_name,
            locations=parse_csv(args.locations),
            highlights=parse_csv(args.highlights),
        )
        print(f"Discovered clips: {outputs.clips_path}")
        print(f"Plan: {outputs.plan_path}")
        print(f"Render: {outputs.render_path}")
        print(f"Publish payload: {outputs.publish_path}")
        print("Run this command to render:")
        print(outputs.artifacts.ffmpeg_command)
        return 0

    raise SystemExit(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
