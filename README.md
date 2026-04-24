# WordDrop

独立词汇小游戏原型仓库。

这是按 `TMP/20260424request.txt` 先落的最小原型，目前只实现第 1 个玩法：

- 单词从上往下掉
- 底部 3 个图片篮子
- 点击正确图片得分
- 命中后朗读单词
- 展示基础反馈、词性、命中率和能量

## 运行

直接双击打开 [index.html](./index.html) 即可。

## 当前故意没做

- 语音识别
- 句子匹配
- 造句判断
- 接入真实 word card / 数据库
- 音效、震动、长期统计

## 独立化方向

后续目标是不依赖 LexiLand 主应用运行，只需要导入“今日标注生词”就能直接玩。

建议的数据流：

1. LexiLand 导出 `today-words.json`
2. WordDrop 读取 JSON
3. WordDrop 根据词、图片、词性、例句生成当日关卡

建议的最小字段：

```json
[
  {
    "word": "apple",
    "pos": "noun",
    "zh": "苹果",
    "image": "https://... or local-path",
    "context": "I eat an apple every day."
  }
]
```

## 下一步建议

1. 把 `WORD_BANK` 换成现有词卡数据源。
2. 给每个词加 `context` 和 `audio` 字段。
3. 新增 JSON 导入入口，直接吃 LexiLand 的“今日生词”导出。
4. 再拆出第 2 模式和第 3 模式。
