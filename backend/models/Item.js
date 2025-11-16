const mongoose = require('mongoose');

const subtaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  completed: { type: Boolean, default: false }
}, { timestamps: true });

const itemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, default: '' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  completed: { type: Boolean, default: false },
  dueDate: { type: Date },
  priority: { type: String, enum: ['low','medium','high'], default: 'medium' },
  tags: [{ type: String }],
  order: { type: Number, default: 0 },
  subtasks: [subtaskSchema]
}, { timestamps: true });

module.exports = mongoose.model('Item', itemSchema);
