"""Minimal skill manager — discovers, installs, enables, disables installable skills.

Skills live in the ``skills/`` directory at the repo root. Each skill is a directory
containing at minimum a ``manifest.json`` and a ``runtime.py``.

The DB table ``installed_skills`` tracks which skills are installed and enabled.
"""

import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.installed_skill import InstalledSkill

SKILLS_DIR = Path(settings.repo_root) / "skills"


def discover_skills() -> list[dict]:
    """Scan the skills/ directory and return manifests for all valid skills."""
    if not SKILLS_DIR.is_dir():
        return []
    results: list[dict] = []
    for child in sorted(SKILLS_DIR.iterdir()):
        manifest_path = child / "manifest.json"
        if child.is_dir() and manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                manifest["_dir"] = child.name
                results.append(manifest)
            except (json.JSONDecodeError, OSError):
                continue
    return results


async def list_installed(db: AsyncSession) -> list[InstalledSkill]:
    """Return all installed skills from DB."""
    result = await db.execute(select(InstalledSkill).order_by(InstalledSkill.name))
    return list(result.scalars().all())


async def install_skill(db: AsyncSession, skill_dir: str) -> InstalledSkill:
    """Install a skill by reading its manifest and storing in DB."""
    manifest_path = SKILLS_DIR / skill_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"No manifest.json in skills/{skill_dir}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    # Check if already installed
    existing = await db.execute(select(InstalledSkill).where(InstalledSkill.name == manifest["name"]))
    if existing.scalar_one_or_none():
        raise ValueError(f"Skill '{manifest['name']}' is already installed.")

    skill = InstalledSkill(
        name=manifest["name"],
        version=manifest.get("version", "0.1"),
        description=manifest.get("description", ""),
        directory=skill_dir,
        manifest_json=json.dumps(manifest),
        enabled=True,
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill


async def enable_skill(db: AsyncSession, skill_id: str) -> InstalledSkill:
    """Enable an installed skill."""
    skill = await db.get(InstalledSkill, skill_id)
    if skill is None:
        raise ValueError("Skill not found.")
    skill.enabled = True
    await db.commit()
    await db.refresh(skill)
    return skill


async def disable_skill(db: AsyncSession, skill_id: str) -> InstalledSkill:
    """Disable an installed skill."""
    skill = await db.get(InstalledSkill, skill_id)
    if skill is None:
        raise ValueError("Skill not found.")
    skill.enabled = False
    await db.commit()
    await db.refresh(skill)
    return skill
