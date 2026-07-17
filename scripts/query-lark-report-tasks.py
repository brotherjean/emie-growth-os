#!/usr/bin/env python3
"""Query Feishu/Lark Report tasks through lark-cli raw OpenAPI."""

import argparse
import json
import subprocess
import sys
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List


API_PATH = "/open-apis/report/v1/tasks/query"


def resolve_timezone(name):
    if name in ("Asia/Shanghai", "Asia/Chongqing", "UTC+8", "+08:00"):
        return timezone(timedelta(hours=8))
    if name in ("UTC", "Z", "+00:00"):
        return timezone.utc
    raise ValueError("unsupported timezone: %s" % name)


def parse_time(value, is_end, tz) -> int:
    text = value.strip()
    if not text:
        raise ValueError("empty time value")

    if text.isdigit():
        return int(text)

    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        date_value = datetime.strptime(text, "%Y-%m-%d").date()
        dt = datetime.combine(date_value, time.max if is_end else time.min, tzinfo=tz)
        return int(dt.timestamp())

    normalized = text.replace("Z", "+00:00")
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    return int(dt.timestamp())


def build_body(args, page_token):
    tz = resolve_timezone(args.timezone)
    body = {
        "commit_start_time": parse_time(args.start, is_end=False, tz=tz),
        "commit_end_time": parse_time(args.end, is_end=True, tz=tz),
        "page_size": args.page_size,
        "page_token": page_token,
    }
    if args.rule_id:
        body["rule_id"] = args.rule_id
    if args.user_id:
        body["user_id"] = args.user_id
    return body


def run_lark_cli(args, body):
    cmd = [
        "lark-cli",
        "api",
        "POST",
        API_PATH,
        "--as",
        args.identity,
        "--params",
        json.dumps({"user_id_type": args.user_id_type}, ensure_ascii=False),
        "--data",
        json.dumps(body, ensure_ascii=False),
        "--format",
        "json",
    ]
    if args.profile:
        cmd.extend(["--profile", args.profile])

    if args.dry_run:
        return {"dry_run": True, "cmd": cmd, "body": body}

    proc = subprocess.run(cmd, universal_newlines=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr or proc.stdout)
        raise SystemExit(proc.returncode)
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {"raw_stdout": proc.stdout}


def response_data(resp):
    data = resp.get("data")
    if isinstance(data, dict) and isinstance(data.get("data"), dict):
        return data["data"]
    if isinstance(data, dict):
        return data
    return {}


def main() -> int:
    parser = argparse.ArgumentParser(description="Query Feishu/Lark Report tasks via lark-cli.")
    parser.add_argument("--start", required=True, help="Start date/time: YYYY-MM-DD, ISO datetime, or Unix seconds.")
    parser.add_argument("--end", required=True, help="End date/time: YYYY-MM-DD, ISO datetime, or Unix seconds.")
    parser.add_argument("--timezone", default="Asia/Shanghai", help="Timezone for date-only inputs.")
    parser.add_argument("--rule-id", help="Report rule ID.")
    parser.add_argument("--user-id", help="Submitter user ID.")
    parser.add_argument("--user-id-type", default="open_id", choices=["open_id", "union_id", "user_id"])
    parser.add_argument("--page-size", type=int, default=20, help="Page size, 0-20.")
    parser.add_argument("--page-all", action="store_true", help="Follow page_token while has_more is true.")
    parser.add_argument("--as", dest="identity", default="user", choices=["user", "bot"])
    parser.add_argument("--profile", help="lark-cli profile name.")
    parser.add_argument("--output", help="Write JSON result to this file.")
    parser.add_argument("--dry-run", action="store_true", help="Print the lark-cli request without calling Feishu.")
    args = parser.parse_args()

    if not 0 <= args.page_size <= 20:
        parser.error("--page-size must be between 0 and 20")

    page_token = ""
    pages = []  # type: List[Dict[str, Any]]
    while True:
        body = build_body(args, page_token)
        resp = run_lark_cli(args, body)
        pages.append(resp)
        if args.dry_run or not args.page_all:
            break
        data = response_data(resp)
        if not data.get("has_more"):
            break
        page_token = str(data.get("page_token") or "")
        if not page_token:
            break

    if len(pages) == 1:
        result = pages[0]  # type: Dict[str, Any]
    else:
        items = []  # type: List[Any]
        for page in pages:
            data = response_data(page)
            if isinstance(data.get("items"), list):
                items.extend(data["items"])
        result = {"ok": True, "pages": len(pages), "items": items, "raw_pages": pages}

    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
