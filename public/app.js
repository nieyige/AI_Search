const $ = (id) => document.getElementById(id);
const form = $("form"), input = $("q"), goBtn = $("go");
const stepsEl = $("steps"), reportEl = $("report"), errorEl = $("error");
const sourcesBox = $("sources"), sourceList = $("source-list"), placeholder = $("placeholder");

let es = null;          // current EventSource
let roundEls = {};      // round number -> container element
let sources = [];       // [{index,title,link}]
let reportText = "";
let pending = null;     // "waiting" step element showing a spinner

// Build DOM with textContent only: titles/snippets come from the web and must not be parsed as HTML.
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function clearPending() { pending?.remove(); pending = null; }

function setPending(container, text) {
  clearPending();
  pending = el("div", "step");
  pending.append(el("span", "spinner"), document.createTextNode(text));
  container.append(pending);
}

function addStep(container, kind, label) {
  clearPending();
  const s = el("div", `step ${kind}`);
  s.append(el("div", "step-label", label));
  container.append(s);
  return s;
}

function getRound(n, max) {
  if (!roundEls[n]) {
    const r = el("div", "round");
    r.append(el("div", "round-title", `第 ${n} / ${max} 轮`));
    stepsEl.append(r);
    roundEls[n] = r;
  }
  return roundEls[n];
}

function renderReport(final) {
  let md = reportText;
  // Turn [n] into links to the matching source.
  md = md.replace(/\[(\d+)\](?!\()/g, (m, n) => {
    const s = sources[Number(n) - 1];
    return s ? `[\\[${n}\\]](${s.link} "${s.title.replace(/["\n]/g, " ")}")` : m;
  });
  const html = DOMPurify.sanitize(marked.parse(md), { ADD_ATTR: ["target"] });
  reportEl.innerHTML = html;
  reportEl.querySelectorAll("a").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    if (/^\[\d+\]$/.test(a.textContent)) a.classList.add("cite");
  });
  reportEl.classList.toggle("streaming", !final);
  if (!final && reportEl.hidden === false) window.scrollTo({ top: document.body.scrollHeight });
}

function reset() {
  roundEls = {}; sources = []; reportText = ""; pending = null;
  stepsEl.replaceChildren();
  reportEl.hidden = true; reportEl.replaceChildren(); reportEl.classList.remove("streaming");
  sourcesBox.hidden = true; sourceList.replaceChildren();
  errorEl.hidden = true;
  placeholder.hidden = false;
}

function showError(msg) {
  clearPending();
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function finish() {
  es?.close(); es = null;
  clearPending();
  goBtn.disabled = false;
  reportEl.classList.remove("streaming");
}

const handlers = {
  round_start: (d) => {
    const r = getRound(d.round, d.maxRounds);
    setPending(r, "正在让模型拆分搜索关键词…");
  },
  keywords: (d) => {
    const r = getRound(d.round);
    const s = addStep(r, "keywords", "生成关键词");
    const tags = el("div");
    d.keywords.forEach((k) => tags.append(el("span", "tag", k)));
    s.append(tags);
    if (d.reasoning) s.append(el("div", "hint", d.reasoning));
  },
  searching: (d) => {
    const r = getRound(d.round);
    const s = addStep(r, "search", "搜索");
    d.keywords.forEach((k) => s.append(el("div", null, `🔍 ${k}`)));
    setPending(r, "等待搜索结果…");
  },
  search_error: (d) => {
    addStep(getRound(d.round), "fail", "搜索失败").append(`${d.keyword}: ${d.message}`);
  },
  results: (d) => {
    const r = getRound(d.round);
    const s = addStep(r, "results", `搜索结果(新增 ${d.results.length} 条,累计 ${d.total} 条)`);
    const ul = el("ul", "result-list");
    d.results.forEach((it) => {
      sources[it.index - 1] = { index: it.index, title: it.title, link: it.link };
      const li = el("li");
      const a = el("a", null, `[${it.index}] ${it.title}`);
      a.href = it.link; a.target = "_blank"; a.rel = "noopener noreferrer";
      li.append(a);
      const meta = [it.date, it.keyword].filter(Boolean).join(" · ");
      if (meta) li.append(el("div", "meta", meta));
      ul.append(li);
    });
    s.append(ul);
    setPending(r, "模型正在分析搜索结果…");
  },
  analysis: (d) => {
    const r = getRound(d.round);
    const s = addStep(r, "analysis", "分析结果");
    s.append(el("span", `badge ${d.sufficient ? "ok" : "no"}`,
      d.sufficient ? "结果可用" : d.willRetry ? "结果不足,重新搜索" : "结果不足,已达最大轮数"));
    s.append(el("div", null, d.summary));
    s.append(el("div", "hint", d.reason));
    if (!d.sufficient && !d.willRetry) setPending(r, "准备生成报告…");
    else if (d.sufficient) setPending(r, "准备生成报告…");
  },
  report_start: (d) => {
    clearPending();
    const s = el("div", "round");
    s.append(el("div", "round-title", "生成报告"));
    const st = el("div", "step report");
    st.append(el("span", "spinner"), document.createTextNode("模型正在撰写报告…"));
    s.append(st);
    stepsEl.append(s);
    placeholder.hidden = true;
    reportEl.hidden = false;
    d.sources.forEach((x) => { sources[x.index - 1] = x; });
  },
  report_delta: (d) => {
    reportText += d.text;
    renderReport(false);
  },
  done: () => {
    renderReport(true);
    stepsEl.querySelector(".step.report")?.replaceChildren(el("div", "step-label", "报告已生成"));
    sources.filter(Boolean).forEach((s) => {
      const li = el("li");
      const a = el("a", null, s.title || s.link);
      a.href = s.link; a.target = "_blank"; a.rel = "noopener noreferrer";
      li.append(a);
      sourceList.append(li);
    });
    sourcesBox.hidden = sources.length === 0;
    finish();
  },
};

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;
  es?.close();
  reset();
  goBtn.disabled = true;

  es = new EventSource(`/api/search?q=${encodeURIComponent(q)}`);
  for (const [type, fn] of Object.entries(handlers)) {
    es.addEventListener(type, (ev) => fn(JSON.parse(ev.data)));
  }
  // Server-sent "error" events carry data; connection errors do not.
  es.addEventListener("error", (ev) => {
    if (ev.data) showError(JSON.parse(ev.data).message);
    else if (es) showError("连接中断,请重试");
    finish();
  });
});
