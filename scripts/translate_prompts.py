#!/usr/bin/env python3
"""
翻译脚本 - 将英文提示词翻译为中文
"""
import json
import sys
import time
import traceback
from deep_translator import GoogleTranslator

# 初始化翻译器
translator = GoogleTranslator(source='en', target='zh-CN')

def translate_text(text, max_retries=3):
    """翻译文本，带重试机制"""
    if not text or not isinstance(text, str):
        return text

    # 如果是JSON字符串，尝试解析并翻译
    if text.strip().startswith('{'):
        try:
            obj = json.loads(text)
            translated_obj = translate_object(obj)
            return json.dumps(translated_obj, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"  JSON解析错误: {e}", file=sys.stderr)

    # 如果文本太长，分段翻译
    max_len = 4000
    if len(text) > max_len:
        paragraphs = text.split('\n')
        result = []
        current = ""
        for para in paragraphs:
            if len(current) + len(para) + 1 > max_len:
                if current:
                    try:
                        result.append(translator.translate(current))
                    except Exception as e:
                        print(f"  翻译错误: {e}", file=sys.stderr)
                        result.append(current)
                    time.sleep(0.3)
                current = para
            else:
                current = current + "\n" + para if current else para
        if current:
            try:
                result.append(translator.translate(current))
            except:
                result.append(current)
        return '\n'.join(result)

    for attempt in range(max_retries):
        try:
            return translator.translate(text)
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(1)
            else:
                print(f"  翻译失败: {e}", file=sys.stderr)
                return text
    return text

def translate_object(obj):
    """递归翻译对象中的字符串值"""
    if isinstance(obj, str):
        return translate_text(obj)
    elif isinstance(obj, list):
        return [translate_object(item) for item in obj]
    elif isinstance(obj, dict):
        result = {}
        for key, value in obj.items():
            result[key] = translate_object(value)
        return result
    return obj

def main():
    input_file = 'src/data/resource-library/categories/prompts-chat-image.json'
    output_file = 'src/data/resource-library/categories/prompts-chat-image.json'

    print("读取文件...")
    sys.stdout.flush()

    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    prompts = data['prompts']
    total = len(prompts)
    print(f"共 {total} 个提示词需要翻译")
    sys.stdout.flush()

    for i, prompt in enumerate(prompts):
        name = prompt.get('nameEn', '')[:60]
        print(f"[{i+1}/{total}] 翻译: {name}...", end=" ", flush=True)

        try:
            # 翻译 nameEn -> name
            if 'nameEn' in prompt and prompt['nameEn']:
                prompt['name'] = translate_text(prompt['nameEn'])
                time.sleep(0.2)

            # 翻译 descriptionEn -> description
            if 'descriptionEn' in prompt and prompt['descriptionEn']:
                prompt['description'] = translate_text(prompt['descriptionEn'])
                time.sleep(0.2)

            # 翻译 contentEn -> content
            if 'contentEn' in prompt and prompt['contentEn']:
                prompt['content'] = translate_text(prompt['contentEn'])
                time.sleep(0.3)

            print("完成")
            sys.stdout.flush()

        except Exception as e:
            print(f"错误: {e}")
            traceback.print_exc()

        # 每处理20个保存一次进度
        if (i + 1) % 20 == 0:
            print(f"  保存进度 ({i+1}/{total})...")
            sys.stdout.flush()
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

    # 保存最终结果
    print("保存最终结果...")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("完成!")

if __name__ == '__main__':
    main()
