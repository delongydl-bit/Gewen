const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gewenAPI', {
  onAnimation: callback => ipcRenderer.on('play-animation', (_event, payload) => callback(payload)),
  onModel: callback => ipcRenderer.on('select-model', (_event, index) => callback(index)),
  onCursor: callback => ipcRenderer.on('cursor', (_event, value) => callback(value)),
  onToggleUI: callback => ipcRenderer.on('toggle-ui', () => callback()),
  playAnimation: name => ipcRenderer.send('play-animation', name),
  selectModel: index => ipcRenderer.send('select-model', index),
  showMenu: () => ipcRenderer.send('show-menu'),
  setUIState: visible => ipcRenderer.send('ui-state', visible),
  beginDrag: point => ipcRenderer.send('drag-start', point),
  moveDrag: point => ipcRenderer.send('drag-move', point),
  endDrag: () => ipcRenderer.send('drag-end')
});
