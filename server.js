require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/todo_app';

/* ─────── MongoDB Connect ─────── */
mongoose.connect(MONGO_URI)
  .then(() => console.log(`✅ MongoDB connected → ${MONGO_URI}`))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

/* ─────── Mongoose Schema ─────── */
const taskSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    completed: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);
const Task = mongoose.model('Task', taskSchema);

/* ─────── Middleware ─────── */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

/* ─────── Helper ─────── */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ─────── Routes ─────── */

// CREATE
app.post('/api/tasks/create', asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Task text is required' });
  }
  const task = await Task.create({ text: text.trim() });
  res.status(201).json(task);
}));

// READ (with optional status filter)
app.get('/api/tasks/view', asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = { deletedAt: null };
  if (status === 'completed') filter.completed = true;
  else if (status === 'incomplete') filter.completed = false;

  const tasks = await Task.find(filter).sort({ createdAt: -1 });
  res.json(tasks);
}));

// MARK AS COMPLETED/INCOMPLETE (PATCH)
app.patch('/api/tasks/status', asyncHandler(async (req, res) => {
  const { primary, completed } = req.body;
  if (!primary || typeof completed !== 'boolean') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const task = await Task.findByIdAndUpdate(
    primary,
    { completed },
    { new: true }
  );

  if (!task) return res.status(404).json({ error: 'Task not found' });

  res.json({ message: 'Task updated', task });
}));

// UPDATE TEXT
app.put('/api/tasks/:id', asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Task text is required' });
  }

  const task = await Task.findByIdAndUpdate(
    req.params.id,
    { text: text.trim() },
    { new: true }
  );

  if (!task) return res.status(404).json({ error: 'Task not found' });

  res.json({ message: 'Task text updated', task });
}));

// SOFT DELETE
app.delete('/api/tasks/delete/:id', asyncHandler(async (req, res) => {
  const task = await Task.findByIdAndUpdate(
    req.params.id,
    { deletedAt: new Date() },
    { new: true }
  );

  if (!task) return res.status(404).json({ error: 'Task not found' });

  res.json({ message: 'Task soft-deleted', deletedAt: task.deletedAt });
}));

// Serve frontend
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ─────── Global Error Handler ─────── */
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

/* ─────── Start Server ─────── */
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
