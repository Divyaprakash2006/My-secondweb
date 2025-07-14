require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 5000;
const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/todo_app';

// MongoDB connection
const conn = mongoose.createConnection(URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

let gfsBucket;
conn.once('open', () => {
  gfsBucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'uploads' });
  console.log('✅ MongoDB connected — GridFSBucket ready');
});

// Task schema
const taskSchema = new mongoose.Schema({
  text:       { type: String, required: true },
  attachment: { type: String, default: null },
  completed:  { type: Boolean, default: false },
  createdAt:  { type: Date,    default: Date.now },
  deletedAt:  { type: Date,    default: null }
});
taskSchema.index({ deletedAt: 1 });
const Task = conn.model('Task', taskSchema);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Multer setup with memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Helper for filtering
function buildFilter(status = 'all') {
  switch (status) {
    case 'completed':  return { completed: true,  deletedAt: null };
    case 'incomplete': return { completed: false, deletedAt: null };
    case 'trashed':    return { deletedAt: { $ne: null } };
    default:           return { deletedAt: null };
  }
}

// Routes
app.post('/api/tasks/create', upload.single('attachment'), async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Task text required' });

    let filename = null;

    if (req.file) {
      filename = crypto.randomBytes(16).toString('hex') + path.extname(req.file.originalname);
      const uploadStream = gfsBucket.openUploadStream(filename, {
        contentType: req.file.mimetype,
        metadata: { originalname: req.file.originalname }
      });

      uploadStream.end(req.file.buffer);

      await new Promise((resolve, reject) => {
        uploadStream.on('finish', resolve);
        uploadStream.on('error', reject);
      });
    }

    const task = await Task.create({ text: text.trim(), attachment: filename });
    res.status(201).json(task);
  } catch (err) {
    console.error('❌ Upload error:', err);
    res.status(500).json({ error: 'Task creation failed' });
  }
});

app.get('/api/tasks/view', async (req, res) => {
  try {
    const tasks = await Task.find(buildFilter(req.query.status)).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasks/file/:filename', async (req, res) => {
  try {
    const fileDoc = await conn.db.collection('uploads.files')
                                 .findOne({ filename: req.params.filename });
    if (!fileDoc) return res.status(404).json({ error: 'File not found' });

    res.set('Content-Type', fileDoc.contentType || 'application/octet-stream');
    const stream = gfsBucket.openDownloadStreamByName(req.params.filename);
    stream.on('error', () => res.status(404).end());
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/tasks/status', async (req, res) => {
  try {
    const { primary: id, completed } = req.body;
    const task = await Task.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { completed },
      { new: true }
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  try {
    const text = req.body.text?.trim();
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { text },
      { new: true, runValidators: true }
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

app.delete('/api/tasks/permanent-delete/:id', async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, deletedAt: { $ne: null } });
    if (!task) return res.status(404).json({ error: 'Task not found or not trashed' });

    if (task.attachment) {
      const fileDoc = await conn.db.collection('uploads.files')
                                   .findOne({ filename: task.attachment });
      if (fileDoc) await gfsBucket.delete(fileDoc._id);
    }

    await task.deleteOne();
    res.json({ message: 'Task permanently deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use((_, res) => res.status(404).json({ error: 'Route not found' }));

// Start server
app.listen(PORT, () => console.log(`🚀 Server running: http://localhost:${PORT}`));
