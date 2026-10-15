const cards = document.querySelector('#cards');
const summary = document.querySelector('#summary');
const search = document.querySelector('#search');
const serviceFilter = document.querySelector('#service-filter');
const feedbackStatus = document.querySelector('#feedback-status');
const state = { rows: [], feedback: { comments: [], reactions: [], approvals: [] }, articles: new Map() };
const template = document.querySelector('#card-template');

function imageUrl(id, hash) { return `/api/image?id=${encodeURIComponent(id)}&hash=${encodeURIComponent(hash)}`; }
function feedbackFor(id, hash) {
  const key = row => row.slot === id && row.asset_sha256 === hash;
  return {
    comments: state.feedback.comments.filter(key),
    likes: state.feedback.reactions.filter(row => key(row) && row.vote === 'like').length,
    dislikes: state.feedback.reactions.filter(row => key(row) && row.vote === 'dislike').length,
    approved: state.feedback.approvals.some(row => key(row) && row.status === 'approved')
  };
}
function selectedHash(article) { return article.querySelector('.version-select').value; }
function updateVersion(article) {
  const hash = selectedHash(article);
  const row = state.rows.find(item => item.id === article.dataset.id);
  const version = row?.versions.find(item => item.hash === hash);
  if (!version) return;
  article.dataset.hash = hash;
  article.querySelector('.preview').src = imageUrl(row.id, hash);
  article.querySelector('.open-image').href = imageUrl(row.id, hash);
  article.querySelector('.meta').textContent = `${row.status || 'Candidate'} · ${row.role} · ${version.label}${version.time ? ` · ${new Date(version.time).toLocaleDateString()}` : ''}`;
  updateFeedback(article);
}
function updateFeedback(article) {
  const f = feedbackFor(article.dataset.id, article.dataset.hash);
  article.querySelector('.like').textContent = `Like ${f.likes}`;
  article.querySelector('.dislike').textContent = `Dislike ${f.dislikes}`;
  const approve = article.querySelector('.approve');
  approve.textContent = f.approved ? 'Approved' : 'Approve this version';
  approve.disabled = f.approved;
  approve.setAttribute('aria-pressed', String(f.approved));
  const section = article.querySelector('.comments');
  section.replaceChildren();
  if (!f.comments.length) {
    const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No comments on this version yet.'; section.append(empty); return;
  }
  for (const comment of f.comments) {
    const item = document.createElement('div'); item.className = 'comment';
    const time = document.createElement('time'); time.textContent = `${new Date(comment.time).toLocaleString()} · ${article.querySelector('.version-select').selectedOptions[0]?.textContent || ''}`;
    const note = document.createElement('div'); note.textContent = comment.note; item.append(time, note); section.append(item);
  }
}
function applyFilters() {
  const query = search.value.trim().toLowerCase(), service = serviceFilter.value;
  for (const article of state.articles.values()) {
    const row = state.rows.find(item => item.id === article.dataset.id);
    const text = `${row.service} ${row.title} ${row.id}`.toLowerCase();
    article.classList.toggle('hidden', (service && row.service !== service) || (query && !text.includes(query)));
  }
}
async function postFeedback(article, payload, button) {
  button.disabled = true; feedbackStatus.textContent = 'Saving…';
  try {
    const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: article.dataset.id, hash: article.dataset.hash, ...payload }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Save failed');
    feedbackStatus.textContent = 'Saved'; await loadFeedback();
  } catch (error) { feedbackStatus.textContent = error.message; }
  finally { button.disabled = false; updateFeedback(article); }
}
function makeCard(row) {
  const article = template.content.firstElementChild.cloneNode(true);
  article.dataset.id = row.id; article.dataset.service = row.service;
  article.querySelector('.service').textContent = row.service;
  article.querySelector('.title').textContent = row.title;
  article.querySelector('.slot').textContent = row.id;
  article.querySelector('.preview').alt = `${row.service}: ${row.title}`;
  const select = article.querySelector('.version-select');
  for (const version of row.versions) {
    const option = document.createElement('option'); option.value = version.hash;
    option.textContent = `${version.label}${version.current ? ' · current' : ''}`; select.append(option);
  }
  select.value = row.currentHash || row.versions.at(-1)?.hash || '';
  select.addEventListener('change', () => updateVersion(article));
  article.querySelector('.like').addEventListener('click', event => postFeedback(article, { kind: 'reaction', vote: 'like' }, event.currentTarget));
  article.querySelector('.dislike').addEventListener('click', event => postFeedback(article, { kind: 'reaction', vote: 'dislike' }, event.currentTarget));
  article.querySelector('.approve').addEventListener('click', event => postFeedback(article, { kind: 'approval' }, event.currentTarget));
  article.querySelector('.save-comment').addEventListener('click', event => {
    const input = article.querySelector('.comment-input');
    if (!input.value.trim()) return;
    const button = event.currentTarget;
    postFeedback(article, { kind: 'comment', note: input.value.trim() }, button).then(() => { if (feedbackStatus.textContent === 'Saved') input.value = ''; });
  });
  article.querySelector('.copy').addEventListener('click', async event => {
    const button = event.currentTarget;
    try {
      const image = await createImageBitmap(await (await fetch(imageUrl(row.id, article.dataset.hash))).blob());
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      canvas.getContext('2d').drawImage(image, 0, 0);
      const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]); button.textContent = 'Copied';
    } catch { button.textContent = 'Right-click image to copy'; }
  });
  updateVersion(article); state.articles.set(row.id, article); return article;
}
async function loadFeedback() {
  const response = await fetch('/api/feedback', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not refresh saved reviews');
  state.feedback = await response.json();
  for (const article of state.articles.values()) updateFeedback(article);
}
async function start() {
  try {
    const [imageResponse, statusResponse] = await Promise.all([fetch('/api/images', { cache: 'no-store' }), fetch('/api/status', { cache: 'no-store' })]);
    if (!imageResponse.ok || !statusResponse.ok) throw new Error('Review inventory is unavailable');
    state.rows = await imageResponse.json(); const status = await statusResponse.json();
    summary.textContent = `${status.pages} pages · ${status.reviewCards} images with versions · ${status.versions} saved versions · ${status.withoutCandidate} required image slots empty`;
    const services = [...new Set(state.rows.map(row => row.service))].sort((a, b) => a.localeCompare(b));
    for (const service of services) { const option = document.createElement('option'); option.value = service; option.textContent = service; serviceFilter.append(option); }
    cards.replaceChildren(...state.rows.map(makeCard));
    search.addEventListener('input', applyFilters); serviceFilter.addEventListener('change', applyFilters);
    document.querySelector('#refresh').addEventListener('click', () => loadFeedback().then(() => { feedbackStatus.textContent = 'Refreshed'; }).catch(error => { feedbackStatus.textContent = error.message; }));
    await loadFeedback();
    setInterval(() => { if (!document.hidden) loadFeedback().catch(() => {}); }, 30000);
  } catch (error) { summary.textContent = error.message; }
}
start();

