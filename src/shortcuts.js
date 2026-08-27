const animationShortcuts = [
  { accelerator: 'CommandOrControl+Alt+1', animation: 'Greeting', label: '惊讶动作' },
  { accelerator: 'CommandOrControl+Alt+2', animation: 'Interact', label: '互动' },
  { accelerator: 'CommandOrControl+Alt+3', animation: 'DollAction', label: '洋娃娃动作' },
  { accelerator: 'CommandOrControl+Alt+4', animation: 'Celebrate', label: '庆祝', loop: true },
  { accelerator: 'CommandOrControl+Alt+5', animation: 'WandCelebrate', label: '魔法棒庆祝', loop: true },
  { accelerator: 'CommandOrControl+Alt+6', animation: 'Run', label: '奔跑', loop: true },
  { accelerator: 'CommandOrControl+Alt+7', animation: 'DanceIn', label: '舞蹈动作' },
  { accelerator: 'CommandOrControl+Alt+0', animation: 'Idle_Base', label: '恢复待机', loop: true }
];

module.exports = { animationShortcuts };
