function parseTimelineDate(text) {
  const m = String(text).trim().match(/^(\d{4})(?:-(\d{1,2}))?/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = m[2] ? parseInt(m[2], 10) : 6;
  return y + (mo - 1) / 12;
}

function yFromYear(yt, timeline) {
  const items = [...timeline.querySelectorAll('.timeline-item')];
  const pts = items
    .map((el) => ({
      t: parseTimelineDate(el.querySelector('.timeline-date').textContent),
      y: el.offsetTop,
      el,
    }))
    .filter((p) => p.t != null)
    .sort((a, b) => a.t - b.t);

  if (!pts.length) return 0;

  const last = pts[pts.length - 1];
  pts.push({
    t: last.t + 12,
    y: timeline.scrollHeight,
  });

  if (yt <= pts[0].t) return pts[0].y;

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (yt <= b.t) {
      const ratio = (b.t - a.t) === 0 ? 0 : (yt - a.t) / (b.t - a.t);
      return a.y + ratio * (b.y - a.y);
    }
  }

  return pts[pts.length - 1].y;
}

function parseBirthDateFromTimelineText(text) {
  const m = String(text).trim().match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (!m) return new Date(2005, 2, 8);
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const day = m[3] ? parseInt(m[3], 10) : 8;
  return new Date(y, mo - 1, day);
}

function decimalAgeYearsFromBirth(birthDate) {
  return (Date.now() - birthDate.getTime()) / (365.2425 * 24 * 60 * 60 * 1000);
}

function rangesOverlap(aTop, aBottom, bTop, bBottom) {
  return !(aBottom <= bTop || aTop >= bBottom);
}

function layoutExperienceEmojiRail() {
  const timeline = document.querySelector('#timelineBox .timeline');
  const rail = document.getElementById('activityRail');
  if (!timeline || !rail) return;

  const birthEl = timeline.querySelector('.timeline-item .timeline-date');
  const birthT = birthEl ? parseTimelineDate(birthEl.textContent) : null;
  if (birthT == null) return;

  const birthDate = birthEl
    ? parseBirthDateFromTimelineText(birthEl.textContent)
    : new Date(2005, 2, 8);

  const spans = [...rail.querySelectorAll('.activity-span')];
  const metrics = spans.map((span) => {
    const startAge = parseFloat(span.dataset.startAge);
    const endNow =
      span.dataset.endNow === 'true' || span.dataset.endNow === '';

    let endAgeNum = parseFloat(span.dataset.endAge);
    if (endNow) {
      endAgeNum = decimalAgeYearsFromBirth(birthDate);
    } else if (Number.isNaN(endAgeNum)) {
      return null;
    }

    if (Number.isNaN(startAge)) return null;

    const y1 = yFromYear(birthT + startAge, timeline);
    let y2;
    if (endNow) {
      // 「現在」はレールの一番下まで伸ばす（内挿の都合で途中止まりを防ぐ）
      y2 = timeline.scrollHeight;
    } else {
      y2 = yFromYear(birthT + endAgeNum + 1, timeline);
    }

    const topPx = Math.min(y1, y2);
    const rawH = Math.abs(y2 - y1);
    const lineScale = parseFloat(span.dataset.lineScale);
    const scale =
      Number.isFinite(lineScale) && lineScale > 0 ? lineScale : 1;
    const lineMin = parseFloat(span.dataset.lineMin);
    const minH =
      Number.isFinite(lineMin) && lineMin >= 0 ? lineMin : 36;
    const h = Math.max(minH, rawH * scale);
    return { span, top: topPx, bottom: topPx + h };
  }).filter(Boolean);

  /** @type {Array<Array<{ top: number; bottom: number }>>} */
  const columns = [];

  metrics.sort((a, b) => a.top - b.top);

  metrics.forEach((m) => {
    let slot = 0;
    while (slot < 24) {
      const intervals = columns[slot] || [];
      const clash = intervals.some((other) =>
        rangesOverlap(m.top, m.bottom, other.top, other.bottom)
      );
      if (!clash) break;
      slot += 1;
    }
    if (!columns[slot]) columns[slot] = [];
    columns[slot].push({ top: m.top, bottom: m.bottom });
    m.slot = slot;
  });

  const maxSlot = metrics.reduce((mx, x) => Math.max(mx, x.slot), 0);
  const railWidth = rail.clientWidth;

  metrics.forEach((m) => {
    const count = maxSlot + 1;
    const leftPx = ((m.slot + 1) / (count + 1)) * railWidth;

    m.span.style.top = `${m.top}px`;
    m.span.style.height = `${m.bottom - m.top}px`;
    m.span.style.left = `${leftPx}px`;
    m.span.style.transform = 'translateX(-50%)';
    m.span.style.zIndex = String(2 + m.slot);
  });
}

/** Experience タイムラインのスクロール領域を、#start-point（例: 大学入学）が上端付近に来る位置にする */
function scrollExperienceTimelineToStartPoint() {
  const container = document.getElementById('timelineBox');
  const target = document.getElementById('start-point');
  if (!container || !target) return;

  const cTop = container.getBoundingClientRect().top;
  const tTop = target.getBoundingClientRect().top;
  container.scrollTop += tTop - cTop;
}

const ACTIVITY_POINTER_TOP = 'is-pointer-top';

function pointInRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** 重なる列があるとき、カーソルに最も近い（横方向の中心距離が短い）列を選ぶ */
function pickActivitySpanUnderCursor(rail, clientX, clientY) {
  const spans = [...rail.querySelectorAll('.activity-span')];
  const hits = [];

  for (const span of spans) {
    const head = span.querySelector('.activity-span__head');
    const line = span.querySelector('.activity-span__line');
    if (!head || !line) continue;

    const hr = head.getBoundingClientRect();
    const lr = line.getBoundingClientRect();
    if (!pointInRect(clientX, clientY, hr) && !pointInRect(clientX, clientY, lr)) {
      continue;
    }

    const box = span.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    hits.push({ span, dist: Math.abs(clientX - cx) });
  }

  if (hits.length === 0) return null;
  hits.sort((a, b) => a.dist - b.dist);
  return hits[0].span;
}

function setupActivityRailPointerTop() {
  const rail = document.getElementById('activityRail');
  if (!rail) return;

  function syncPointerTopLayer(clientX, clientY) {
    const chosen = pickActivitySpanUnderCursor(rail, clientX, clientY);
    rail.querySelectorAll(`.${ACTIVITY_POINTER_TOP}`).forEach((el) => {
      el.classList.remove(ACTIVITY_POINTER_TOP);
    });
    if (chosen) chosen.classList.add(ACTIVITY_POINTER_TOP);
  }

  /* 同期的に z-index を変えてからホバー判定されるよう、描画より先に列を手前へ */
  rail.addEventListener('mousemove', (e) => {
    syncPointerTopLayer(e.clientX, e.clientY);
  });

  rail.addEventListener('mouseleave', () => {
    rail.querySelectorAll(`.${ACTIVITY_POINTER_TOP}`).forEach((el) => {
      el.classList.remove(ACTIVITY_POINTER_TOP);
    });
  });
}

let railResizeTimer;
window.addEventListener('load', () => {
  layoutExperienceEmojiRail();
  requestAnimationFrame(() => {
    scrollExperienceTimelineToStartPoint();
  });
  setupActivityRailPointerTop();
  initWorksCards();
  initHobbyGalleries();
});

window.addEventListener('resize', () => {
  clearTimeout(railResizeTimer);
  railResizeTimer = setTimeout(() => layoutExperienceEmojiRail(), 120);
});

document.querySelectorAll('.accordion-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const content = btn.nextElementSibling;
    content.style.display = content.style.display === 'block' ? 'none' : 'block';
  });
});

document.querySelectorAll('.hobby-card__trigger').forEach((btn) => {
  btn.addEventListener('click', () => {
    const panelId = btn.getAttribute('aria-controls');
    const panel = document.getElementById(panelId);
    const wasOpen = btn.getAttribute('aria-expanded') === 'true';

    document.querySelectorAll('.hobby-card__trigger').forEach((other) => {
      const id = other.getAttribute('aria-controls');
      const p = document.getElementById(id);
      other.setAttribute('aria-expanded', 'false');
      if (p) p.hidden = true;
    });

    if (!wasOpen && panel) {
      btn.setAttribute('aria-expanded', 'true');
      panel.hidden = false;
    }
  });
});

/** 相対パスの各セグメントを encode して結合（日本語・空白を含むファイル名対応） */
function encodeUtf8Path(relPath) {
  return relPath
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

function encodedPathToAbsoluteHref(encodedSegmentsPath) {
  try {
    return new URL(encodedSegmentsPath, window.location.href).href;
  } catch {
    return encodedSegmentsPath;
  }
}

/** カード内の embed / 別タブリンクに同じ PDF を反映 */
function applyPdfToCard(card, encodedPath) {
  const href = encodedPathToAbsoluteHref(encodedPath);
  card.querySelectorAll('.works-pdf-tab').forEach((a) => {
    if (a) a.href = href;
  });
  card.querySelectorAll('.works-pdf-embed').forEach((emb) => {
    if (emb) emb.src = href;
  });
}

/** Works カード上部プレビューのサムネイル（data-thumbs と PDF を対応） */
function applyPreviewThumb(card, index) {
  const thumbs = card.__thumbUrls;
  const img = card.querySelector('.works-card__preview .works-card__thumb');
  if (!img || !thumbs || thumbs.length === 0) return;
  const i = Math.min(Math.max(0, index), thumbs.length - 1);
  const path = thumbs[i];
  if (!path) {
    card.classList.remove('works-card--has-thumb');
    img.removeAttribute('src');
    return;
  }
  card.classList.remove('works-card--thumb-missing');
  img.src = encodedPathToAbsoluteHref(path);
  card.classList.add('works-card--has-thumb');
}

function bindWorksThumbFallback(card) {
  const img = card.querySelector('.works-card__preview .works-card__thumb');
  if (!img || img.dataset.thumbFallbackBound) return;
  img.dataset.thumbFallbackBound = '1';

  if (img.getAttribute('src')) {
    card.classList.add('works-card--has-thumb');
  }

  img.addEventListener('load', () => {
    card.classList.add('works-card--has-thumb');
    card.classList.remove('works-card--thumb-missing');
  });

  img.addEventListener('error', () => {
    card.classList.remove('works-card--has-thumb');
    card.classList.add('works-card--thumb-missing');
    img.removeAttribute('src');
  });
}

function setWorkCarouselIndex(card, index) {
  const urls = card.__pdfUrls;
  if (!urls || urls.length === 0) return;
  const n = urls.length;
  const i = ((index % n) + n) % n;
  card.__slideIndex = i;
  applyPdfToCard(card, urls[i]);
  applyPreviewThumb(card, i);

  card.querySelectorAll('.works-card__idx, .works-panel__idx').forEach((el) => {
    if (el) el.textContent = String(i + 1);
  });

  const atStart = i === 0;
  const atEnd = i === n - 1;
  card.querySelectorAll('.works-card__arrow--prev, .works-panel__arrow--prev').forEach((b) => {
    if (b) b.disabled = atStart;
  });
  card.querySelectorAll('.works-card__arrow--next, .works-panel__arrow--next').forEach((b) => {
    if (b) b.disabled = atEnd;
  });
}

function openWorksCard(btn) {
  const panelId = btn.getAttribute('aria-controls');
  const panel = document.getElementById(panelId);
  document.querySelectorAll('.works-card__trigger').forEach((other) => {
    if (other === btn) return;
    const id = other.getAttribute('aria-controls');
    const p = document.getElementById(id);
    other.setAttribute('aria-expanded', 'false');
    if (p) p.hidden = true;
  });
  btn.setAttribute('aria-expanded', 'true');
  if (panel) panel.hidden = false;
}

function toggleWorksCard(btn) {
  const panelId = btn.getAttribute('aria-controls');
  const panel = document.getElementById(panelId);
  const wasOpen = btn.getAttribute('aria-expanded') === 'true';

  document.querySelectorAll('.works-card__trigger').forEach((other) => {
    const id = other.getAttribute('aria-controls');
    const p = document.getElementById(id);
    other.setAttribute('aria-expanded', 'false');
    if (p) p.hidden = true;
  });

  if (!wasOpen && panel) {
    btn.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
  }
}

function initWorksCards() {
  if (window.location.protocol === 'file:') {
    document.getElementById('works-protocol-hint')?.removeAttribute('hidden');
  }

  document.querySelectorAll('.works-card').forEach((card) => {
    const raw = card.getAttribute('data-pdfs');
    if (!raw) return;
    const paths = raw
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    const urls = paths.map((p) => encodeUtf8Path(p));
    card.__pdfUrls = urls;
    card.__slideIndex = 0;

    const rawThumbs = card.getAttribute('data-thumbs');
    if (rawThumbs) {
      const thumbPaths = rawThumbs
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((p) => encodeUtf8Path(p));
      card.__thumbUrls = thumbPaths;
      bindWorksThumbFallback(card);
    }

    if (urls.length === 1) {
      applyPdfToCard(card, urls[0]);
      applyPreviewThumb(card, 0);
      return;
    }

    card.querySelectorAll('.works-card__total, .works-panel__total').forEach((el) => {
      if (el) el.textContent = String(urls.length);
    });
    setWorkCarouselIndex(card, 0);

    const step = (delta) => {
      setWorkCarouselIndex(card, card.__slideIndex + delta);
    };

    card.querySelector('.works-card__arrow--prev')?.addEventListener('click', (e) => {
      e.stopPropagation();
      step(-1);
    });
    card.querySelector('.works-card__arrow--next')?.addEventListener('click', (e) => {
      e.stopPropagation();
      step(1);
    });
    card.querySelector('.works-panel__arrow--prev')?.addEventListener('click', (e) => {
      e.stopPropagation();
      step(-1);
    });
    card.querySelector('.works-panel__arrow--next')?.addEventListener('click', (e) => {
      e.stopPropagation();
      step(1);
    });
  });

  document.querySelectorAll('.works-card__trigger').forEach((btn) => {
    btn.addEventListener('click', () => toggleWorksCard(btn));
  });

  document.querySelectorAll('.works-card__preview').forEach((pv) => {
    pv.addEventListener('click', (e) => {
      if (e.target.closest('.works-card__arrow')) return;
      const card = pv.closest('.works-card');
      const btn = card?.querySelector('.works-card__trigger');
      if (!btn) return;
      if (btn.getAttribute('aria-expanded') === 'true') return;
      openWorksCard(btn);
    });
  });
}

function applyHobbySlide(card, index) {
  const urls = card.__hobbyUrls;
  if (!urls || urls.length === 0) return;
  const n = urls.length;
  const i = ((index % n) + n) % n;
  card.__photoIdx = i;

  const encoded = urls[i];
  const href = encodedPathToAbsoluteHref(encoded);

  const cardImg = card.querySelector('.hobby-card__photo');
  if (cardImg) {
    cardImg.src = href;
  }

  const panelGalImg = card.querySelector('.hobby-panel__gallery--multi .hobby-panel__photo');
  if (panelGalImg) {
    panelGalImg.src = href;
  }

  card.querySelectorAll('.hobby-card__photo-idx').forEach((el) => {
    if (el) el.textContent = String(i + 1);
  });
  card.querySelectorAll('.hobby-card__photo-total').forEach((el) => {
    if (el) el.textContent = String(n);
  });
  card.querySelectorAll('.hobby-panel__photo-idx').forEach((el) => {
    if (el) el.textContent = String(i + 1);
  });
  card.querySelectorAll('.hobby-panel__photo-total').forEach((el) => {
    if (el) el.textContent = String(n);
  });

  const atStart = i === 0;
  const atEnd = i === n - 1;
  card.querySelectorAll('.hobby-card__arrow--prev, .hobby-panel__arrow--prev').forEach((b) => {
    if (b) b.disabled = atStart;
  });
  card.querySelectorAll('.hobby-card__arrow--next, .hobby-panel__arrow--next').forEach((b) => {
    if (b) b.disabled = atEnd;
  });
}

function initHobbyGalleries() {
  document.querySelectorAll('.hobby-card[data-hobby-images]').forEach((card) => {
    const raw = card.getAttribute('data-hobby-images');
    if (!raw) return;
    const paths = raw
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((p) => encodeUtf8Path(p));
    card.__hobbyUrls = paths;
    card.__photoIdx = 0;

    const n = paths.length;
    const previewMeta = card.querySelector('.hobby-card__photo-meta');
    if (previewMeta) previewMeta.hidden = n <= 1;

    card.querySelectorAll('.hobby-card__arrow').forEach((b) => {
      if (b) b.hidden = n <= 1;
    });

    const panelGal = card.querySelector('.hobby-panel__gallery--multi');
    if (panelGal) {
      panelGal.querySelectorAll('.hobby-panel__arrow').forEach((b) => {
        if (b) b.hidden = n <= 1;
      });
    }

    applyHobbySlide(card, 0);

    const step = (delta) => applyHobbySlide(card, card.__photoIdx + delta);

    card.querySelector('.hobby-card__arrow--prev')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      step(-1);
    });
    card.querySelector('.hobby-card__arrow--next')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      step(1);
    });
    panelGal?.querySelector('.hobby-panel__arrow--prev')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      step(-1);
    });
    panelGal?.querySelector('.hobby-panel__arrow--next')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      step(1);
    });
  });
}
