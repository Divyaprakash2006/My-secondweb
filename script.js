// =========================
// Globals & DOM handles
// =========================
const API = '/api/tasks';

const $           = (sel, ctx = document) => ctx.querySelector(sel);
const form        = $('#taskForm');
const input       = $('#taskInput');
const list        = $('#taskList');
const filter      = $('#filter');
const themeBtn    = $('#toggleTheme');
const completedBtn = $('#completedBtn');

let currentFilter = 'all';

// =========================
// Helper: fetch wrapper
// =========================
const fetchJSON = async (url, options = {}) => {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
};

// =========================
// READ on load
// =========================
async function loadTasks() {
  const tasks = await fetchJSON(`${API}/view`);
  applyFilterAndRender(tasks);
}

function applyFilterAndRender(tasks) {
  const filtered = tasks.filter(t => {
    if (currentFilter === 'completed')   return t.completed;
    if (currentFilter === 'incomplete')  return !t.completed;
    return true;
  });
  renderList(filtered);
}

function renderList(tasks) {
  list.innerHTML = '';
  if (!tasks.length) {
    list.innerHTML = '<li>No tasks found</li>';
    return;
  }
  tasks.forEach(renderTask);
}

// =========================
// Render a single task row
// =========================
function renderTask(task) {
  const li  = document.createElement('li');
  li.className = `task ${task.completed ? 'completed' : ''}`;

  // content wrapper
  const content = document.createElement('div');
  content.className = 'task-content';

  // task text
  const span = document.createElement('span');
  span.textContent = task.text;
  span.onclick = () => toggleComplete(task);

  // created date
  const date = document.createElement('small');
  date.textContent = `Created: ${new Date(task.createdAt).toLocaleString()}`;

  content.append(span, date);

  // action buttons
  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(
    icon('✏', () => editTask(li, task)),
    icon('🗑', () => deleteTask(task), 'delete')
  );

  li.append(content, actions);
  list.appendChild(li);
}

const icon = (txt, fn, cls = '') => {
  const b = document.createElement('button');
  b.className = `icon ${cls}`;
  b.textContent = txt;
  b.onclick = fn;
  return b;
};

// =========================
// CREATE
// =========================
form.onsubmit = async e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  await fetchJSON(`${API}/create`, {
    method: 'POST',
    body: JSON.stringify({ text })
  });

  input.value = '';
  loadTasks();
};

// =========================
// UPDATE: complete toggle
// =========================
async function toggleComplete(task) {
  await fetchJSON(`${API}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ primary: task._id, completed: !task.completed })
  });
  loadTasks();
}

// UPDATE: edit text
function editTask(li, task) {
  if (li.classList.contains('editing')) return;
  li.classList.add('editing');

  const content = li.querySelector('.task-content');
  const oldText = content.querySelector('span').textContent;

  const inputField = document.createElement('input');
  inputField.className = 'editField';
  inputField.value = oldText;

  const actions = li.querySelector('.actions');
  actions.innerHTML = '';
  actions.append(
    icon('💾', async () => {
      const newText = inputField.value.trim();
      if (!newText) return alert('Task text required');
      await fetchJSON(`${API}/${task._id}`, {
        method: 'PUT',
        body: JSON.stringify({ text: newText })
      });
      loadTasks();
    }),
    icon('✖', () => { li.classList.remove('editing'); loadTasks(); }, 'cancel')
  );

  content.innerHTML = '';
  content.appendChild(inputField);
  inputField.focus();
}

// =========================
// DELETE (soft delete)
// =========================
async function deleteTask(task) {
  if (!confirm('Delete this task?')) return;
  await fetchJSON(`${API}/delete/${task._id}`, { method: 'DELETE' });
  loadTasks();
}

// =========================
// FILTERS
// =========================
filter.onchange = e => {
  currentFilter = e.target.value;
  loadTasks();
};

// Completed button → fetch from dedicated endpoint
completedBtn.onclick = async () => {
  const tasks = await fetchJSON(`${API}/completed`);
  currentFilter = 'completed';
  filter.value = 'completed';           // sync dropdown
  renderList(tasks);
};

// =========================
// Theme toggle
// =========================
themeBtn.onclick = () => document.body.classList.toggle('dark');

// =========================
// Init
// =========================
loadTasks();
