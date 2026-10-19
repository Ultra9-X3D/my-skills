"""Locate canonical Obsidian notes and save drafts with a source hash guard."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timezone


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def inside(path, root):
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def cloud_vault(explicit=None):
    if explicit:
        root = Path(explicit).expanduser().resolve(strict=True)
    else:
        appdata = Path(os.environ.get("APPDATA", Path.home() / "AppData/Roaming"))
        registry = appdata / "obsidian/obsidian.json"
        configured = json.loads(registry.read_text(encoding="utf-8-sig"))
        candidates = []
        for item in configured.get("vaults", {}).values():
            path = Path(item["path"]).expanduser()
            if path.name == "课程学习" and "icloud~md~obsidian" in str(path).lower():
                candidates.append((path, bool(item.get("open"))))
        active = [path for path, opened in candidates if opened]
        choices = active or [path for path, _ in candidates]
        if len(choices) != 1:
            raise ValueError("无法唯一定位 iCloud 课程库；请核对 Obsidian 配置并指定 --vault。")
        root = choices[0].resolve(strict=True)
    if not root.is_dir():
        raise ValueError("课程库必须是已存在的目录。")
    return root


def note_path(vault, supplied):
    path = Path(supplied).expanduser()
    path = (path if path.is_absolute() else vault / path).resolve(strict=True)
    if not inside(path, vault) or path.suffix.lower() != ".md" or not path.is_file():
        raise ValueError("目标必须是已确认课程库内的 Markdown 文件；独立桌面副本不能直接提交。")
    return path


def wiki_embeds(vault, note, text):
    result = []
    for match in re.finditer(r"!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]", text):
        reference = match.group(1).split("#", 1)[0].strip()
        if not reference:
            continue
        candidates = set()
        for candidate in (note.parent / reference, vault / reference, vault / "附件" / reference):
            if candidate.is_file():
                candidates.add(candidate.resolve())
        if not candidates and "/" not in reference and "\\" not in reference:
            candidates.update(path.resolve() for path in vault.rglob(reference) if path.is_file())
        result.append({
            "reference": reference,
            "status": "found" if len(candidates) == 1 else "missing" if not candidates else "ambiguous",
            "paths": sorted(str(path) for path in candidates),
        })
    return result


def inspect(vault, note):
    data = note.read_bytes()
    text = data.decode("utf-8-sig")
    return {
        "vault": str(vault),
        "note": str(note),
        "sha256": sha256(data),
        "bytes": len(data),
        "wiki_embeds": wiki_embeds(vault, note, text),
        "verification": "local_file_readback_only",
        "remote_sync_confirmed": False,
    }


def commit(vault, note, draft, expected, backup_dir=None):
    if not re.fullmatch(r"[0-9a-fA-F]{64}", expected):
        raise ValueError("expected-sha256 必须是 inspect 返回的 SHA-256。")
    draft_path = Path(draft).expanduser().resolve(strict=True)
    if inside(draft_path, vault):
        raise ValueError("草稿必须位于课程库之外。")
    data = draft_path.read_bytes().decode("utf-8-sig").encode("utf-8")
    codex_dir = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))
    backups = Path(backup_dir).expanduser() if backup_dir else codex_dir / "backups/course-notes"
    backups = backups.resolve()
    if inside(backups, vault):
        raise ValueError("备份目录必须位于课程库之外。")
    with note.open("r+b") as handle:
        original = handle.read()
        if sha256(original) != expected.lower():
            raise ValueError("原笔记已变化，未写入；请重新读取并合并最新内容。")
        if original == data:
            return {**inspect(vault, note), "changed": False}
        backups.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
        backup = backups / f"{note.stem}-{stamp}-{expected[:12]}.md"
        with backup.open("xb") as backup_handle:
            backup_handle.write(original)
        handle.seek(0)
        if sha256(handle.read()) != expected.lower():
            raise ValueError(f"备份期间原笔记发生变化，未写入；备份：{backup}")
        handle.seek(0)
        handle.write(data)
        handle.truncate()
        handle.flush()
        os.fsync(handle.fileno())
    result = inspect(vault, note)
    if result["sha256"] != sha256(data):
        raise ValueError(f"保存后的文件与草稿不一致，请核对并保留最新内容；原文备份：{backup}")
    return {**result, "changed": True, "backup": str(backup)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    for name in ("inspect", "commit"):
        command = commands.add_parser(name)
        command.add_argument("--vault")
        command.add_argument("--note", required=True)
        if name == "commit":
            command.add_argument("--draft", required=True)
            command.add_argument("--expected-sha256", required=True)
            command.add_argument("--backup-dir")
    args = parser.parse_args()
    try:
        vault = cloud_vault(args.vault)
        note = note_path(vault, args.note)
        result = inspect(vault, note) if args.action == "inspect" else commit(
            vault, note, args.draft, args.expected_sha256, args.backup_dir
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (OSError, ValueError, KeyError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
