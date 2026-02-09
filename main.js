// const { app, BrowserWindow } = require('electron');
// const path = require('path');

// function createWindow() {
//     const win = new BrowserWindow({
//         width: 1200,
//         height: 800,
//         icon: path.join(__dirname, 'hwayeap.png'),
//         webPreferences: {
//             nodeIntegration: true,
//             contextIsolation: false
//         }
//     });

//     win.loadFile('login.html');
//     // Uncomment the line below if you want to open DevTools by default
//     // win.webContents.openDevTools();
// }

// app.whenReady().then(createWindow);

// app.on('window-all-closed', () => {
//     if (process.platform !== 'darwin') {
//         app.quit();
//     }
// });

// app.on('activate', () => {
//     if (BrowserWindow.getAllWindows().length === 0) {
//         createWindow();
//     }
// });