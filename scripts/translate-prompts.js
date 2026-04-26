// 翻译脚本 - 将英文提示词翻译为中文
const fs = require('fs');

// 简单的翻译函数 - 实际项目中应使用专业翻译API
// 这里我们使用占位符，实际使用时替换为真正的翻译调用
function translateToChinese(text) {
  if (!text || typeof text !== 'string') return text;

  // 对于JSON对象，需要翻译所有字符串值但保留键
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text);
      const translated = translateObject(obj);
      return JSON.stringify(translated, null, 2);
    } catch (e) {
      return text;
    }
  }

  // 对于普通文本，返回原文（实际翻译时替换为API调用）
  return text;
}

// 递归翻译对象中的所有字符串值
function translateObject(obj) {
  if (typeof obj === 'string') {
    return obj; // 翻译时替换为 translateApi(obj)
  }

  if (Array.isArray(obj)) {
    return obj.map(item => translateObject(item));
  }

  if (obj && typeof obj === 'object') {
    const result = {};
    for (const key in obj) {
      result[key] = translateObject(obj[key]);
    }
    return result;
  }

  return obj;
}

// 主处理函数
function processFile() {
  const filePath = 'src/data/resource-library/categories/prompts-chat-image.json';
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  console.log(`开始处理 ${data.prompts.length} 个提示词...`);

  // 先检查现有结构
  const sample = data.prompts[0];
  console.log('字段检查:');
  console.log('- nameEn 存在:', !!sample.nameEn);
  console.log('- contentEn 存在:', !!sample.contentEn);
  console.log('- descriptionEn 存在:', !!sample.descriptionEn);
  console.log('- name 存在:', !!sample.name);
  console.log('- content 存在:', !!sample.content);
  console.log('- description 存在:', !!sample.description);

  // 分析需要翻译的内容
  let totalContentSize = 0;
  data.prompts.forEach((p, i) => {
    if (p.contentEn) {
      totalContentSize += p.contentEn.length;
    }
  });
  console.log(`\n总contentEn大小: ${(totalContentSize / 1024).toFixed(1)} KB`);

  console.log('\n脚本就绪。实际翻译需要调用翻译API。');
}

processFile();
