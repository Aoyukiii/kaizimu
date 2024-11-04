# koishi-plugin-kaizimu

[![npm](https://img.shields.io/npm/v/koishi-plugin-kaizimu?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-kaizimu)

支持自定义词库的开字母游戏。

## 配置方法

目前支持两种 JSON 格式。

**有别名**：

```json
[
  {
    "name": "Sayonara Hatsukoi",
    "aliases": ["再见初恋"]
  },
  {
    "name": "Fairytale",
    "aliases": []
  },
  {
    "name": "Vexaria",
    "aliases": []
  },
  {
    "name": "Rise",
    "aliases": []
  },
  {
    "name": "Lucifer",
    "aliases": ["路西法"]
  },
  {
    "name": "GOODTEK (Arcaea Edit)",
    "aliases": ["好锤子", "锤子"]
  }
  // ...
]
```

或者**无别名**：

```json
[
  "Sayonara Hatsukoi",
  "Fairytale",
  "Vexaria",
  "Rise",
  "Lucifer",
  "GOODTEK (Arcaea Edit)"
  // ...
]
```

可以在插件配置中添加路径并加上词库别名（使用指令时要用到），然后重载配置即可。

## 可使用的指令

- `addalias` 添加别名
- `dict` 查询已加载词库
- `giveup` 放弃本轮游戏
- `info` 查询歌曲信息
- `kaizimu` 开始游戏
- `monitor` 检测状态
- `search` 搜索词库词条
