"""SkillManager — handles installing, updating, and removing skill packs.

A skill is a git repository containing a `skill.json` manifest at the root.

Manifest format (skill.json):
{
  "name": "my-skill",
  "description": "What this skill does",
  "version": "1.0.0",
  "requires_secrets": ["SOME_API_KEY"],
  "requires_packages": [],
  "requires_system_packages": [],
  "entry_point": "main.py"
}

Skills are cloned into SKILLS_DIR (default: /app/skills/installed/).
If a skill has system-level dependencies (requires_system_packages), it is
flagged as requires_rebuild and the user is guided to create a PR/release
so the dependencies are embedded in the next Docker image.
"""

import json
import os
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

SKILLS_DIR = Path(os.getenv("SKILLS_DIR", "/app/skills/installed"))


@dataclass
class SkillManifest:
    name: str
    description: str = ""
    version: str = "0.0.0"
    requires_secrets: list[str] = field(default_factory=list)
    requires_packages: list[str] = field(default_factory=list)
    requires_system_packages: list[str] = field(default_factory=list)
    entry_point: str = "main.py"


def _ensure_skills_dir() -> None:
    SKILLS_DIR.mkdir(parents=True, exist_ok=True)


def parse_manifest(manifest_path: Path) -> SkillManifest:
    """Parse a skill.json manifest file."""
    with open(manifest_path) as f:
        data = json.load(f)
    return SkillManifest(
        name=data["name"],
        description=data.get("description", ""),
        version=data.get("version", "0.0.0"),
        requires_secrets=data.get("requires_secrets", []),
        requires_packages=data.get("requires_packages", []),
        requires_system_packages=data.get("requires_system_packages", []),
        entry_point=data.get("entry_point", "main.py"),
    )


def clone_skill(repo_url: str, version: str = "latest") -> SkillManifest:
    """Clone a skill repo and parse its manifest.

    Returns the parsed manifest. Raises on failure.
    """
    _ensure_skills_dir()

    # Clone into a temp name first to read the manifest
    tmp_dir = SKILLS_DIR / "_tmp_clone"
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)

    args = ["git", "clone", "--depth", "1"]
    if version != "latest":
        args += ["--branch", version]
    args += [repo_url, str(tmp_dir)]

    result = subprocess.run(args, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"git clone failed: {result.stderr[:500]}")

    manifest_path = tmp_dir / "skill.json"
    if not manifest_path.exists():
        shutil.rmtree(tmp_dir)
        raise FileNotFoundError("skill.json not found in repository root")

    manifest = parse_manifest(manifest_path)

    # Move to final location
    skill_dir = SKILLS_DIR / manifest.name
    if skill_dir.exists():
        shutil.rmtree(skill_dir)
    tmp_dir.rename(skill_dir)

    # Install Python packages if any (into the current venv)
    if manifest.requires_packages:
        pip_result = subprocess.run(
            ["pip", "install", "--no-cache-dir"] + manifest.requires_packages,
            capture_output=True,
            text=True,
            timeout=300,
        )
        if pip_result.returncode != 0:
            raise RuntimeError(f"pip install failed: {pip_result.stderr[:500]}")

    return manifest


def remove_skill(name: str) -> None:
    """Remove a skill directory."""
    skill_dir = SKILLS_DIR / name
    if skill_dir.exists():
        shutil.rmtree(skill_dir)


def list_installed_skill_dirs() -> list[str]:
    """Return names of skill directories on disk."""
    _ensure_skills_dir()
    return [d.name for d in SKILLS_DIR.iterdir() if d.is_dir() and not d.name.startswith("_")]
