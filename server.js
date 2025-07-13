require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/todo_app';

/* ─── 1. Connect to MongoDB ─── */
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

/* ─── 2. Task Schema & Model ─── */
const taskSchema = new mongoose.Schema({
  text: { type: String, required: true },
  attachment: { type: String, default: null },
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null }
});
taskSchema.index({ deletedAt: 1 });
const Task = mongoose.model('Task', taskSchema);

/* ─── 3. Middleware ─── */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serves HTML/CSS/JS
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve uploaded files

/* ─── 4. File Upload Setup (Multer) ─── */
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, 'uploads/'),
  filename: (_, file, cb) => {
    const unique = Date.now() + '-' + file.originalname;
    cb(null, unique);
  }
});
const upload = multer({ storage });

/* ─── 5. Helper for filters ─── */
function buildFilter(status = 'all') {
  switch (status) {
    case 'completed': return { completed: true, deletedAt: null };
    case 'incomplete': return { completed: false, deletedAt: null };
    case 'trashed': return { deletedAt: { $ne: null } };
    default: return { deletedAt: null };
  }
}

/* ─── 6. Routes ─── */

// CREATE task with optional file
app.post('/api/tasks/create', upload.single('attachment'), async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Task text required' });

    const filePath = req.file ? req.file.path.replace(/\\/g, '/') : null;
    const task = await Task.create({ text: text.trim(), attachment: filePath });

    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// VIEW tasks
app.get('/api/tasks/view', async (req, res) => {
  try {
    const filter = buildFilter(req.query.status);
    const tasks = await Task.find(filter).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TOGGLE complete
app.patch('/api/tasks/status', async (req, res) => {
  try {
    const { primary: id, completed } = req.body;
    const task = await Task.findOneAndUpdate({ _id: id, deletedAt: null }, { completed }, { new: true });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// EDIT text
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { text: req.body.text?.trim() },
      { new: true, runValidators: true }
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SOFT DELETE
app.delete('/api/tasks/delete/:id', async (req, res) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { deletedAt: new Date() },
      { new: true }
    );
    if (!task) return res.status(404).json({ error: 'Task not found or already trashed' });
    res.json({ message: 'Moved to trash', task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESTORE
app.patch('/api/tasks/restore/:id', async (req, res) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, deletedAt: { $ne: null } },
      { deletedAt: null },
      { new: true }
    );
    if (!task) return res.status(404).json({ error: 'Task not found in trash' });
    res.json({ message: 'Task restored', task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PERMANENT DELETE
app.delete('/api/tasks/permanent-delete/:id', async (req, res) => {
  try {
    const result = await Task.deleteOne({ _id: req.params.id, deletedAt: { $ne: null } });
    if (result.deletedCount === 0)
      return res.status(404).json({ error: 'Task not found or not trashed' });
    res.json({ message: 'Task permanently deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── 7. Serve index.html ─── */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ─── 8. 404 Catch-All ─── */
app.use((_, res) => res.status(404).json({ error: 'Route not found' }));

/* ─── 9. Start Server ─── */
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
