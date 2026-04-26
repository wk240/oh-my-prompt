#!/usr/bin/env python3
"""
Preprocess prompts.json for translation:
1. Move existing English description to descriptionEn
2. Create backup
"""

import json
from pathlib import Path

INPUT_FILE = Path('src/data/resource-library/prompts.json')
BACKUP_FILE = Path('src/data/resource-library/prompts-backup.json')

def has_chinese(text: str) -> bool:
    """Check if text contains Chinese characters."""
    if not text:
        return False
    for char in text:
        if '一' <= char <= '鿿':
            return True
    return False

def preprocess():
    # Load data
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Create backup
    with open(BACKUP_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'[Preprocess] Backup created: {BACKUP_FILE}')

    # Process prompts
    prompts = data.get('prompts', [])
    moved_count = 0

    for prompt in prompts:
        desc = prompt.get('description')
        if desc and not has_chinese(desc):
            # Move English description to descriptionEn
            prompt['descriptionEn'] = desc
            prompt['description'] = ''
            moved_count += 1

    # Save processed data
    with open(INPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f'[Preprocess] Moved {moved_count} descriptions to descriptionEn')
    print(f'[Preprocess] Preprocessed file saved: {INPUT_FILE}')

if __name__ == '__main__':
    preprocess()