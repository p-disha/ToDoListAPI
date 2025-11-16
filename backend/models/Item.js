const mongoose = require('mongoose');


const itemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    completed: { type: Boolean, default: false }
  },
  { timestamps: true }
);



module.exports = mongoose.model('Item', itemSchema);