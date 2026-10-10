'use strict';

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------
// seal: 인증 도장에 들어가는 글자. 색과 글자를 함께 써서 색만으로 구분하지 않게 한다.
const CERTS = {
  model: { label: '모범음식점', short: '모범', seal: '모', hex: '#2b4fa8', about: '위생과 서비스가 좋아 시·군·구청장이 지정한 음식점' },
  goodprice: { label: '착한가격업소', short: '착한가격', seal: '착', hex: '#12915a', about: '지역 평균보다 싼 가격을 유지해 지자체가 지정한 가게' },
  centennial: { label: '백년가게', short: '백년가게', seal: '백', hex: '#9a6b1e', about: '30년 넘게 이어 온 가게 중 중소벤처기업부가 지정한 곳' },
  safe: { label: '안심식당', short: '안심식당', seal: '안', hex: '#0d9488', about: '덜어 먹기·위생적 수저 관리 등을 지키는 식당 (농림축산식품부)' },
  hygiene: { label: '위생등급', short: '위생', seal: '위', hex: '#0891b2', about: '식품의약품안전처 음식점 위생등급' },
  blueribbon: { label: '블루리본', short: '블루리본', seal: '블', hex: '#2563eb', about: '블루리본 서베이 선정 (직접 입력)' },
  michelin: { label: '미쉐린', short: '미쉐린', seal: '미', hex: '#c8102e', about: '미쉐린 가이드 선정 (직접 입력)' },
};
// 점 색·도장 순서를 정할 때의 우선순위
const COLOR_PRIORITY = ['michelin', 'blueribbon', 'centennial', 'model', 'hygiene', 'safe', 'goodprice'];
// 빠른 필터 칩으로 꺼낼 인증 (켜고 끄는 단순 조건)
const CHIP_CERTS = ['model', 'goodprice', 'centennial', 'safe'];
const MICHELIN_RANK = { selected: 0, plate: 0, bib: 1, 1: 2, 2: 3, 3: 4 };
const MICHELIN_LABEL = { selected: '셀렉티드', plate: '플레이트', bib: '빕구르망', 1: '1스타', 2: '2스타', 3: '3스타' };
const HYGIENE_LABEL = { 1: '좋음', 2: '우수', 3: '매우 우수' };

const DEFAULTS = {
  mode: 'and', q: '', sido: '', sigungu: '',
  model: false, goodprice: false, centennial: false, safe: false,
  hygiene: 0, // 최소 위생 등급, 0 = 끔
  br: -1, // 최소 블루리본 수, -1 = 끔
  bry: 0, // 최소 블루리본 선정 연수
  mich: -1, // 최소 미쉐린 등급(MICHELIN_RANK), -1 = 끔
  fav: false, // 찜한 곳만
  sort: 'certs',
};
// 카카오 지도 레벨: 숫자가 작을수록 확대 (1 ≈ 20m, 13 ≈ 전국)
const KOREA = { lat: 36.4, lng: 127.8, level: 13 };
const DETAIL_LEVEL = 3;
const CLUSTER_MIN_LEVEL = 6; // 이 레벨부터 축소하면 덩어리로 묶음
const LABEL_LEVEL = 4; // 이 레벨 이하로 확대하면 상호 이름표 표시
const LABEL_MAX = 300; // 한 화면 이름표 상한 (인증 많은 순)
const SMALL_SET = 300; // 결과가 이 이하면 묶지 않음
const SMALL_LABEL_LEVEL = 8; // 결과가 적을 때 이름표를 붙이는 최대 레벨
const LOCATE_LEVEL = 4;
const SHEET_PEEK = 112;
const PAGE = 100;

// ---------------------------------------------------------------------------
// 상태
// ---------------------------------------------------------------------------
const state = { ...DEFAULTS };
let DATA = null;
let PLACES = [];
let AVAIL = {};
let filtered = [];
let listLimit = PAGE;
let selected = null; // 상세나 미리보기로 보고 있는 업소
let me = null;
let map = null;
let viewBeforeDetail = null; // 상세 들어가기 전 지도 위치 (뒤로 가면 복원)

const $ = (id) => document.getElementById(id);
const panel = $('panel');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => n.toLocaleString('ko-KR');
const isMobile = () => window.matchMedia('(max-width: 899px)').matches;
const normQ = (s) => s.toLowerCase().replace(/\s+/g, '');
const byPriority = (a, b) => COLOR_PRIORITY.indexOf(a) - COLOR_PRIORITY.indexOf(b);

const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  route: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 21.5 12 12 21.5 2.5 12z"/><path d="M9.5 13.5v-2a1 1 0 0 1 1-1H15m-2-2 2 2-2 2"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h2.6l1.4 4.1-2 1.5a12 12 0 0 0 6.3 6.3l1.5-2 4.1 1.4v2.6a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 4.6 5.6a2 2 0 0 1 2-2.1z"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 7.5 2.9C19.5 15.4 12 20 12 20z"/></svg>',
  heartOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 7.5 2.9C19.5 15.4 12 20 12 20z"/></svg>',
  filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
};

// ---------------------------------------------------------------------------
// 찜 (이 브라우저에만 저장. 폰·PC, 주소별로 따로 저장된다)
//  id 와 함께 이름·주소도 남겨, 데이터를 다시 빌드해 id 가 바뀌어도 무엇이었는지 알 수 있게 한다.
// ---------------------------------------------------------------------------
const FAV_KEY = 'bestgage.favs';
function loadFavs() {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem(FAV_KEY) || '{}')));
  } catch {
    return new Map();
  }
}
const favs = loadFavs();
const isFav = (p) => favs.has(p.i);
function saveFavs() {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(Object.fromEntries(favs)));
  } catch { /* 저장 불가(사생활 보호 모드 등) — 이번 방문 동안만 유지 */ }
}

function exportFavs() {
  const blob = new Blob([JSON.stringify(Object.fromEntries(favs), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bestgage-favs-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`찜 ${favs.size}곳을 파일로 저장했습니다`);
}

async function importFavs(file) {
  try {
    const obj = JSON.parse(await file.text());
    let added = 0;
    for (const [id, v] of Object.entries(obj)) {
      if (!favs.has(id) && v && typeof v.n === 'string') {
        favs.set(id, { n: v.n, a: v.a || '', at: v.at || '' });
        added += 1;
      }
    }
    saveFavs();
    toast(`찜 ${added}곳을 불러왔습니다`);
    renderFilters();
    apply();
  } catch {
    toast('찜 파일을 읽지 못했습니다. 내보내기로 만든 .json 파일인지 확인하세요');
  }
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

// ---------------------------------------------------------------------------
// 데이터
// ---------------------------------------------------------------------------
async function loadData() {
  // 배포마다 바뀌는 build 값으로 캐시를 무효화 (GitHub Pages 는 약 10분 캐시)
  const v = window.BESTGAGE?.build ? `?v=${window.BESTGAGE.build}` : '';
  const res = await fetch(`data/places.json${v}`);
  if (!res.ok) throw new Error(`places.json ${res.status}`);
  DATA = await res.json();
  PLACES = DATA.p.map((p) => {
    const certs = {};
    for (const c of p.k) certs[DATA.certTypes[c.k]] = c;
    const types = Object.keys(certs).sort(byPriority);
    return {
      ...p, certs, types,
      nc: types.length,
      sidoName: p.s != null ? DATA.sido[p.s] : '',
      key: normQ(p.n || ''),
      top: types[0],
    };
  });
  AVAIL = Object.fromEntries(Object.keys(CERTS).map((t) => [t, PLACES.filter((p) => p.certs[t]).length]));
}

// 카카오 JavaScript 키는 serve/deploy 가 .env 로 만든 config.js 에서 읽는다 (코드에 키를 두지 않음)
function loadKakao() {
  const key = window.BESTGAGE?.kakaoJsKey;
  if (!key) return Promise.reject(new Error('카카오 JavaScript 키가 없습니다. .env 의 KAKAO_JS_KEY 를 넣고 uv run bestgage serve 로 다시 여세요.'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('카카오 지도를 불러오지 못했습니다. 카카오 콘솔의 Web 플랫폼에 이 주소가 등록됐는지 확인하세요.')), 10000);
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    s.onload = () => kakao.maps.load(() => { clearTimeout(timer); resolve(); });
    // 미등록 도메인이면 카카오가 401을 돌려줘 스크립트 로드가 실패한다
    s.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`카카오 지도를 불러오지 못했습니다. 카카오 콘솔 > 플랫폼 > Web 사이트 도메인에 ${location.origin} 을 등록하세요.`));
    };
    document.head.append(s);
  });
}

// ---------------------------------------------------------------------------
// 필터
// ---------------------------------------------------------------------------
function axisPredicates(s) {
  const preds = [];
  for (const t of ['model', 'goodprice', 'centennial', 'safe']) {
    if (s[t]) preds.push((p) => !!p.certs[t]);
  }
  if (s.hygiene > 0) preds.push((p) => (+p.certs.hygiene?.g || 0) >= s.hygiene);
  if (s.br >= 0) {
    preds.push((p) => {
      const c = p.certs.blueribbon;
      return !!c && (+c.g || 0) >= s.br && (c.y?.length || 0) >= s.bry;
    });
  }
  if (s.mich >= 0) preds.push((p) => !!p.certs.michelin && (MICHELIN_RANK[p.certs.michelin.g] ?? 0) >= s.mich);
  return preds;
}

function commonPredicate(s) {
  const q = normQ(s.q);
  return (p) => (!s.fav || favs.has(p.i)) && (!s.sido || p.sidoName === s.sido) && (!s.sigungu || p.g === s.sigungu)
    && (!q || p.key.includes(q));
}

function filterPlaces(s = state) {
  const common = commonPredicate(s);
  const preds = axisPredicates(s);
  const ok = preds.length === 0 ? () => true
    : s.mode === 'and' ? (p) => preds.every((f) => f(p))
      : (p) => preds.some((f) => f(p));
  return PLACES.filter((p) => common(p) && ok(p));
}

// 숨겨진(데이터 없는) 필터가 북마크 등으로 켜져 있으면 끌 방법이 없으니 기본값으로 되돌린다
function dropUnavailableFilters() {
  if (!AVAIL.blueribbon) Object.assign(state, { br: DEFAULTS.br, bry: DEFAULTS.bry });
  if (!AVAIL.michelin) state.mich = DEFAULTS.mich;
  if (!AVAIL.hygiene) state.hygiene = DEFAULTS.hygiene;
  if (!AVAIL.safe) state.safe = DEFAULTS.safe;
}

// 칩 밖(필터 화면)에서만 바꿀 수 있는 조건 수 → 필터 칩 배지
function hiddenFilterCount() {
  return (state.mode !== DEFAULTS.mode ? 1 : 0) + (state.hygiene > 0) + (state.br >= 0) + (state.mich >= 0);
}

// ---------------------------------------------------------------------------
// 지도 (카카오맵 + Supercluster)
//  카카오 MarkerClusterer는 2만 개를 넣는 데 3초 넘게 걸려서, 덩어리 계산은 Supercluster로 하고
//  지금 화면에 보이는 점·덩어리만 CustomOverlay로 그린다.
// ---------------------------------------------------------------------------
const LatLng = (lat, lng) => new kakao.maps.LatLng(lat, lng);
const levelToZoom = (lv) => 20 - lv; // 카카오 레벨 ↔ 웹 지도 줌 (대략)
const zoomToLevel = (z) => Math.max(1, Math.min(14, 20 - z));

function initMap(view) {
  map = new kakao.maps.Map($('map'), { center: LatLng(view.lat, view.lng), level: view.level });
  // 폰은 두 손가락 확대가 있으니 줌 버튼 없이 지도를 넓게 쓴다
  if (!isMobile()) map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
}

let index = null;
let indexGen = 0;
function buildIndex() {
  indexGen += 1;
  const pts = filtered.filter((p) => p.y != null);
  // 결과가 적으면 묶지 않고 전부 보여 준다 (덩어리 하나로 뭉개지지 않게)
  if (pts.length <= SMALL_SET) {
    index = null;
    return;
  }
  // radius 는 512 기준 단위라 화면 픽셀로는 절반 → 120 ≈ 60px
  index = new Supercluster({ radius: 120, maxZoom: levelToZoom(CLUSTER_MIN_LEVEL), minPoints: 3 });
  index.load(pts.map((p) => ({ type: 'Feature', properties: { p }, geometry: { type: 'Point', coordinates: [p.x, p.y] } })));
}

function viewBox(pad = 0.15) {
  const b = map.getBounds();
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  const dx = (ne.getLng() - sw.getLng()) * pad;
  const dy = (ne.getLat() - sw.getLat()) * pad;
  return [sw.getLng() - dx, sw.getLat() - dy, ne.getLng() + dx, ne.getLat() + dy];
}

// 점 + (확대 시) 이름표. 폰은 미리보기 카드, PC는 바로 상세.
function pointOverlay(p) {
  if (p._ov) return p._ov;
  const el = document.createElement('div');
  el.className = `pin n${Math.min(p.nc, 3)}`;
  el.style.setProperty('--c', CERTS[p.top].hex);
  el.innerHTML = `<span class="dot">${p.nc > 1 ? p.nc : ''}</span><span class="name">${esc(p.n)}</span>`;
  el.title = p.n;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isMobile()) showPreview(p);
    else showDetail(p, { pan: false });
  });
  p._ov = new kakao.maps.CustomOverlay({ position: LatLng(p.y, p.x), content: el, xAnchor: 0, yAnchor: 0, zIndex: p.nc, clickable: true });
  return p._ov;
}

function clusterOverlay(f) {
  const n = f.properties.point_count;
  const el = document.createElement('div');
  el.className = `cl ${n < 100 ? 's' : n < 1000 ? 'm' : 'l'}`;
  el.textContent = n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  el.setAttribute('aria-label', `${n}곳, 눌러서 확대`);
  const [lng, lat] = f.geometry.coordinates;
  const { id } = f;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const z = index.getClusterExpansionZoom(id);
    map.setLevel(Math.min(map.getLevel() - 1, zoomToLevel(z)), { anchor: LatLng(lat, lng), animate: true });
  });
  return new kakao.maps.CustomOverlay({ position: LatLng(lat, lng), content: el, xAnchor: 0.5, yAnchor: 0.5, zIndex: 0, clickable: true });
}

// 이름표가 서로 겹치지 않게 (선택 > 찜 > 인증 많은 순)으로 고른다. 못 고른 곳은 점만.
function pickNamed(points) {
  // 결과가 적으면(묶지 않은 상태) 시 단위 정도까지 멀어져도 이름을 붙인다
  const allow = map.getLevel() <= LABEL_LEVEL || (!index && map.getLevel() <= SMALL_LABEL_LEVEL);
  if (!allow) return new Set(selected ? [selected] : []);
  const proj = map.getProjection();
  const boxes = [];
  const picked = new Set();
  const ordered = [...points].sort((a, b) => (b === selected) - (a === selected) || isFav(b) - isFav(a) || b.nc - a.nc);
  for (const p of ordered) {
    const pt = proj.containerPointFromCoords(LatLng(p.y, p.x));
    const w = Math.min(136, p.n.length * 12 + 16);
    const top = pt.y + (p.nc >= 3 ? 15 : p.nc === 2 ? 13 : 9);
    const box = [pt.x - w / 2 - 2, top - 2, pt.x + w / 2 + 2, top + 22];
    if (p !== selected && boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    boxes.push(box);
    picked.add(p);
    if (picked.size >= LABEL_MAX) break;
  }
  return picked;
}

let shown = new Map();
function renderPoints() {
  const bbox = viewBox();
  const [w, s, e, n] = bbox;
  const items = index
    ? index.getClusters(bbox, levelToZoom(map.getLevel()))
    : filtered.filter((p) => p.y != null && p.x >= w && p.x <= e && p.y >= s && p.y <= n)
      .map((p) => ({ properties: { p } }));
  const points = items.filter((f) => !f.properties.cluster).map((f) => f.properties.p);
  const named = pickNamed(points);

  const next = new Map();
  for (const f of items) {
    if (f.properties.cluster) {
      const key = `c${indexGen}-${f.id}`;
      next.set(key, shown.get(key) || clusterOverlay(f));
    } else {
      const { p } = f.properties;
      const ov = pointOverlay(p);
      const el = ov.getContent();
      el.classList.toggle('named', named.has(p));
      el.classList.toggle('selected', p === selected);
      el.classList.toggle('fav', isFav(p));
      ov.setZIndex(p === selected ? 100 : isFav(p) ? 50 : p.nc);
      next.set(`p${p.i}`, ov);
    }
  }
  // 선택한 곳은 (덩어리 안에 들어가 있어도) 항상 보이게
  if (selected?.y != null && !next.has(`p${selected.i}`)) {
    const ov = pointOverlay(selected);
    ov.getContent().classList.add('selected', 'named');
    ov.setZIndex(100);
    next.set(`p${selected.i}`, ov);
  }
  for (const [k, ov] of shown) if (!next.has(k)) ov.setMap(null);
  for (const [k, ov] of next) if (!shown.has(k)) ov.setMap(map);
  shown = next;
}

// 모바일에서는 지도가 시트 접힘 높이까지 깔려 있고, 시트를 펼친 만큼 지도를 가린다
function sheetCover() {
  return isMobile() ? Math.max(0, panel.offsetHeight - SHEET_PEEK) : 0;
}

function focusPlace(p) {
  if (p.y == null) return;
  map.setLevel(Math.min(map.getLevel(), DETAIL_LEVEL));
  map.setCenter(LatLng(p.y, p.x));
  const cover = sheetCover();
  if (cover) map.panBy(0, Math.round(cover / 2));
}

function fitToFiltered() {
  const pts = filtered.filter((p) => p.y != null);
  if (!pts.length) return;
  const b = new kakao.maps.LatLngBounds();
  for (const p of pts) b.extend(LatLng(p.y, p.x));
  const top = isMobile() ? 140 : 40; // 모바일은 위에 검색창·칩이 떠 있음
  map.setBounds(b, top, 40, sheetCover() + 40, 40);
  if (map.getLevel() < DETAIL_LEVEL) map.setLevel(DETAIL_LEVEL);
}

let meOverlay = null;
// silent: 처음 열 때 자동 시도. 실패하면 조용히 전국 화면 그대로 둔다.
function locate({ silent = false } = {}) {
  const fail = (msg) => { if (!silent) toast(msg); };
  // 브라우저는 https 또는 localhost 에서만 위치를 준다
  if (!window.isSecureContext) {
    fail('내 위치는 https 주소로 열었을 때만 쓸 수 있습니다');
    return;
  }
  if (!navigator.geolocation) {
    fail('이 브라우저는 위치를 지원하지 않습니다');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      me = [pos.coords.latitude, pos.coords.longitude];
      meOverlay?.setMap(null);
      meOverlay = new kakao.maps.CustomOverlay({ position: LatLng(...me), content: '<div class="me-dot"></div>', zIndex: 200, map });
      $('locate').classList.add('on');
      map.setLevel(LOCATE_LEVEL);
      map.setCenter(LatLng(...me));
      state.sort = 'dist';
      renderSortButtons();
      renderList();
    },
    (err) => fail(err.code === 1 ? '위치 권한이 꺼져 있습니다. 브라우저 설정에서 허용하세요' : `위치를 가져오지 못했습니다 (${err.message})`),
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

function distKm(a, b) {
  const k = Math.PI / 180;
  const x = (b[1] - a[1]) * k * Math.cos(((a[0] + b[0]) / 2) * k);
  const y = (b[0] - a[0]) * k;
  return 6371 * Math.hypot(x, y);
}
const fmtDist = (km) => (km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(km < 10 ? 1 : 0)}km`);
const distTo = (p) => (me && p.y != null ? fmtDist(distKm(me, [p.y, p.x])) : '');

// ---------------------------------------------------------------------------
// 렌더링
// ---------------------------------------------------------------------------
// fit: true = 항상, 'auto' = 결과가 적거나 지역·찜을 골랐을 때만 결과 범위로 이동
function apply({ fit = false } = {}) {
  filtered = filterPlaces();
  buildIndex();
  listLimit = PAGE;
  const shouldFit = fit === true
    || (fit === 'auto' && filtered.length > 0 && (filtered.length <= SMALL_SET || state.sido || state.fav));
  if (shouldFit) fitToFiltered();
  renderPoints();
  renderChips();
  renderSummary();
  renderList();
  writeHash();
}

function inBounds() {
  const b = map.getBounds();
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  const [s, w, n, e] = [sw.getLat(), sw.getLng(), ne.getLat(), ne.getLng()];
  return filtered.filter((p) => p.y != null && p.y >= s && p.y <= n && p.x >= w && p.x <= e);
}

const stampHTML = (t, c) => `<span class="stamp" style="--c: var(--c-${t})"><i class="seal">${CERTS[t].seal}</i>${CERTS[t].short}${esc(gradeShort(t, c))}</span>`;
const stampsHTML = (p, cls = '') => `<span class="stamps ${cls}">${p.types.map((t) => stampHTML(t, p.certs[t])).join('')}</span>`;

function renderChips() {
  const favCount = PLACES.reduce((k, p) => k + isFav(p), 0);
  const hidden = hiddenFilterCount();
  const region = state.sigungu || state.sido;
  $('chips').innerHTML = [
    `<button type="button" class="chip plain" data-chip="filters" aria-haspopup="dialog">${ICON.filter}필터${hidden ? `<span class="count">${hidden}</span>` : ''}</button>`,
    ...CHIP_CERTS.filter((t) => AVAIL[t]).map((t) => `
      <button type="button" class="chip" data-chip="${t}" aria-pressed="${!!state[t]}" style="--c: var(--c-${t})">
        <i class="seal" style="--c: var(--c-${t})">${CERTS[t].seal}</i>${CERTS[t].short}
      </button>`),
    `<button type="button" class="chip fav" data-chip="fav" aria-pressed="${state.fav}"><span class="heart-ico" aria-hidden="true">♥</span>찜 ${favCount}</button>`,
    region ? `<button type="button" class="chip region" data-chip="region" aria-pressed="true" aria-label="${esc(region)} 지역 해제">${esc(region)} <span class="x" aria-hidden="true">✕</span></button>` : '',
  ].join('');
}

function renderSummary() {
  const visible = inBounds().length;
  $('summary').innerHTML = filtered.length
    ? `지도 안 <b>${fmt(visible)}</b>곳<span class="of">전체 ${fmt(filtered.length)}곳</span>`
    : '조건에 맞는 곳이 없습니다';
  $('filters-apply').textContent = filtered.length ? `${fmt(filtered.length)}곳 보기` : '조건에 맞는 곳 없음';

  const hints = [];
  const preds = axisPredicates(state);
  if (filtered.length === 0 && state.mode === 'and' && preds.length >= 2) {
    const orCount = filterPlaces({ ...state, mode: 'or' }).length;
    hints.push(`켜 둔 인증을 모두 가진 곳이 없습니다. <button type="button" data-action="to-or">하나라도 가진 곳 ${fmt(orCount)}곳 보기</button>`);
  }
  if (state.fav && filtered.length === 0) hints.push('찜한 곳이 없습니다. 가게를 열고 ♡ 찜을 누르세요.');
  if (state.br >= 0 || state.mich >= 0) hints.push('블루리본·미쉐린은 직접 입력한 가게만 걸립니다.');
  $('hints').innerHTML = hints.map((h) => `<p class="hint">${h}</p>`).join('');
}

function gradeShort(t, c) {
  if (c.g == null) return '';
  if (t === 'blueribbon') return ` ${+c.g ? `${c.g}개` : ''}`;
  if (t === 'michelin') return ` ${MICHELIN_LABEL[c.g] ?? c.g}`;
  if (t === 'hygiene') return ` ${'★'.repeat(+c.g)}`;
  return '';
}

function sortedForList() {
  const center = map.getCenter();
  const byDist = state.sort === 'dist' && me;
  const ref = byDist ? me : [center.getLat(), center.getLng()];
  const rows = inBounds().map((p) => ({ p, d: distKm(ref, [p.y, p.x]) }));
  // 좌표 없는 업소는 지도에 못 올리므로 지역·검색 조건이 있을 때만 목록 끝에 붙인다
  if (state.sido || state.q) rows.push(...filtered.filter((p) => p.y == null).map((p) => ({ p, d: Infinity })));
  if (byDist) rows.sort((a, b) => a.d - b.d);
  else rows.sort((a, b) => isFav(b.p) - isFav(a.p) || b.p.nc - a.p.nc || a.d - b.d);
  return rows;
}

function renderList() {
  const rows = sortedForList();
  const list = $('list');
  if (!rows.length) {
    list.innerHTML = filtered.length
      ? '<li class="empty">이 화면에는 없습니다. 지도를 옮기거나 축소해 보세요.</li>'
      : '<li class="empty">조건에 맞는 곳이 없습니다.<br><button type="button" class="btn" data-action="reset">필터 초기화</button></li>';
    $('more').hidden = true;
    return;
  }
  list.innerHTML = rows.slice(0, listLimit).map(({ p }) => {
    const sub = [p.c, p.g, p.y == null ? '좌표 없음' : ''].filter(Boolean).join(' · ');
    const dist = distTo(p);
    return `
    <li>
      <button type="button" class="item" data-id="${esc(p.i)}">
        <span class="item-top"><span class="item-name">${esc(p.n)}</span>${dist ? `<span class="item-dist">${dist}</span>` : ''}</span>
        <span class="item-sub">${esc(sub)}</span>
        ${stampsHTML(p)}
      </button>
      <button type="button" class="card-fav" data-fav="${esc(p.i)}" aria-pressed="${isFav(p)}" aria-label="${esc(p.n)} 찜">${isFav(p) ? '♥' : '♡'}</button>
    </li>`;
  }).join('');
  $('more').hidden = rows.length <= listLimit;
  $('more').textContent = `더 보기 (${fmt(rows.length - listLimit)}곳 남음)`;
}

function renderSortButtons() {
  document.querySelectorAll('[data-sort]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort));
  });
}

// ---------------------------------------------------------------------------
// 미리보기 카드 (모바일: 점 탭 → 카드 → 상세)
// ---------------------------------------------------------------------------
function showPreview(p) {
  selected = p;
  const sub = [p.c, p.g, distTo(p)].filter(Boolean).join(' · ');
  $('preview').innerHTML = `
    <button type="button" class="pv-main" data-action="open" aria-label="${esc(p.n)} 자세히 보기">
      <span class="pv-title"><span class="pv-name">${esc(p.n)}</span></span>
      ${stampsHTML(p)}
      <span class="pv-sub">${esc(sub)}</span>
    </button>
    <div class="pv-actions">
      <a class="btn primary-btn" href="${routeUrl(p)}" target="_blank" rel="noopener">${ICON.route}길찾기</a>
      <button type="button" class="btn ${isFav(p) ? 'fav-on' : ''}" data-action="fav" aria-pressed="${isFav(p)}" aria-label="찜">${isFav(p) ? ICON.heartOn : ICON.heart}</button>
      <button type="button" class="btn" data-action="open">자세히</button>
    </div>`;
  $('preview').hidden = false;
  setSheet('sheet-peek'); // 시트는 접어 두고 카드를 그 위에 띄운다
  renderPoints();
}

// keepSelection: 미리보기에서 상세로 넘어갈 때는 선택을 유지
function hidePreview({ keepSelection = false } = {}) {
  if ($('preview').hidden) return;
  $('preview').hidden = true;
  if (!keepSelection && $('detail').hidden) selected = null;
  renderPoints();
}

// ---------------------------------------------------------------------------
// 상세
// ---------------------------------------------------------------------------
const routeUrl = (p) => (p.y != null
  ? `https://map.kakao.com/link/to/${encodeURIComponent(p.n)},${p.y},${p.x}`
  : `https://map.kakao.com/link/search/${encodeURIComponent(`${p.n} ${p.g || ''}`)}`);

function certDetail(t, c) {
  switch (t) {
    case 'model': return c.d ? `${c.d.slice(0, 4)}년 ${+c.d.slice(5, 7)}월 지정` : '';
    case 'goodprice': return [c.m, c.p ? `${fmt(c.p)}원` : ''].filter(Boolean).join(' ');
    case 'blueribbon': return [`리본 ${c.g ?? '?'}개`, c.y?.length ? `${c.y.join(', ')} 선정` : ''].filter(Boolean).join(' · ');
    case 'michelin': return [MICHELIN_LABEL[c.g] ?? c.g, c.y?.[0]].filter(Boolean).join(' · ');
    case 'hygiene': return c.g ? `${'★'.repeat(+c.g)} ${HYGIENE_LABEL[c.g] ?? ''}` : '';
    case 'safe': return c.d ? `${c.d} 지정` : '';
    default: return '';
  }
}

function detailActionsHTML(p) {
  const fav = isFav(p);
  return `
    <div class="actions">
      <a class="action primary-act" href="${routeUrl(p)}" target="_blank" rel="noopener">${ICON.route}길찾기</a>
      <a class="action" ${p.t ? `href="tel:${esc(p.t)}"` : 'aria-disabled="true"'}>${ICON.phone}전화</a>
      <button type="button" class="action ${fav ? 'fav-on' : ''}" data-action="fav" aria-pressed="${fav}">${fav ? ICON.heartOn : ICON.heart}${fav ? '찜함' : '찜'}</button>
      <button type="button" class="action" data-action="share">${ICON.share}공유</button>
    </div>`;
}

function showDetail(p, { pan = true } = {}) {
  const wasOpen = !$('detail').hidden;
  hidePreview({ keepSelection: true });
  selected = p;
  const query = encodeURIComponent(`${p.n} ${p.g || ''}`.trim());
  const meta = [p.c, [p.sidoName, p.g].filter(Boolean).join(' '), distTo(p)].filter(Boolean).join(' · ');
  $('detail').innerHTML = `
    <div class="detail-top">
      <button type="button" class="back" data-action="back">${ICON.back}목록</button>
    </div>
    <h2>${esc(p.n)}</h2>
    ${stampsHTML(p, 'lg')}
    <div class="meta">${esc(meta)}</div>
    <div id="detail-actions">${detailActionsHTML(p)}</div>

    <h3 class="section-title">위치</h3>
    <div class="addr">
      <p>${esc(p.a || '주소 없음')}${p.t ? `<a class="tel" href="tel:${esc(p.t)}">${esc(p.t)}</a>` : ''}</p>
      ${p.a ? '<button type="button" class="link" data-action="copy">주소 복사</button>' : ''}
    </div>

    <h3 class="section-title">인증 정보</h3>
    <ul class="certs">
      ${p.types.map((t) => {
        const info = certDetail(t, p.certs[t]);
        return `
        <li class="cert" style="--c: var(--c-${t})">
          <i class="seal">${CERTS[t].seal}</i>
          <div class="cert-name">${CERTS[t].label}</div>
          <div class="cert-about">${CERTS[t].about}</div>
          ${info ? `<div class="cert-info">${esc(info)}</div>` : ''}
          <div class="cert-date">데이터 기준일 ${esc(DATA.sources[t] ?? '-')}</div>
        </li>`;
      }).join('')}
    </ul>
    <div class="ext-links">
      <a href="https://map.naver.com/p/search/${query}" target="_blank" rel="noopener">네이버지도에서 보기</a>
      <a href="https://map.kakao.com/link/search/${query}" target="_blank" rel="noopener">카카오맵에서 보기</a>
    </div>`;
  $('list-view').hidden = true;
  $('detail').hidden = false;
  $('detail').scrollTop = 0;
  // 폰 뒤로가기로 상세를 닫을 수 있게
  if (!wasOpen) history.pushState({ ui: 'detail' }, '', location.href);
  if (isMobile() && !panel.classList.contains('sheet-half')) setSheet('sheet-half');
  if (pan) {
    if (!viewBeforeDetail) viewBeforeDetail = { center: map.getCenter(), level: map.getLevel() };
    // 시트 높이 전환(.22s)이 끝난 뒤 가려지는 만큼 보정
    setTimeout(() => focusPlace(p), isMobile() ? 240 : 0);
  }
  renderPoints();
}

// 사용자가 "목록"을 눌렀을 때: 상세를 열며 쌓은 history 를 되돌려 popstate 에서 닫는다
function closeDetail() {
  if (history.state?.ui === 'detail') history.back();
  else hideDetail();
}

function hideDetail({ restore = true } = {}) {
  const wasOpen = !$('detail').hidden;
  selected = null;
  $('detail').hidden = true;
  $('list-view').hidden = false;
  if (wasOpen && restore && viewBeforeDetail) {
    map.setLevel(viewBeforeDetail.level);
    map.setCenter(viewBeforeDetail.center);
  }
  viewBeforeDetail = null;
  if (map) renderPoints();
  renderList();
}

function toggleFav(p) {
  if (isFav(p)) favs.delete(p.i);
  else favs.set(p.i, { n: p.n, a: p.a || '', at: new Date().toISOString().slice(0, 10) });
  saveFavs();
  toast(isFav(p) ? `${p.n} 찜했습니다` : `${p.n} 찜을 뺐습니다`);
  if (!$('detail').hidden && selected === p) $('detail-actions').innerHTML = detailActionsHTML(p);
  if (!$('preview').hidden && selected === p) showPreview(p);
  if (state.fav) {
    filtered = filterPlaces();
    buildIndex();
  }
  renderChips();
  renderSummary();
  renderPoints();
  if ($('detail').hidden) renderList();
  writeHash();
}

async function sharePlace(p) {
  const url = p.y != null ? `https://map.kakao.com/link/map/${encodeURIComponent(p.n)},${p.y},${p.x}` : routeUrl(p);
  const text = [p.n, p.types.map((t) => CERTS[t].label).join(' · '), p.a].filter(Boolean).join('\n');
  if (navigator.share) {
    try {
      await navigator.share({ title: p.n, text, url });
    } catch { /* 사용자가 공유 창을 닫음 */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('가게 정보를 복사했습니다');
  } catch {
    toast('복사하지 못했습니다');
  }
}

// ---------------------------------------------------------------------------
// 필터 화면 (칩에 없는 조건: 조합 방식·지역·등급형 인증·찜 백업)
// ---------------------------------------------------------------------------
let regionBase = [];
function countIn(t) {
  return regionBase.reduce((n, p) => n + (p.certs[t] ? 1 : 0), 0);
}

// 데이터가 없는 인증(아직 연동 전)은 필터에서 숨긴다. 데이터가 들어오면 자동으로 나타난다.
function switchRow(t, note = '') {
  if (!AVAIL[t]) return '';
  return `
    <div class="row" style="--c: var(--c-${t})">
      <label class="label" for="f-${t}"><i class="seal">${CERTS[t].seal}</i>${CERTS[t].label}</label>
      <span class="count">${fmt(countIn(t))}</span>
      <span class="switch"><input type="checkbox" id="f-${t}" data-key="${t}" ${state[t] ? 'checked' : ''}><span></span></span>
    </div>${note ? `<p class="note">${note}</p>` : ''}`;
}

function segRow(t, key, options, note = '') {
  if (!AVAIL[t]) return '';
  return `
    <div class="row" style="--c: var(--c-${t})">
      <span class="label"><i class="seal">${CERTS[t].seal}</i>${CERTS[t].label}</span>
      <span class="count">${fmt(countIn(t))}</span>
    </div>
    <div class="seg wide" role="group" aria-label="${CERTS[t].label}" data-key="${key}">
      ${options.map(([v, label]) => `<button type="button" data-val="${v}" aria-pressed="${state[key] === v}">${label}</button>`).join('')}
    </div>${note ? `<p class="note">${note}</p>` : ''}`;
}

// 안에 보일 항목이 하나도 없으면 구역째 숨김
const axisHTML = (title, rows) => (rows.trim() ? `<div class="axis"><h3>${title}</h3>${rows}</div>` : '');

function renderFilters() {
  regionBase = PLACES.filter(commonPredicate(state));
  const sigungus = [...new Set(PLACES.filter((p) => p.sidoName === state.sido && p.g).map((p) => p.g))]
    .sort((a, b) => a.localeCompare(b, 'ko'));
  const manualNote = '직접 입력한 가게만 걸립니다.';
  const bryRow = state.br >= 0 && AVAIL.blueribbon ? `
        <div class="row"><label class="label" for="f-bry">최소 선정 연수</label>
          <select id="f-bry" data-key="bry" style="width:auto">${[0, 2, 3, 5, 10].map((n) => `<option value="${n}" ${state.bry === n ? 'selected' : ''}>${n ? `${n}년 이상` : '상관없음'}</option>`).join('')}</select>
        </div>` : '';

  const focusedKey = document.activeElement?.dataset?.key;
  $('filters-body').innerHTML = `
    <div class="axis">
      <h3>인증을 여러 개 켰을 때</h3>
      <div class="seg wide" role="group" aria-label="조합 방식" data-key="mode">
        <button type="button" data-val="and" aria-pressed="${state.mode === 'and'}">모두 가진 곳</button>
        <button type="button" data-val="or" aria-pressed="${state.mode === 'or'}">하나라도 가진 곳</button>
      </div>
    </div>
    ${axisHTML('맛 · 품질', `
      ${segRow('blueribbon', 'br', [[-1, '끔'], [0, '선정'], [1, '1개+'], [2, '2개+'], [3, '3개']], manualNote)}
      ${bryRow}
      ${segRow('michelin', 'mich', [[-1, '끔'], [0, '선정'], [1, '빕+'], [2, '1★+'], [3, '2★+'], [4, '3★']], manualNote)}
      ${switchRow('model')}`)}
    ${axisHTML('위생', `
      ${segRow('hygiene', 'hygiene', [[0, '끔'], [1, '★1+'], [2, '★2+'], [3, '★3']])}
      ${switchRow('safe')}`)}
    ${axisHTML('가격', switchRow('goodprice'))}
    ${axisHTML('업력', switchRow('centennial'))}
    <div class="axis">
      <h3>지역</h3>
      <div class="selects">
        <select data-key="sido" aria-label="시도">
          <option value="">전국</option>
          ${DATA.sido.map((s) => `<option ${state.sido === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <select data-key="sigungu" aria-label="시군구" ${state.sido ? '' : 'disabled'}>
          <option value="">${state.sido ? '전체' : '시도 먼저'}</option>
          ${sigungus.map((g) => `<option ${state.sigungu === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="axis">
      <h3>찜 목록 백업</h3>
      <p class="note" style="margin:0 0 10px">찜은 이 브라우저에만 저장됩니다. 폰을 바꾸거나 다른 기기에서 쓰려면 파일로 옮기세요.</p>
      <div class="fav-io">
        <button type="button" class="btn" data-action="export">내보내기 (${favs.size}곳)</button>
        <label class="btn">가져오기<input type="file" accept="application/json,.json" data-action="import" hidden></label>
      </div>
    </div>`;
  // 다시 그려도 키보드 포커스 유지
  if (focusedKey) $('filters-body').querySelector(`input[data-key="${focusedKey}"], select[data-key="${focusedKey}"]`)?.focus();
}

function setFilter(key, raw) {
  const def = DEFAULTS[key];
  state[key] = typeof def === 'number' ? Number(raw) : typeof def === 'boolean' ? Boolean(raw) : String(raw);
  if (key === 'sido') state.sigungu = '';
  if (key === 'br' && state.br < 0) state.bry = 0;
  renderFilters();
  hidePreview();
  if (!$('detail').hidden) {
    if (history.state?.ui === 'detail') history.replaceState(null, '', location.href);
    hideDetail({ restore: false });
  }
  apply({ fit: key === 'sido' || key === 'sigungu' ? true : 'auto' });
}

function openFilters(open) {
  const el = $('filters');
  if (open === el.classList.contains('open')) return;
  el.classList.toggle('open', open);
  if (open) {
    renderFilters();
    history.pushState({ ui: 'filters' }, '', location.href);
    el.querySelector('#filters-close').focus();
  }
}
function closeFilters() {
  if (history.state?.ui === 'filters') history.back();
  else openFilters(false);
}

// ---------------------------------------------------------------------------
// 하단 시트 (모바일)
// ---------------------------------------------------------------------------
const SHEETS = ['sheet-peek', 'sheet-half', 'sheet-full'];
function setSheet(name) {
  panel.classList.remove(...SHEETS);
  panel.classList.add(name);
}

function initSheet() {
  const handle = $('sheet-handle');
  let startY = 0;
  let startH = 0;
  let moved = false;
  handle.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    startH = panel.offsetHeight;
    moved = false;
    panel.classList.add('dragging');
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!panel.classList.contains('dragging')) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 4) moved = true;
    const h = Math.min(window.innerHeight - 64, Math.max(90, startH - dy));
    panel.style.setProperty('--sheet-h', `${h}px`);
  });
  handle.addEventListener('pointerup', () => {
    panel.classList.remove('dragging');
    const h = panel.offsetHeight;
    panel.style.removeProperty('--sheet-h');
    if (!moved) {
      setSheet(panel.classList.contains('sheet-peek') ? 'sheet-half' : 'sheet-peek');
      return;
    }
    const snaps = { 'sheet-peek': SHEET_PEEK, 'sheet-half': window.innerHeight * 0.5, 'sheet-full': window.innerHeight - 64 };
    const best = Object.entries(snaps).sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))[0][0];
    setSheet(best);
  });
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const i = SHEETS.findIndex((s) => panel.classList.contains(s));
    setSheet(SHEETS[(i + 1) % SHEETS.length]);
  });
}

// PC: 사이드바 상단(검색+칩) 높이만큼 목록을 내린다
function syncTopbarHeight() {
  const h = $('topbar').offsetHeight;
  document.documentElement.style.setProperty('--topbar-h', `${h}px`);
}

// ---------------------------------------------------------------------------
// URL 해시 (필터·지도 위치 보존 → 북마크하면 그 조건 그대로)
// ---------------------------------------------------------------------------
function writeHash() {
  const sp = new URLSearchParams();
  for (const [k, def] of Object.entries(DEFAULTS)) {
    if (state[k] !== def) sp.set(k, typeof def === 'boolean' ? '1' : state[k]);
  }
  const c = map.getCenter();
  sp.set('v', `${c.getLat().toFixed(5)},${c.getLng().toFixed(5)},${map.getLevel()}`);
  // 상세·필터를 열며 쌓은 history state 는 유지한다 (뒤로가기 동작)
  history.replaceState(history.state, '', `#${sp}`);
}

function readHash() {
  const sp = new URLSearchParams(location.hash.slice(1));
  for (const [k, def] of Object.entries(DEFAULTS)) {
    if (!sp.has(k)) continue;
    const v = sp.get(k);
    if (typeof def === 'number') state[k] = Number.isFinite(Number(v)) ? Number(v) : def;
    else if (typeof def === 'boolean') state[k] = v === '1';
    else state[k] = v;
  }
  const v = sp.get('v')?.split(',').map(Number);
  const valid = v?.length === 3 && v.every(Number.isFinite) && v[2] >= 1 && v[2] <= 14;
  return valid ? { lat: v[0], lng: v[1], level: v[2] } : { ...KOREA };
}

// ---------------------------------------------------------------------------
// 이벤트
// ---------------------------------------------------------------------------
function bindEvents() {
  let qTimer;
  $('q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      state.q = e.target.value.trim();
      hidePreview();
      if (!$('detail').hidden) hideDetail({ restore: false });
      apply({ fit: state.q.length >= 2 ? 'auto' : false });
    }, 200);
  });
  $('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

  $('chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chip]');
    if (!chip) return;
    const k = chip.dataset.chip;
    if (k === 'filters') openFilters(true);
    else if (k === 'region') {
      state.sigungu = '';
      setFilter('sido', '');
    } else setFilter(k, !state[k]);
  });

  $('filters-close').addEventListener('click', closeFilters);
  $('filters-apply').addEventListener('click', closeFilters);
  $('reset').addEventListener('click', () => {
    Object.assign(state, { ...DEFAULTS, q: state.q, sort: state.sort });
    renderFilters();
    apply();
  });
  $('filters-body').addEventListener('click', (e) => {
    if (e.target.closest('[data-action="export"]')) {
      exportFavs();
      return;
    }
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    setFilter(btn.closest('[data-key]').dataset.key, btn.dataset.val);
  });
  $('filters-body').addEventListener('change', (e) => {
    if (e.target.dataset.action === 'import') {
      if (e.target.files[0]) importFavs(e.target.files[0]);
      return;
    }
    const el = e.target.closest('[data-key]');
    if (!el) return;
    setFilter(el.dataset.key, el.type === 'checkbox' ? el.checked : el.value);
  });

  $('hints').addEventListener('click', (e) => {
    if (e.target.closest('[data-action="to-or"]')) setFilter('mode', 'or');
  });

  document.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.sort === 'dist' && !me) {
      locate();
      return;
    }
    state.sort = b.dataset.sort;
    renderSortButtons();
    renderList();
    writeHash();
  }));

  $('list').addEventListener('click', (e) => {
    const favBtn = e.target.closest('[data-fav]');
    if (favBtn) {
      const p = filtered.find((x) => x.i === favBtn.dataset.fav);
      if (p) toggleFav(p);
      return;
    }
    if (e.target.closest('[data-action="reset"]')) {
      $('reset').click();
      return;
    }
    const item = e.target.closest('[data-id]');
    const p = item && filtered.find((x) => x.i === item.dataset.id);
    if (p) showDetail(p);
  });
  // PC: 목록에 마우스를 올리면 지도 점을 강조
  $('list').addEventListener('mouseover', (e) => {
    const item = e.target.closest('[data-id]');
    document.querySelectorAll('.pin.hover').forEach((el) => el.classList.remove('hover'));
    const p = item && filtered.find((x) => x.i === item.dataset.id);
    p?._ov?.getContent().classList.add('hover');
  });
  $('list').addEventListener('mouseleave', () => document.querySelectorAll('.pin.hover').forEach((el) => el.classList.remove('hover')));
  $('more').addEventListener('click', () => { listLimit += PAGE; renderList(); });

  $('detail').addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'back') closeDetail();
    else if (action === 'fav' && selected) toggleFav(selected);
    else if (action === 'share' && selected) sharePlace(selected);
    else if (action === 'copy' && selected) {
      navigator.clipboard?.writeText(selected.a).then(() => toast('주소를 복사했습니다'), () => toast('복사하지 못했습니다'));
    }
  });
  $('preview').addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!selected) return;
    if (action === 'open') showDetail(selected, { pan: false });
    else if (action === 'fav') toggleFav(selected);
  });
  $('locate').addEventListener('click', () => locate());

  // 지도 빈 곳을 누르면 미리보기 닫기
  kakao.maps.event.addListener(map, 'click', hidePreview);
  // 지도 이동·확대가 끝나면 점·목록·개수 갱신 (데이터가 브라우저에 있어 "이 지역 재검색" 없이 바로)
  kakao.maps.event.addListener(map, 'idle', () => {
    listLimit = PAGE;
    renderPoints();
    renderSummary();
    if ($('detail').hidden) renderList();
    writeHash();
  });

  // 폰·브라우저 뒤로가기: 열린 필터·상세부터 닫는다
  window.addEventListener('popstate', () => {
    const ui = history.state?.ui;
    if (ui !== 'filters' && $('filters').classList.contains('open')) openFilters(false);
    if (ui !== 'detail' && !$('detail').hidden) hideDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('filters').classList.contains('open')) closeFilters();
    else if (!$('preview').hidden) hidePreview();
    else if (!$('detail').hidden) closeDetail();
  });

  new ResizeObserver(syncTopbarHeight).observe($('topbar'));
}

// ---------------------------------------------------------------------------
async function main() {
  initSheet();
  try {
    await Promise.all([loadData(), loadKakao()]);
  } catch (err) {
    $('summary').textContent = err.message;
    return;
  }
  const hadView = new URLSearchParams(location.hash.slice(1)).has('v');
  initMap(readHash());
  dropUnavailableFilters();
  $('q').value = state.q;
  renderSortButtons();
  bindEvents();
  syncTopbarHeight();
  apply();
  // 북마크로 위치가 정해진 경우가 아니면 처음엔 내 주변부터
  if (!hadView) locate({ silent: true });
}

main();
