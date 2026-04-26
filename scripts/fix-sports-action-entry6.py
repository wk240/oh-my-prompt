#!/usr/bin/env python3
"""
Fix and rewrite sports-action.json with proper alignment and translations.
"""

import json
import re

def translate_template_content(content):
    """Translate template content while preserving placeholders."""
    # This is a complex template/prompt guide
    # We need to translate the instructions and examples while keeping placeholders intact

    # For this entry, the content is mostly a template guide
    # Translate key instructional parts

    # Translate "How to Use" section
    content = content.replace("## How to Use", "## 使用方法")
    content = content.replace("1. Copy entire JSON prompt", "1. 复制完整JSON提示词")
    content = content.replace("2. Paste into AI image generator", "2. 粘贴到AI图像生成器")
    content = content.replace("3. If user uploaded product image, attach it to generator", "3. 如果用户上传了产品图片，将其附加到生成器")
    content = content.replace("4. Generate image", "4. 生成图像")
    content = content.replace("5. Try 3-5 variations for best results", "5. 尝试3-5次变化以获得最佳结果")

    # Translate Tips section
    content = content.replace("**Tips:**", "**提示：**")
    content = content.replace("- Use prompts exactly as provided", "- 按提供的内容精确使用提示词")
    content = content.replace("- These work best in advanced generators", "- 这些在高级生成器中效果最好")
    content = content.replace("- \"preserve_original\": true works best with multiple attempts", "- \"preserve_original\": true 配合多次尝试效果最佳")

    # Translate Source section
    content = content.replace("**Source:**", "**来源：**")

    # Translate PROMPT headers
    content = content.replace("**PROMPT 1:", "**提示词 1：")
    content = content.replace("**PROMPT 2:", "**提示词 2：")

    return content

def create_entry6_translation():
    """Create the translation for entry 6 with proper placeholders."""
    entry6_content = """{
"description": "一位年轻女性坐在瑜伽垫上，用毛巾擦汗，手握水瓶"
}
"mirror_rules": "忽略镜面文字物理规则，正面清晰显示文字，无多余人物"
"mirror_rules": "不适用 - 直接照片"
"background": {
"elements": [
"紫色瑜伽垫铺开",
"附近散落哑铃",
"肩上搭毛巾",
"背景模糊健身器材"
]
}
{
"subject": {
"description": "[一句话动作场景概述]",
"mirror_rules": "[镜面自拍文字处理 或 '不适用 - 直接照片']",
"age": "[大致年龄：20岁前后、20多岁后期、年轻人]",
"expression": "[情绪和视线方向：成就感微笑、调皮咬吸管、放松温柔]",
"hair": {
"color": "[具体颜色细节：金色挑染、栗色棕色]",
"style": "[带真实瑕疵的风格：高马尾略微凌乱有飞发]"
},
"clothing": {
"top": {
"type": "[物品：运动背心、针织吊带、宽松卫衣]",
"color": "[具体颜色：玫瑰粉、灰白色]",
"details": "[面料、版型、特征：中等支撑、短款、宽松毛绒]"
},
"bottom": {
"type": "[物品：高腰瑜伽裤、牛仔裤、慢跑裤]",
"color": "[颜色]",
"details": "[风格细节]"
}
},
"face": {
"preserve_original": true,
"makeup": "[配合活动：健身房淡妆光泽、休闲自然阳光感、清新干净女孩风格]"
}
},
"accessories": {
"headwear": {
"type": "[棒球帽、无 等]",
"details": "[颜色、logo、佩戴方式]"
},
"jewelry": {
"earrings": "[小钻石耳钉、大金环耳环 或 无]",
"necklace": "[细金链带吊坠 或 无]",
"wrist": "[运动手环、金手镯、发圈 或 无]",
"rings": "[多层金戒指、简单指环 或 无]"
},
"device": {
"type": "[智能手机]",
"details": "[手机品牌/型号、手机壳颜色/图案、握持方式]"
},
"prop": {
"type": "[水瓶、冰饮 或 无]",
"details": "[品牌、尺寸、颜色、特定特征如凝结水珠、贴纸]"
}
},
"photography": {
"camera_style": "[智能手机前置摄像头、镜子自拍美学、单反后置相机]",
"angle": "[略高于视线、镜子反射视线高度、低角度]",
"shot_type": "[上半身全身、腰部以上、近景肖像、四分之三身]",
"aspect_ratio": "9:16竖向",
"texture": "[清晰细节明亮光线、室内自然光线暖色调、锐利聚焦柔和皮肤]"
},
"background": {
"setting": "[现代健身房工作室、明亮休闲卧室、车内、城市人行道]",
"wall_color": "[浅灰色、纯白色 或 不适用]",
"elements": [
"[具体可见物品]",
"[散落设备、个人物品]",
"[环境细节]",
"[模糊背景元素]"
],
"atmosphere": "[活力成就感、随意自发、放松日常生活]",
"lighting": "[明亮顶置LED、柔和自然日光、自然窗光]"
}
}
**提示词 1：[描述性标题]**

**提示词 2：[描述性标题]**

---

## 使用方法
1. 复制完整JSON提示词
2. 粘贴到AI图像生成器（Grok、Nano Banana、ChatGPT Image等）
3. 如果用户上传了产品图片，将其附加到生成器
4. 生成图像
5. 尝试3-5次变化以获得最佳结果

**提示：**
- 按提供的内容精确使用提示词
- 这些在高级生成器中效果最好（Grok、ChatGPT、Nano Banana）
- "preserve_original": true 配合多次尝试效果最佳
{
"subject": {
"description": "一位年轻女性坐在瑜伽垫上，用毛巾擦汗，手握水瓶",
"mirror_rules": "不适用 - 直接健身房照片",
"age": "20多岁后期",
"expression": "成就感、略微喘息、自信微笑",
"hair": {
"color": "金色挑染",
"style": "高马尾，略微凌乱有运动飞发"
},
"clothing": {
"top": {
"type": "运动背心",
"color": "玫瑰粉色",
"details": "中等支撑，背部绑带细节，可见运动汗水湿润"
},
"bottom": {
"type": "高腰瑜伽裤",
"color": "黑色配网眼镂空",
"details": "及踝长度，小腿网眼镂空，压缩贴合"
}
},
"face": {
"preserve_original": true,
"makeup": "淡妆，运动光泽，自然泛红脸颊，无眼妆"
}
},
"accessories": {
"headwear": {
"type": "无",
"details": "头发用发圈束起"
},
"jewelry": {
"earrings": "小钻石耳钉",
"necklace": "无",
"wrist": "玫瑰金运动手环，腕部黑色发圈",
"rings": "无"
},
"device": {
"type": "智能手机",
"details": "倚靠哑铃，录制健身自拍"
},
"prop": {
"type": "保温水瓶",
"details": "哑光黑色32oz瓶身带励志标语贴纸，可见凝结水珠"
}
},
"photography": {
"camera_style": "健身房自拍美学，智能手机前置相机",
"angle": "略高于视线，坐姿",
"shot_type": "上半身和交叉腿，居中构图",
"aspect_ratio": "9:16竖向",
"texture": "清晰细节，明亮健身房光线，活力感"
},
"background": {
"setting": "现代健身房工作室",
"wall_color": "浅灰色配励志壁画",
"elements": [
"紫色瑜伽垫铺开",
"附近散落哑铃",
"肩上搭白色毛巾",
"背景模糊健身器材",
"大镜子反射后墙",
"地板弹力带卷起"
],
"atmosphere": "活力、成就感、健康导向",
"lighting": "明亮顶置LED健身房照明，均匀覆盖"
}
}
{
"subject": {
"description": "一位年轻女性镜子自拍，调皮地咬着冰绿茶饮料吸管",
"mirror_rules": "忽略镜面文字物理规则，正面清晰显示文字，无多余人物",
"age": "年轻人",
"expression": "调皮、皱鼻、咬吸管",
"hair": {
"color": "棕色",
"style": "长发垂肩"
},
"clothing": {
"top": {
"type": "针织吊带上衣",
"color": "白色",
"details": "短款，细带，领口小蝴蝶结"
},
"bottom": {
"type": "牛仔裤",
"color": "浅蓝色",
"details": "宽松版型，可见纽扣门襟"
}
},
"face": {
"preserve_original": true,
"makeup": "自然阳光感，光泽皮肤，裸色唇釉"
}
},
"accessories": {
"headwear": {
"type": "橄榄绿棒球帽",
"details": "白色NY logo刺绣，帽上戴银色头戴耳机"
},
"jewelry": {
"earrings": "大金环耳环",
"necklace": "细金链带十字吊坠",
"wrist": "金手镯和手链混搭",
"rings": "多层金戒指"
},
"device": {
"type": "智能手机",
"details": "白色手机壳配粉色花卉图案"
},
"prop": {
"type": "冰饮",
"details": "塑料杯冰抹茶拿铁配绿色吸管"
}
},
"photography": {
"camera_style": "智能手机镜子自拍美学",
"angle": "镜子反射视线高度",
"shot_type": "腰部以上构图，主体位于画面右侧",
"aspect_ratio": "9:16竖向",
"texture": "锐利聚焦，室内自然光线，社交媒体真实感，清晰细节"
},
"background": {
"setting": "明亮休闲卧室",
"wall_color": "纯白色",
"elements": [
"白色纹理羽绒被床铺",
"床上黑色编织肩包",
"豹纹抱枕",
"复古白色床头柜",
"现代白色灯罩床头灯"
],
"atmosphere": "休闲生活方式、舒适、随意",
"lighting": "柔和自然日光"
}
}
{
"subject": {
"description": "一位年轻女性车内自拍，手轻搭额头，温柔微笑",
"mirror_rules": "不适用 - 直接照片",
"age": "年轻人",
"expression": "放松、随拍、轻微微笑，手随意触碰额头",
"hair": {
"color": "深棕色",
"style": "光滑紧低丸子头配精准中分"
},
"clothing": {
"top": {
"type": "宽松卫衣",
"color": "浅灰白色",
"details": "柔软毛绒面料，宽松版型，帽子后垂"
}
},
"face": {
"preserve_original": true,
"makeup": "清新自然干净女孩风格，阳光感皮肤鼻梁可见雀斑，玫瑰腮红，光泽粉唇，精致眉形"
}
},
"accessories": {
"eyewear": {
"type": "玳瑁色眼镜",
"details": "椭圆形圆形醋酸镜框，知性时尚感"
},
"jewelry": {
"earrings": "金耳饰组合 - 多个小金环耳钉和耳骨钉",
"necklace": "精致金链带小吊坠",
"rings": "无名指细金环"
}
},
"photography": {
"camera_style": "现代智能手机自拍",
"angle": "视线高度至略微低角度",
"shot_type": "近景肖像构图",
"aspect_ratio": "9:16竖向",
"texture": "自然日光，面部锐利聚焦，柔和皮肤质感，明亮窗光，无颗粒"
},
"background": {
"setting": "车内",
"wall_color": "不适用",
"elements": [
"深色车顶 / 全景天窗",
"座椅头枕",
"安全带",
"车窗显示明亮日光",
"窗外模糊树木建筑"
],
"atmosphere": "日常随拍、出行中、明亮日间氛围",
"lighting": "柔和自然窗光照亮面部"
}
}

**来源：** [God of Prompt](https://x.com/godofprompt/status/1994753701227991490)

---"""

    return {
        "id": "resource-sports-action-6",
        "categoryId": "sports-action",
        "name": "健身房运动后快乐女性自拍 | 健身与健康",
        "description": "",
        "content": entry6_content,
        "nameEn": "Happy Woman Post-Workout Selfie in Gym | Fitness & Health",
        "descriptionEn": "",
        "contentEn": ""  # Will be filled from input
    }

def main():
    # Read input file
    with open('translations/sports-action-input.json', 'r') as f:
        input_data = json.load(f)

    # Read current translation file
    with open('translations/sports-action.json', 'r') as f:
        current_data = json.load(f)

    # Get entry 6 from input for contentEn
    entry6_input = input_data['prompts'][6]

    # Create corrected entry 6
    entry6_trans = create_entry6_translation()
    entry6_trans['contentEn'] = entry6_input['contentEn']

    # Replace entry 6 in current data
    current_data['translations'][6] = entry6_trans

    # Write fixed file
    with open('translations/sports-action.json', 'w') as f:
        json.dump(current_data, f, indent=2, ensure_ascii=False)

    print("Fixed entry 6 alignment")

if __name__ == '__main__':
    main()