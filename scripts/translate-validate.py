#!/usr/bin/env python3
"""
Validate translation results:
1. Placeholder preservation check
2. JSON structure check
3. Missing translation check
"""

import json
import re
from pathlib import Path

# Placeholder patterns - only match variable placeholders, not JSON objects
# Limit to short placeholders (max 30 chars) to avoid matching JSON structures
PLACEHOLDER_PATTERNS = [
    r'\{[a-zA-Z_][a-zA-Z0-9_\s]{0,25}\}',    # {Brand Name}, {variable} - short placeholders
    r'\[[a-zA-Z_][a-zA-Z0-9_\s]{0,25}\]',    # [CITY], [placeholder] - short placeholders
    r'<[a-zA-Z_][a-zA-Z0-9_\s]{0,25}>',      # <placeholder> - short placeholders
]

def is_json_content(text: str) -> bool:
    """Check if content is a JSON structure (starts with { or [)."""
    if not text:
        return False
    text = text.strip()
    return text.startswith('{') or text.startswith('[')

def extract_placeholders(text: str) -> list[str]:
    """Extract placeholder variables from text, ignoring JSON structures."""
    if not text:
        return []
    # Skip placeholder extraction for JSON content
    if is_json_content(text):
        return []
    placeholders = []
    for pattern in PLACEHOLDER_PATTERNS:
        placeholders.extend(re.findall(pattern, text))
    return placeholders

def has_chinese(text: str) -> bool:
    """Check if text contains Chinese characters."""
    if not text:
        return False
    for char in text:
        if '一' <= char <= '鿿':
            return True
    return False

def validate_translation(original: dict, translated: dict) -> dict:
    """Validate a single translation. Returns issues list."""
    issues = []

    # 1. Placeholder check
    orig_content = original.get('contentEn', '')
    trans_content = translated.get('content', '')
    orig_placeholders = extract_placeholders(orig_content)
    trans_placeholders = extract_placeholders(trans_content)

    if set(orig_placeholders) != set(trans_placeholders):
        missing = set(orig_placeholders) - set(trans_placeholders)
        extra = set(trans_placeholders) - set(orig_placeholders)
        if missing:
            issues.append(f"Missing placeholders: {missing}")
        if extra:
            issues.append(f"Extra placeholders: {extra}")

    # 2. Required fields check
    required_fields = ['id', 'name', 'content', 'nameEn', 'contentEn']
    for field in required_fields:
        if field not in translated or not translated.get(field):
            issues.append(f"Missing field: {field}")

    # 3. ID consistency check
    if original.get('id') != translated.get('id'):
        issues.append(f"ID mismatch: {original.get('id')} vs {translated.get('id')}")

    # 4. Chinese content check (no missing translation)
    if not has_chinese(translated.get('name', '')):
        issues.append("name not translated to Chinese")
    if not has_chinese(translated.get('content', '')):
        issues.append("content not translated to Chinese")

    # Check description if original had it
    if original.get('descriptionEn'):
        if not has_chinese(translated.get('description', '')):
            issues.append("description not translated to Chinese")

    return {
        'id': translated.get('id'),
        'valid': len(issues) == 0,
        'issues': issues
    }

def validate_file(input_file: Path, translation_file: Path) -> dict:
    """Validate entire translation file."""
    with open(input_file, 'r', encoding='utf-8') as f:
        orig_data = json.load(f)
    with open(translation_file, 'r', encoding='utf-8') as f:
        trans_data = json.load(f)

    original_prompts = orig_data.get('prompts', [])
    translated_prompts = trans_data.get('translations', [])

    # Count check
    if len(original_prompts) != len(translated_prompts):
        return {
            'valid': False,
            'error': f"Count mismatch: {len(original_prompts)} original vs {len(translated_prompts)} translated"
        }

    # Validate each prompt
    results = []
    for orig, trans in zip(original_prompts, translated_prompts):
        results.append(validate_translation(orig, trans))

    valid_count = sum(1 for r in results if r['valid'])
    invalid_count = len(results) - valid_count

    return {
        'valid': invalid_count == 0,
        'total': len(results),
        'valid_count': valid_count,
        'invalid_count': invalid_count,
        'issues': [r for r in results if not r['valid']]
    }

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Validate translation')
    parser.add_argument('--input', required=True, help='Original prompts JSON')
    parser.add_argument('--translation', required=True, help='Translation result JSON')
    args = parser.parse_args()

    result = validate_file(Path(args.input), Path(args.translation))

    if result['valid']:
        print(f"[Validate] ✓ All {result['total']} translations valid")
    else:
        print(f"[Validate] ✗ {result['invalid_count']} invalid translations")
        for issue in result.get('issues', [])[:5]:
            print(f"  - {issue['id']}: {issue['issues']}")

    return 0 if result['valid'] else 1

if __name__ == '__main__':
    exit(main())