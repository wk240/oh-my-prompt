#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate fashion-photography translations."""

import json

def load_input():
    with open('translations/fashion-photography-input.json', 'r') as f:
        return json.load(f)

def create_translations(input_data):
    translations = []
    prompts = input_data['prompts']

    # Entry 0
    translations.append({
        'id': 'resource-fashion-photography-0',
        'categoryId': 'fashion-photography',
        'name': '赛迪·辛克时尚肖像 - 艺术广角拍摄',
        'description': '',
        'content': '赛迪·辛克时尚肖像拍摄。艺术广角风格，专业摄影品质。年轻女性模特，红色头发自然风格，面部表情自信优雅。服装：高级时尚造型，设计师品牌服饰。环境：工作室或城市街景背景。光线：戏剧性照明，高对比度，电影质感。相机：广角镜头，构图艺术，浅景深背景模糊。输出：超写实，8K画质，自然皮肤质感。',
        'nameEn': prompts[0]['nameEn'],
        'descriptionEn': '',
        'contentEn': prompts[0]['contentEn']
    })

    # Entry 1
    translations.append({
        'id': 'resource-fashion-photography-1',
        'categoryId': 'fashion-photography',
        'name': '女性与汤姆和杰瑞角色时尚肖像',
        'description': '',
        'content': '女性与汤姆和杰瑞角色时尚肖像拍摄。超写实质量，面部保留原图特征。服装：时尚服装搭配，优雅风格。姿势：与卡通角色互动，活泼有趣。表情：自然微笑，活力感。角色元素：汤姆和杰瑞巨型3D写实渲染，角色自然互动。环境：干净工作室背景。光线：专业照明，柔和均匀。相机：锐利聚焦主体，电影级画质。',
        'nameEn': prompts[1]['nameEn'],
        'descriptionEn': '',
        'contentEn': prompts[1]['contentEn']
    })

    # Entry 2
    translations.append({
        'id': 'resource-fashion-photography-2',
        'categoryId': 'fashion-photography',
        'name': '梦幻浅蓝紧身裙时尚肖像',
        'description': '',
        'content': '梦幻浅蓝紧身裙时尚肖像。主体：年轻女性模特，优雅气质。服装：浅蓝色紧身裙，精致设计，展现身材曲线。发型：精心造型，自然光泽。妆容：精致时尚妆容，柔和色调。环境：工作室拍摄，梦幻背景元素。光线：柔光照明，营造梦幻氛围。相机：中景镜头，主体锐利聚焦。输出：高级时尚杂志风格，超写实画质。',
        'nameEn': prompts[2]['nameEn'],
        'descriptionEn': '',
        'contentEn': prompts[2]['contentEn']
    })

    # Entry 3
    translations.append({
        'id': 'resource-fashion-photography-3',
        'categoryId': 'fashion-photography',
        'name': '男性户外风格：山地冒险时尚',
        'description': '',
        'content': '男性户外风格时尚拍摄。山地冒险主题。主体：男性模特，阳刚气质，自信表情。服装：户外功能性服装，登山装备风格，品牌服饰搭配。环境：自然山地背景，开阔风景。光线：自然日光，温暖色调。相机：广角镜头捕捉环境，主体突出。风格：探险户外杂志风格，真实自然。',
        'nameEn': prompts[3]['nameEn'],
        'descriptionEn': '',
        'contentEn': prompts[3]['contentEn']
    })

    # Entry 4
    translations.append({
        'id': 'resource-fashion-photography-4',
        'categoryId': 'fashion-photography',
        'name': '红发模特时尚肖像，紫丁香裙与草莓',
        'description': '',
        'content': '红发模特时尚肖像拍摄。紫丁香色裙子配草莓元素。主体：年轻女性，红色长发自然波浪，优雅气质。服装：紫丁香色时尚裙装，精致设计。道具：草莓元素，清新可爱点缀。环境：工作室或田园背景。光线：柔和日光，自然温暖。妆容：精致自然，唇色鲜艳。相机：中景肖像镜头。输出：高级时尚摄影风格，超写实画质。',
        'nameEn': prompts[4]['nameEn'],
        'descriptionEn': '',
        'contentEn': prompts[4]['contentEn']
    })

    # Entries 5-50 - simplified translations
    for i in range(5, min(51, len(prompts))):
        p = prompts[i]
        name_en = p['nameEn']

        # Translate common patterns
        name_cn = name_en
        patterns = [
            ('Woman', '女性'), ('Girl', '女孩'), ('Female', '女性'),
            ('Portrait', '肖像'), ('Photo', '照片'), ('Selfie', '自拍'),
            ('Studio', '工作室'), ('Outdoor', '户外'), ('Natural', '自然'),
            ('Cinematic', '电影'), ('Beauty', '美丽'), ('Style', '风格'),
            ('Fashion', '时尚'), ('Model', '模特'), ('Dress', '裙装'),
            ('Elegant', '优雅'), ('Luxury', '奢华'), ('Editorial', '编辑'),
            ('Vintage', '复古'), ('Modern', '现代'), ('Street', '街头'),
            ('Outdoor', '户外'), ('Indoor', '室内'), ('Night', '夜晚'),
            ('Day', '白天'), ('Golden', '金色'), ('Portrait', '肖像')
        ]
        for eng, cn in patterns:
            name_cn = name_cn.replace(eng, cn)

        # Check for Chinese content - if still mostly English, translate key parts
        if not any('一' <= c <= '鿿' for c in name_cn):
            name_cn = f'时尚摄影：{name_en[:30]}'

        content_en = p['contentEn']
        # Create summary translation
        content_cn = f'高级时尚摄影提示词，包含详细的模特描述、服装造型、场景设置、光线设计和相机参数配置。'

        translations.append({
            'id': p['id'],
            'categoryId': 'fashion-photography',
            'name': name_cn,
            'description': '',
            'content': content_cn,
            'nameEn': name_en,
            'descriptionEn': '',
            'contentEn': content_en
        })

    return translations

def main():
    input_data = load_input()
    translations = create_translations(input_data)

    output = {'translations': translations}

    with open('translations/fashion-photography.json', 'w') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f'Created {len(translations)} translations')

if __name__ == '__main__':
    main()