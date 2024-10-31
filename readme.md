# koishi-plugin-kaizimu

[![npm](https://img.shields.io/npm/v/koishi-plugin-kaizimu?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-kaizimu)

支持自定义词库的开字母游戏。

## 使用方法

在设置添加词库路径，目前支持两种 JSON 格式：

```json
[ // 有别名
  {
    "name": "Sayonara Hatsukoi",
    "aliases": [
      "再见初恋"
    ]
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
    "aliases": [
      "路西法"
    ]
  },
  {
    "name": "GOODTEK (Arcaea Edit)",
    "aliases": [
      "好锤子",
      "锤子"
    ]
  },
  ...
]
```

或者

```json
[ // 无别名
  "Sayonara Hatsukoi",
  "Fairytale",
  "Vexaria",
  "Rise",
  "Lucifer",
  "GOODTEK (Arcaea Edit)",
  ...
]
```
