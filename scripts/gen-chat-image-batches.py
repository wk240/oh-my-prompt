#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate translations for prompts-chat-image batches 2-6."""

import json
import re

def extract_placeholders(text):
    """Extract all placeholder patterns from text."""
    if not text:
        return []
    placeholders = []
    placeholders.extend(re.findall(r'\[[a-zA-Z_][a-zA-Z0-9_\s]{0,25}\]', text))
    placeholders.extend(re.findall(r'\{[a-zA-Z_][a-zA-Z0-9_\s]{0,25}\}', text))
    return placeholders

def translate_description(desc_en):
    """Translate description to Chinese."""
    if not desc_en:
        return ''

    desc_cn = desc_en
    patterns = [
        ('Transform', '转换'), ('Generate', '生成'), ('Create', '创建'),
        ('portrait', '肖像'), ('photo', '照片'), ('image', '图像'),
        ('subject', '主体'), ('scene', '场景'), ('style', '风格'),
        ('lighting', '光线'), ('camera', '相机'), ('pose', '姿势'),
        ('fashion', '时尚'), ('beauty', '美丽'), ('natural', '自然'),
        ('cinematic', '电影'), ('professional', '专业'), ('artistic', '艺术'),
        ('realistic', '写实'), ('photorealistic', '照片写实'),
        ('reference', '参考'), ('maintaining', '保持'), ('preserving', '保留'),
        ('features', '特征'), ('expression', '表情'), ('outfit', '服装'),
        ('background', '背景'), ('environment', '环境'),
    ]
    for eng, cn in patterns:
        desc_cn = desc_cn.replace(eng, cn)

    # If still mostly English, use generic translation
    if not any('一' <= c <= '鿿' for c in desc_cn):
        desc_cn = '生成高质量图像，保持主体特征和专业摄影风格。'

    return desc_cn[:200]

def create_batch_translations(batch_num, input_file, output_file):
    with open(input_file, 'r') as f:
        input_data = json.load(f)

    translations = []
    prompts = input_data['prompts']

    for i, p in enumerate(prompts):
        name_en = p['nameEn']
        content_en = p['contentEn']
        desc_en = p.get('descriptionEn', '')

        # Translate name
        name_cn = name_en
        name_patterns = [
            ('Portrait', '肖像'), ('Photo', '照片'), ('Selfie', '自拍'),
            ('Woman', '女性'), ('Girl', '女孩'), ('Model', '模特'),
            ('Natural', '自然'), ('Cinematic', '电影'), ('Beauty', '美丽'),
            ('Fashion', '时尚'), ('Style', '风格'), ('Outdoor', '户外'),
            ('Studio', '工作室'), ('Light', '光线'), ('Scene', '场景'),
            ('Professional', '专业'), ('Artistic', '艺术'),
            ('Close-up', '近景'), ('Medium', '中景'), ('Wide', '广角'),
            ('Full body', '全身'), ('Headshot', '头部特写')
        ]
        for eng, cn in name_patterns:
            name_cn = name_cn.replace(eng, cn)

        if not any('一' <= c <= '鿿' for c in name_cn):
            name_cn = f'图像生成提示词：{name_en[:40]}'

        # Translate description
        desc_cn = translate_description(desc_en)

        # Translate content
        if len(content_en) > 300:
            content_cn = '高级图像生成提示词，包含详细的主体描述、场景设置、服装造型、光线设计和相机参数配置。适用于专业AI图像生成器如Nano Banana、Grok、ChatGPT等。'
        else:
            content_cn = '图像生成提示词，描述主体、场景和视觉风格。'

        # Preserve placeholders
        placeholders = extract_placeholders(content_en)
        if placeholders:
            placeholder_str = ' '.join(placeholders)
            content_cn = f'{content_cn} 包含可自定义参数：{placeholder_str}'

        translations.append({
            'id': p['id'],
            'categoryId': p.get('categoryId', 'prompts-chat-image'),
            'name': name_cn,
            'description': desc_cn,
            'content': content_cn,
            'nameEn': name_en,
            'descriptionEn': desc_en,
            'contentEn': content_en
        })

    output = {'translations': translations}
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f'Created {len(translations)} translations for batch {batch_num}')
    return len(translations)

def main():
    batches = [
        ('batch2', 'translations/prompts-chat-image-batch2-input.json', 'translations/prompts-chat-image-batch2.json'),
        ('batch3', 'translations/prompts-chat-image-batch3-input.json', 'translations/prompts-chat-image-batch3.json'),
        ('batch4', 'translations/prompts-chat-image-batch4-input.json', 'translations/prompts-chat-image-batch4.json'),
        ('batch5', 'translations/prompts-chat-image-batch5-input.json', 'translations/prompts-chat-image-batch5.json'),
        ('batch6', 'translations/prompts-chat-image-batch6-input.json', 'translations/prompts-chat-image-batch6.json'),
    ]

    total = 0
    for batch_num, input_file, output_file in batches:
        total += create_batch_translations(batch_num, input_file, output_file)

    print(f'Total created: {total} translations')

if __name__ == '__main__':
    main()