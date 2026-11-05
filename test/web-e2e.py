"""Run with: python test/web-e2e.py (requires Playwright and Chromium).
Offline UI test: browser DOM and mocked user gesture audio. Does not verify live Cloudflare.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = Path(__file__).resolve().parents[1]
HTML = (BASE / 'web-preview' / 'index.html').read_text(encoding='utf-8')

with sync_playwright() as play:
    browser = play.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors=[]
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.goto('about:blank')
    page.evaluate('''() => {
      window.__storage = {};
      Object.defineProperty(window, 'localStorage', {configurable:true,value:{
        getItem: k => window.__storage[k] ?? null,
        setItem: (k,v) => window.__storage[k] = String(v)
      }});
      window.__tones=0;
      window.AudioContext = class {
        state='running';currentTime=0;destination={};
        createOscillator() {return {frequency:{value:0},connect(){},start(){window.__tones++},stop(){}}}
        createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}
        resume(){return Promise.resolve()}
      };
      document.documentElement.requestFullscreen = () => Promise.reject(new Error('fullscreen not supported'));
    }''')
    page.set_content(HTML)
    page.wait_for_function("document.querySelectorAll('.preset').length === 3")
    assert page.locator('#digits').inner_text() == '05:00'
    page.locator('#add').click()
    page.locator('#presetName').fill('活動中場')
    page.locator('#minutes').fill('0')
    page.locator('#seconds').fill('4')
    page.locator('#save').click()
    assert page.locator('#purpose').inner_text() == '活動中場'
    page.locator('#settings').click()
    page.locator('#lead').fill('2')
    page.locator('#save').click()
    page.locator('#start').click()
    page.wait_for_timeout(1500)
    assert page.locator('#digits').inner_text() in ('00:03','00:02')
    page.locator('#start').click()
    frozen = page.locator('#digits').inner_text()
    page.wait_for_timeout(350)
    assert page.locator('#digits').inner_text() == frozen
    page.locator('#start').click()
    page.wait_for_timeout(3500)
    assert page.locator('#unit').inner_text() == '時間到'
    assert page.evaluate('window.__tones') == 4, page.evaluate('window.__tones')
    page.wait_for_timeout(400)
    assert page.evaluate('window.__tones') == 4, '鈴聲不應重複響起'
    page.locator('#reset').click()
    assert page.locator('#digits').inner_text() == '00:04'
    page.locator('#clockTab').click()
    assert len(page.locator('#digits').inner_text()) == 8
    page.locator('#timerTab').click()
    page.evaluate('document.documentElement.requestFullscreen = undefined')
    page.locator('#full').click()
    page.wait_for_timeout(150)
    assert page.locator('body').evaluate('(x) => x.classList.contains("theater")')
    page.locator('#exitTheater').click()
    assert not page.locator('body').evaluate('(x) => x.classList.contains("theater")')
    page.set_content(HTML)
    assert page.locator('#purpose').inner_text() == '活動中場'
    assert page.locator('#digits').inner_text() == '00:04'
    assert '2 秒' in page.locator('#summary').inner_text()
    assert not errors, errors
    print('PASS: 初始顯示、用途新增、提醒設定、倒數、暫停與繼續、雙鈴聲、歸零、重設、時鐘切換、全螢幕退離、設定保存、無 JS 異常')
    browser.close()
