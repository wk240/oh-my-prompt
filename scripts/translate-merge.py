#!/usr/bin/env python3
"""
Merge translation results back into prompts.json
"""

import json
from pathlib import Path

MAIN_FILE = Path('src/data/resource-library/prompts.json')
TRANSLATIONS_DIR = Path('translations')

def merge_translations():
    # Load main data
    with open(MAIN_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    prompts = data.get('prompts', [])
    prompt_map = {p['id']: p for p in prompts}

    # Find all translation files
    if not TRANSLATIONS_DIR.exists():
        print(f'[Merge] No translations directory found')
        return

    merged_count = 0
    for trans_file in TRANSLATIONS_DIR.glob('*.json'):
        if trans_file.name == 'failed.json':
            continue

        with open(trans_file, 'r', encoding='utf-8') as f:
            trans_data = json.load(f)

        translations = trans_data.get('translations', [])
        for trans in translations:
            prompt_id = trans.get('id')
            if prompt_id in prompt_map:
                # Update the prompt with translation
                prompt_map[prompt_id]['name'] = trans.get('name')
                prompt_map[prompt_id]['content'] = trans.get('content')
                if trans.get('description'):
                    prompt_map[prompt_id]['description'] = trans.get('description')
                merged_count += 1

        print(f'[Merge] Merged {len(translations)} from {trans_file.name}')

    # Save merged data
    with open(MAIN_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f'[Merge] Total merged: {merged_count} prompts')
    print(f'[Merge] Saved to {MAIN_FILE}')

if __name__ == '__main__':
    merge_translations()