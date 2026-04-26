#!/usr/bin/env python3
"""
Resource Library Translation Script
Translates English prompts to Chinese while preserving:
- JSON structure in content
- Placeholder variables like {Brand Name}, [CITY]
- Original English in nameEn/contentEn fields

Usage: python3 scripts/translate-prompts.py [--category CATEGORY] [--batch-size N]
"""

import json
import re
import argparse
from pathlib import Path

# Configuration
INPUT_FILE = Path('src/data/resource-library/prompts.json')
BACKUP_FILE = Path('src/data/resource-library/prompts-backup.json')
OUTPUT_FILE = Path('src/data/resource-library/prompts.json')

# Placeholder patterns to preserve (do not translate)
PLACEHOLDER_PATTERNS = [
    r'\{[^}]+\}',       # {Brand Name}, {variable}
    r'\[[^\]]+\]',      # [CITY], [placeholder]
    r'<[^>]+>',         # <placeholder>
]

def has_chinese(text: str) -> bool:
    """Check if text contains Chinese characters."""
    for char in text:
        if '一' <= char <= '鿿':
            return True
    return False

def protect_placeholders(text: str) -> tuple[str, dict]:
    """Replace placeholders with tokens, return mapping for restoration."""
    mapping = {}
    protected = text
    for i, pattern in enumerate(PLACEHOLDER_PATTERNS):
        matches = re.findall(pattern, text)
        for j, match in enumerate(matches):
            token = f"__PLACEHOLDER_{i}_{j}__"
            mapping[token] = match
            protected = protected.replace(match, token, 1)
    return protected, mapping

def restore_placeholders(text: str, mapping: dict) -> str:
    """Restore placeholders from tokens."""
    for token, original in mapping.items():
        text = text.replace(token, original)
    return text

def needs_translation(prompt: dict) -> bool:
    """Check if prompt needs Chinese translation."""
    content = prompt.get('content', '')
    name = prompt.get('name', '')
    # Needs translation if content is English (no Chinese characters)
    return not has_chinese(content) and not has_chinese(name)

def translate_prompt(prompt: dict, chinese_name: str, chinese_content: str) -> dict:
    """Add Chinese translation to prompt."""
    return {
        **prompt,
        'name': chinese_name,
        'content': chinese_content,
        'nameEn': prompt.get('name', ''),
        'contentEn': prompt.get('content', ''),
    }

def load_data() -> dict:
    """Load prompts JSON data."""
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_data(data: dict, path: Path):
    """Save prompts JSON data."""
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def create_backup():
    """Create backup before translation."""
    data = load_data()
    save_data(data, BACKUP_FILE)
    print(f'[Translation] Backup created: {BACKUP_FILE}')

def get_prompts_needing_translation(data: dict) -> list[dict]:
    """Get all prompts that need Chinese translation."""
    prompts = data.get('prompts', [])
    return [p for p in prompts if needs_translation(p)]

def group_by_category(prompts: list[dict]) -> dict[str, list[dict]]:
    """Group prompts by category."""
    groups = {}
    for p in prompts:
        cat = p.get('categoryId', 'unknown')
        if cat not in groups:
            groups[cat] = []
        groups[cat].append(p)
    return groups

def main():
    parser = argparse.ArgumentParser(description='Translate resource library prompts')
    parser.add_argument('--category', help='Only translate specific category')
    parser.add_argument('--batch-size', type=int, default=50, help='Process N prompts at a time')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be translated')
    args = parser.parse_args()

    # Create backup
    if not args.dry_run:
        create_backup()

    # Load data
    data = load_data()
    prompts = data.get('prompts', [])

    # Find prompts needing translation
    to_translate = get_prompts_needing_translation(data)

    if args.category:
        to_translate = [p for p in to_translate if p.get('categoryId') == args.category]

    # Group by category
    groups = group_by_category(to_translate)

    print(f'[Translation] Total prompts needing translation: {len(to_translate)}')
    print(f'[Translation] Categories: {list(groups.keys())}')

    if args.dry_run:
        for cat, items in sorted(groups.items(), key=lambda x: -len(x[1])):
            print(f'  {cat}: {len(items)} prompts')
            for p in items[:2]:
                print(f'    - {p.get("name", "N/A")[:60]}...')
        return

    # TODO: Add actual translation logic (manual or API-based)
    print('[Translation] Ready for translation. Use --dry-run to preview.')

if __name__ == '__main__':
    main()