/** 部件属性面板验证：改参数即时生效、光滑开关、三维尺寸 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('./file-ipc.cjs')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-props-')))

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const HELPERS = `
  window.__props = () => [...document.querySelectorAll('.props__row')].map(r => {
    const label = r.children[0].textContent;
    const input = r.querySelector('.props__input');
    const toggle = r.querySelector('.props__toggle');
    const unit = r.querySelector('.props__unit')?.textContent ?? '';
    return { label, value: input ? input.value : toggle?.textContent, unit };
  });
  window.__setProp = async (label, value) => {
    const row = [...document.querySelectorAll('.props__row')].find(r => r.children[0].textContent === label);
    if (!row) return 'no-row';
    const input = row.querySelector('.props__input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    return 'ok';
  };
  window.__toggleProp = async (label) => {
    const row = [...document.querySelectorAll('.props__row')].find(r => r.children[0].textContent === label);
    row?.querySelector('.props__toggle')?.click();
    await new Promise(r => setTimeout(r, 350));
    return 'ok';
  };
  window.__forces = () => {
    const out = {};
    for (const g of document.querySelectorAll('[data-id^="F_"]')) {
      const id = g.getAttribute('data-id');
      const t = g.querySelector('text')?.textContent ?? '';
      out[id] = t;
    }
    return out;
  };
  window.__openTemplate = async (name) => {
    document.querySelector('.toolbar__menu-anchor .tbtn').click();
    await new Promise(r => setTimeout(r, 150));
    [...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('模板库')).click();
    await new Promise(r => setTimeout(r, 450));
    [...document.querySelectorAll('.gallery__main')].find(c => c.textContent.includes(name)).click();
    await new Promise(r => setTimeout(r, 700));
    return document.querySelector('.titlebar__file').textContent;
  };
  true;
`

async function main() {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    return net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(pathname))).toString())
  })
  fs.mkdirSync(outDir, { recursive: true })
  ipcMain.handle('ui:get-state', () => ({}))
  ipcMain.on('ui:set-state', () => {})
  registerFileIpc({ addRecent: () => {} })

  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: true,
    backgroundColor: '#FAFAF8',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#F2F0EC', symbolColor: '#5C5A56', height: 36 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  })

  const js = (code) => win.webContents.executeJavaScript(code, true)
  const load = async () => {
    await win.loadURL(process.env.VERIFY_URL || 'app://chordot/index.html?notour=1')
    await wait(800)
    await js(HELPERS)
  }

  const report = {}

  /* —— 斜面：倾角 / 摩擦因数 / 质量 —— */
  await load()
  await js(`window.__openTemplate('斜面受力 30')`)
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(300)
  report.inclineProps = await js(`window.__props()`)
  report.forcesBefore = await js(`window.__forces()`)

  await js(`window.__setProp('倾角', 45)`)
  report.afterAngle = {
    props: await js(`window.__props()`),
    forces: await js(`window.__forces()`),
  }

  await js(`window.__toggleProp('接触面光滑')`)
  report.afterSmooth = {
    props: await js(`window.__props()`),
    forces: await js(`window.__forces()`),
  }

  await js(`window.__toggleProp('接触面光滑')`)
  report.afterRough = { props: await js(`window.__props()`) }

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'props-incline.png'), shot.toPNG())

  /* —— 单摆：摆长 —— */
  await load()
  await js(`window.__openTemplate('单摆')`)
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(300)
  report.pendulumProps = await js(`window.__props()`)
  const rodBefore = await js(`(() => {
    const l = document.querySelector('[data-id="rod"] line');
    return Math.round(Math.hypot(+l.getAttribute('x2') - +l.getAttribute('x1'), +l.getAttribute('y2') - +l.getAttribute('y1')));
  })()`)
  await js(`window.__setProp('摆长', 1.2)`)
  const rodAfter = await js(`(() => {
    const l = document.querySelector('[data-id="rod"] line');
    return Math.round(Math.hypot(+l.getAttribute('x2') - +l.getAttribute('x1'), +l.getAttribute('y2') - +l.getAttribute('y1')));
  })()`)
  report.rod = { before: rodBefore, after: rodAfter, shortened: rodAfter < rodBefore }

  /* —— 三维：尺寸 —— */
  await load()
  await js(`window.__openTemplate('正方体')`)
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(300)
  report.solidProps = await js(`window.__props()`)
  const sizeBefore = await js(`(() => {
    const pts = document.querySelector('[data-id="s1"] polygon').getAttribute('points').split(' ');
    const [x1, y1] = pts[0].split(',').map(Number);
    const [x2, y2] = pts[1].split(',').map(Number);
    return Math.round(Math.hypot(x2 - x1, y2 - y1));
  })()`)
  await js(`window.__setProp('尺寸', 6)`)
  const sizeAfter = await js(`(() => {
    const pts = document.querySelector('[data-id="s1"] polygon').getAttribute('points').split(' ');
    const [x1, y1] = pts[0].split(',').map(Number);
    const [x2, y2] = pts[1].split(',').map(Number);
    return Math.round(Math.hypot(x2 - x1, y2 - y1));
  })()`)
  report.solid = { before: sizeBefore, after: sizeAfter, grew: sizeAfter > sizeBefore }

  console.log('RESULT ' + JSON.stringify(report, null, 2))
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
