import $ = require('jquery')
import keyboardJS = require('keyboardjs')
import axios from 'axios'
import getCssSelector from 'css-selector-generator';
import { PageMsg } from '../common/types';
import { noticeBg, noticeIframe } from './event';
import { NOTICE_TARGET } from '../common/enum';
import { getHtml } from '../helper/iframe'
import { BUILDIN_ACTIONS, IFRAME_ID, PAGE_ACTIONS } from '../common/const';
import { getHost } from './url';

let isSetup, stop, cssInserted;

const outlineCls = 'ext-hp-ms-over';
const startOutlineEvt = 'ext-hp-startoutline';
const stopOutlineEvt = 'ext-hp-clearoutline';
const hashedCls = 'ext-hp-hashed'
const fullScreenCls = 'ext-hp-fullscreen'

function insertCss() {
  if (!cssInserted) {
    const css = document.createElement("style");
  
    css.type = "text/css";
    css.innerHTML = `
      .${outlineCls} {outline: 2px dotted #ccc}
      .${hashedCls} { cursor: pointer;}
      .${fullScreenCls} { font-size: 20px!important; line-height: 1.3!important; }
      .${fullScreenCls} span { font-size: 20px!important; }
    `;
    document.body.appendChild(css);
    cssInserted = true;
  }
}

function start() {
  function listenMouseout(event) {
    $(event.target).removeClass(outlineCls);
  }
  $(document).on('mouseout', listenMouseout);

  function listenMouseover(event) {
    $(event.target).addClass(outlineCls);
  }

  $(document).on('mouseover', listenMouseover);

  function stop() {
    $(document).off('mouseover', listenMouseover);
    $(document).off('mouseout', listenMouseout);
    keyboardJS.bind('up');
  }

  keyboardJS.bind('up', (event) => {
    event.preventDefault()
    const $p = $(`.${outlineCls}`).parent()

    if ($p.length) {
      $(`.${outlineCls}`).removeClass(outlineCls)
      $p.addClass(outlineCls)
    }
  })

  return stop;
}

function clear() {
  $(`.${outlineCls}`).removeClass(outlineCls);
}

let outlinedCallback
function startOutline(callback) {
  outlinedCallback = callback
  stop && stop();
  stop = start();
}

function stopOutline() {
  outlinedCallback = null
  stop && stop();
  clear();
}

function setup() {
  if (!isSetup) {
    insertCss();

    $(document).on(startOutlineEvt, startOutline);
    $(document).on(stopOutlineEvt, stopOutline);

    $(document).on('click', function (event) {
      const $target = $(event.target).closest(`.${outlineCls}`)

      if ($target.length) {
        event.stopPropagation();
        event.preventDefault();
        if (outlinedCallback) {
          const keep = outlinedCallback($target[0], event);

          if (!keep) {
            stopOutline();
          }
        } else {
          stopOutline();
        }

        return false;
      }
    });

    console.log('extension helper inited');
    isSetup = true
  }
}

function getOutlinedElem() {
  return $(`.${outlineCls}`).get(0);
}

let actionCache = {
  $elem: null,
  subActions: null
};

function resetActionCache() {
  actionCache = {
    $elem: null,
    subActions: null
  };
}

export function exec(fn) {
  setup()
  startOutline(fn)
}

function enterReadMode(elem, silent?) {
  const $elem = $(elem)

  actionCache.$elem = $elem;
  hideSiblings($elem);

  elem.scrollIntoView();

  if (!silent) {
    recordAction(BUILDIN_ACTIONS.READ_MODE, elem)
  }
}

export function readMode() {
  exec((elem, event) => {
    enterReadMode(elem)
  })
}

function getAction(actionName: string, elem?: HTMLElement) {
  if (elem) {
    const selector = getCssSelector(elem, { blacklist: [/ext-hp/]})
  
    return `${actionName}@${selector}`
  } else {
    return `${actionName}@body`
  }
}

function recordAction(actionName, elem?: HTMLElement) {
  const action = getAction(actionName, elem)

  appBridge.invoke(PAGE_ACTIONS.RECORD, {
    content: action, url: window.location.href, domain: window.location.host
  }, resp => {
    console.log("recordAction -> resp", resp)
  });
}

export function killElement() {
  exec((elem, event) => {
    elem.remove()
    recordAction(BUILDIN_ACTIONS.KILL_ELEMENT, elem)
    if (event.metaKey) {
      requestAnimationFrame(killElement)
    }
  })
}

function hideSiblings($el) {
  if ($el && $el.length) {
    $el.siblings().not('#steward-main,#wordcard-main').css({
      visibility: 'hidden',
      opacity: 0
    }).addClass('s-a-rm-hn');
    hideSiblings($el.parent())
  } else {
    console.log('Enter reading mode');
    keyboardJS.bind('esc', function showNode() {
      $('.s-a-rm-hn').css({
        visibility: 'visible',
        opacity: 1
      }).removeClass('s-a-rm-hn');
      console.log('Exit reading mode');
      execSubActions(actionCache.$elem, actionCache.subActions, 'leave');
      resetActionCache();
      keyboardJS.unbind('esc', showNode);
    });
  }
}

function execSubActions($elem, action, type) {

}

export function highlightEnglishSyntax() {
  setup()
  startOutline(elem => {
    const $elem = $(elem)

    if ($elem.length) {
      const text = $elem[0].innerText;
      if (text) {
        appBridge.invoke(BUILDIN_ACTIONS.HIGHLIGHT_ENGLISH_SYNTAX, {
          text
        }, resp => {
          if (resp) {
            $elem.html(resp);
          }
        }, NOTICE_TARGET.IFRAME);
      }
    }
  })
}

const shouldHashedTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']

export function hashElement(silent?) {
  insertCss()
  $(shouldHashedTags.join(',')).filter(`[id]:not(.${hashedCls})`).on('click', function() {
    location.hash = this.getAttribute('id')
  }).addClass(hashedCls)

  if (!silent) {
    recordAction(BUILDIN_ACTIONS.HASH_ELEMENT)
  }
}

function downloadURL(url, fileName?, type?) {
  if (getHost(url) !== window.location.host) {
    window.open(url) 
  } else {
    const elem = document.createElement('a');
  
    elem.setAttribute('href', url);
    elem.setAttribute('download', fileName);
    document.body.appendChild(elem);
    elem.click();
  
    elem.remove();
  }
}

function getFileNameByURL(elem, url, type = 'file', ext?) {
  const baseName = elem.getAttribute('alt') || elem.getAttribute('title') || type
  if (!ext) {
    const m = url.match(/\.(\w+)$/)
    if (m) {
      ext = m[1]
    } else {
      ext = ''
    }
  }

  return `${baseName}.${ext}`
}

function downloadSource(elem): boolean {
  const url = elem.getAttribute('src')

  if (url) {
    const tag = elem.tagName.toLowerCase()

    downloadURL(url, getFileNameByURL(elem, url, tag), tag)

    return true
  } else {
    return false
  } 
}

function downloadBg(elem): boolean {
  const bgImg = window.getComputedStyle(elem).backgroundImage
  const match = bgImg.match(/url\(["']?(.*\w)["']?\)/)

  if (match) {
    const url = match[1]
    downloadURL(url, getFileNameByURL(elem, url, 'background'))

    return true
  } else {
    return true
  }
}

function downloadIt(elem, silent?): boolean {
  const tagName = elem.tagName

  function record(result) {
    if (result && !silent) {
      recordAction(BUILDIN_ACTIONS.DOWNLOAD, elem)
    }
  }

  if (['VIDEO', 'IMG', 'AUDIO'].indexOf(tagName) !== -1) {
    const result = downloadSource(elem)

    record(result)

    return result
  } else {
    const result = downloadBg(elem)

    record(result)

    return result
  }
}

export function download() {
  exec((elem, event) => {
    downloadIt(elem)
  })
}

let unsetFullScreenElem

function setupFullScreenElem(elem) {
  const pv = (window.innerHeight - elem.clientHeight) / 2
  const ph = (window.innerWidth - elem.clientWidth) / 2
  const bgc = window.getComputedStyle(elem).backgroundColor
  const ovf = elem.clientHeight > window.innerHeight
  const paddings = []
  
  elem.setAttribute('data-padding', elem.style.padding)
  $(elem).addClass(fullScreenCls)
  if (pv > 0) {
    paddings.push(`${pv}px`)
  } else {
    paddings.push('0')
  }
  if (ph > 0) {
    paddings.push(`${ph}px`)
  } else {
    paddings.push('0')
  }
  
  elem.style.padding = paddings.join(' ')

  if (bgc === 'rgba(0, 0, 0, 0)') {
    elem.setAttribute('data-bgc', bgc)
    elem.style.backgroundColor = '#fff'
  }
  if (ovf) {
    elem.setAttribute('data-ovf', elem.style.overflow)
    elem.style.overflow = 'auto'
  }

  return function() {
    elem.style.padding = elem.getAttribute('data-padding')
    if (elem.hasAttribute('data-bgc')) {
      elem.style.backgroundColor = elem.getAttribute('data-bgc')
    }
    if (ovf) {
      elem.style.overflow = elem.getAttribute('data-ovf')
    }
    $(elem).removeClass(fullScreenCls)
  }
}

function fullScreenElem(elem) {
  if (elem.requestFullscreen) {
    unsetFullScreenElem = setupFullScreenElem(elem)
    requestAnimationFrame(() => {
      elem.requestFullscreen()
    })
  }
}

export function fullScreen() {
  exec((elem, event) => {
    fullScreenElem(elem)
  })
}

function openOutline() {
  exec(() => true)
}

export function createBridge() {
  const callbacks = {}
  const registerFuncs = {}
  let cbId = 0

  const bridge = {
    inited: false,
    ready() {
      if (bridge.inited) {
        return Promise.resolve()
      } else {
        return new Promise(resolve => {
          $('html').append(getHtml());
          const $iframe = $(`#${IFRAME_ID}`);
          $iframe.on('load', () => {
            bridge.inited = true;
            resolve();
          });
        });
      }
    },
    async invoke(action, data, callback, target: NOTICE_TARGET = NOTICE_TARGET.BACKGROUND) {
      await bridge.ready()
      cbId = cbId + 1;
      callbacks[cbId] = callback;

      const msg: PageMsg = {
        action,
        ext_from: 'content',
        data,
        callbackId: cbId
      }
      if (target === NOTICE_TARGET.BACKGROUND) {
        noticeBg(msg)
      } else {
        noticeIframe(msg)
      }
    },

    receiveMessage(msg) {
      const { action, data, callbackId, responstId } = msg;

      if (callbackId) {
        if (callbacks[callbackId]) {
          callbacks[callbackId](data);
          callbacks[callbackId] = null;
        }
      } else if (action) {
        if (registerFuncs[action]) {
          let ret = {};
          let flag = false;

          registerFuncs[action].forEach(callback => {
            callback(data, function (r) {
              flag = true;
              ret = Object.assign(ret, r);
            });
          });

          if (flag) {
            noticeBg({
              responstId: responstId,
              ret: ret
            });
          }
        }
      }
    },

    register: function (action, callback) {
      if (!registerFuncs[action]) {
        registerFuncs[action] = [];
      }
      registerFuncs[action].push(callback);
    }
  }

  return bridge;
}

export const appBridge = createBridge()

window.addEventListener('message', event => {
  const { action, callbackId } = event.data;

  if (callbackId) {
    appBridge.receiveMessage(event.data);
  } else {
    console.log("action", action)
  }
});

export function exceAutomation(content, times = 0) {
  const [ action, selector ] = content.split('@')
  const elem = document.querySelector(selector)

  function tryAgain() {
    if (times < 5) {
      setTimeout(() => {
        exceAutomation(content, times + 1)
      }, 1000)
    }
  }

  if (elem) {
    if (action === BUILDIN_ACTIONS.READ_MODE) {
      enterReadMode(elem, true)
    } else if (action === BUILDIN_ACTIONS.HASH_ELEMENT) {
      hashElement(true)
    } else if (action === BUILDIN_ACTIONS.DOWNLOAD) {
      const result = downloadIt(elem, true)

      if (!result) {
        tryAgain()
      }
    }
  } else {
    tryAgain()
  }
}

declare global {
  interface Window { exceAutomation: any; }
}

window.exceAutomation = exceAutomation

$(() => {
  noticeBg({
    action: PAGE_ACTIONS.AUTOMATIONS,
    data: { url: window.location.href }
  }, (result) => {
    if (result.data && result.data.length) {
      result.data.forEach(item => {
        exceAutomation(item.instructions)
      })
    }
  })

  document.addEventListener("fullscreenchange", function( event ) {
    if (!document.fullscreenElement) {
      if (unsetFullScreenElem) {
        unsetFullScreenElem()
      }
    }
  });
})

export default function (req) {
  const { data, action } = req

  if (action === 'dom.outline') {
    openOutline()

    return Promise.resolve({})
  } else {
    return Promise.resolve({})
  }
}