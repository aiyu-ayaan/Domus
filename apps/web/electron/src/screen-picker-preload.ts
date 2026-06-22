import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('screenPicker', {
  onSources: (callback: (sources: Array<{ id: string; name: string; thumbnail: string }>) => void) => {
    ipcRenderer.on('screen-picker-sources', (_event, sources) => {
      callback(sources);
    });
  },
  selectSource: (sourceId: string) => {
    ipcRenderer.send('screen-picker-selected', sourceId);
  },
  cancel: () => {
    ipcRenderer.send('screen-picker-cancel');
  },
});
