const { app, BrowserWindow, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

let mainWindow;

// Configurar auto-updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Logs do auto-updater
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'CyberShield - Painel de Operações de Segurança',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    icon: path.join(__dirname, 'resources', 'icon.ico')
  });

  // Remove menu bar (opcional - deixe se quiser manter)
  Menu.setApplicationMenu(null);

  // Carrega o build estático do Vite
  const indexPath = path.join(__dirname, 'web', 'index.html');
  mainWindow.loadFile(indexPath);

  // DevTools em desenvolvimento
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Log de erros
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Falha ao carregar:', errorCode, errorDescription);
  });
}

app.whenReady().then(() => {
  createWindow();

  // Verificar atualizações após 3 segundos
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// ====== AUTO-UPDATER EVENTS ======

autoUpdater.on('checking-for-update', () => {
  console.log('🔍 Verificando atualizações...');
});

autoUpdater.on('update-available', (info) => {
  console.log('✅ Atualização disponível:', info.version);
  
  // Perguntar ao usuário se deseja baixar
  const { dialog } = require('electron');
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Atualização Disponível',
    message: `Nova versão ${info.version} disponível!`,
    detail: 'Deseja baixar e instalar agora?',
    buttons: ['Baixar', 'Mais Tarde']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });
});

autoUpdater.on('update-not-available', () => {
  console.log('ℹ️ Aplicativo está atualizado');
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download: " + progressObj.percent.toFixed(2) + '%';
  log_message += ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  console.log(log_message);
  
  // Atualizar título da janela com progresso
  if (mainWindow) {
    mainWindow.setTitle(`CyberShield - Baixando atualização... ${progressObj.percent.toFixed(0)}%`);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('✅ Atualização baixada:', info.version);
  
  // Restaurar título da janela
  if (mainWindow) {
    mainWindow.setTitle('CyberShield - Painel de Operações de Segurança');
  }
  
  const { dialog } = require('electron');
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Atualização Pronta',
    message: 'Atualização baixada com sucesso!',
    detail: 'A aplicação será reiniciada para aplicar a atualização.',
    buttons: ['Reiniciar Agora', 'Mais Tarde']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });
});

autoUpdater.on('error', (err) => {
  console.error('❌ Erro no auto-updater:', err);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Prevenir múltiplas instâncias
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
