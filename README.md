# WordDrop

Speech note: the standalone speech server uses `WORDDROP_PORT` and defaults to `3030`; it does not reuse the parent LexiLand `PORT=3000`.
Realtime note: open `http://localhost:3030/index.html` or `http://localhost:3030/speech-test.html` after `npm run server` so microphone permissions and realtime transcription stay stable.
Latency note: you can tune realtime end-of-sentence speed with `OPENAI_REALTIME_VAD_THRESHOLD`, `OPENAI_REALTIME_VAD_PREFIX_MS`, and `OPENAI_REALTIME_VAD_SILENCE_MS`.

独立词汇小游戏原型仓库。

这是按 `TMP/20260424request.txt` 先落的最小原型，目前只实现第 1 个玩法：

- 单词从上往下掉
- 底部 3 个图片篮子
- 点击正确图片得分
- 命中后朗读单词
- 展示基础反馈、词性、命中率和能量

## 运行

直接双击打开 [index.html](./index.html) 即可。

如果要单独排查浏览器语音输入是否正常，打开 [speech-test.html](./speech-test.html)。

如果要使用 OpenAI 语音输入，先在当前目录安装依赖并启动 `WordDrop` 自带语音服务：

```powershell
npm install
npm run server
```

语音输入会调用本地 `http://localhost:3030/api/transcribe`。

## 导入词包

1. 进入游戏后点击 `导入 JSON`
2. 选择一个符合 `WordDrop` 结构的词包
3. 导入后点 `开始 / 重新开始`

支持的最小字段：

```json
{
  "name": "My Pack",
  "words": [
    {
      "word": "apple",
      "baseForm": "apple",
      "zh": "苹果",
      "pos": "noun",
      "definition": "a kind of fruit",
      "example": "I eat an apple every day.",
      "context": "She polished the apple before dinner.",
      "image": "./data/images/apple.jpg",
      "wordForms": ["apples"]
    }
  ]
}
```

## 当前故意没做

- 接入真实 word card / 数据库
- 音效、震动、长期统计
- 真正的语义级造句判定
- 句子全文中文翻译生成

## 独立化方向

后续目标是不依赖 LexiLand 主应用运行，只需要导入“今日标注生词”就能直接玩。

建议的数据流：

1. LexiLand 导出 `today-words.json`
2. WordDrop 读取 JSON
3. WordDrop 根据词、图片、词性、例句生成当日关卡

## 下一步建议

1. 把 `WORD_BANK` 换成现有词卡数据源。
2. 给每个词加 `context` 和 `audio` 字段。
3. 新增 JSON 导入入口，直接吃 LexiLand 的“今日生词”导出。
4. 再拆出第 2 模式和第 3 模式。

## 生成 2026 年 4 月测试词包

仓库里提供了一个打包脚本，会从 LexiLand 固定备份目录读取 2026 年 4 月且带图片的单词，并生成可直接导入 WordDrop 的 JSON：

```powershell
node .\scripts\generate-lexiland-pack.js
```

输出位置：

- `data/lexiland-april-2026-image-words.json`
- `data/lexiland-april-2026-images/`
