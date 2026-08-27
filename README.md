# Gewen

透明置顶的 Windows 3D 桌宠，直接播放 GLB 内置骨骼动画。

## 快捷键

- `Ctrl+Alt+1`：惊讶动作
- `Ctrl+Alt+2`：互动
- `Ctrl+Alt+3`：洋娃娃动作（自动变回角色）
- `Ctrl+Alt+4`：庆祝
- `Ctrl+Alt+5`：魔法棒庆祝
- `Ctrl+Alt+6`：奔跑
- `Ctrl+Alt+7`：舞蹈动作（动态切换面部表情）
- `Ctrl+Alt+0`：恢复待机
- `Ctrl+Alt+M`：显示或隐藏控制菜单

映射集中在 `src/shortcuts.js`，可以按需修改。避免使用 `Ctrl+Z` 等系统常用快捷键，否则会影响其他软件。

## 运行

```powershell
npm.cmd install
npm.cmd start
```

## 构建

```powershell
npm.cmd run build:dir
```

便携版输出到 `dist/Gewen 1.0.0.exe`。
