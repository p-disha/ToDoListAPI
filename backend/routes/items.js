const express = require('express');
const Item = require('../models/Item');
const { authenticateJWT } = require('../middleware/auth');

const router = express.Router();

// helper to get consistent user id from token payload
function getUserId(req) {
  return req.user?.id || req.user?._id || req.user;
}

// Create item
router.post('/', authenticateJWT, async (req, res) => {
  try {
    const { title, content, dueDate, priority, tags } = req.body;
    // compute next order (push to end)
    const max = await Item.findOne().sort('-order').select('order').lean();
    const order = max ? max.order + 1 : 0;

    const item = new Item({
      title,
      content,
      owner: getUserId(req),
      dueDate: dueDate ? new Date(dueDate) : undefined,
      priority: priority || 'medium',
      tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map(t => t.trim()).filter(Boolean) : []),
      order
    });

    await item.save();
    const populated = await Item.findById(item._id).populate('owner', 'name email');
    res.status(201).json(populated);
  } catch (err) {
    console.error("POST /items error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Read all with optional q, tag, priority, status, sort
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const { q, tag, priority, status, sort } = req.query;
    const filter = {};

    if (q) {
      const re = new RegExp(q, 'i');
      filter.$or = [{ title: re }, { content: re }, { tags: re }];
    }
    if (tag) filter.tags = tag;
    if (priority) filter.priority = priority;
    if (status === 'completed') filter.completed = true;
    if (status === 'pending') filter.completed = false;

    let pipeline = [
      { $match: filter },
      {
        $addFields: {
          priorityScore: {
            $switch: {
              branches: [
                { case: { $eq: ["$priority", "high"] }, then: 3 },
                { case: { $eq: ["$priority", "medium"] }, then: 2 },
                { case: { $eq: ["$priority", "low"] }, then: 1 },
              ],
              default: 0
            }
          }
        }
      }
    ];

    if (sort === "priority") pipeline.push({ $sort: { priorityScore: -1, updatedAt: -1 } });
    else if (sort === "due") pipeline.push({ $sort: { dueDate: 1, updatedAt: -1 } });
    else pipeline.push({ $sort: { order: 1, updatedAt: -1 } });

    pipeline.push({
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner"
      }
    });

    pipeline.push({ $unwind: "$owner" });

    const items = await Item.aggregate(pipeline);
    res.json(items);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Read single
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id).populate('owner', 'name email');
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  } catch (err) {
    console.error("GET /items/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update — owners or admin (title, content, dueDate, priority, tags)
router.put('/:id', authenticateJWT, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });

    const userId = getUserId(req);
    if (item.owner.toString() !== String(userId) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only owner or admin can update' });
    }

    const { title, content, dueDate, priority, tags } = req.body;
    if (title !== undefined) item.title = title;
    if (content !== undefined) item.content = content;
    item.dueDate = dueDate ? new Date(dueDate) : undefined;
    if (req.body.priority !== undefined) {
        item.priority = req.body.priority;
    }
    if (tags !== undefined) item.tags = Array.isArray(tags) ? tags : String(tags).split(',').map(t => t.trim()).filter(Boolean);

    await item.save();
    const popped = await Item.findById(item._id).populate('owner', 'name email');
    res.json(popped);
  } catch (err) {
    console.error("PUT /items/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Toggle complete (PATCH)
router.patch('/:id/complete', authenticateJWT, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });

    const userId = getUserId(req);
    if (item.owner.toString() !== String(userId) && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Only owner or admin can update' });

    item.completed = !item.completed;
    await item.save();
    const popped = await Item.findById(item._id).populate('owner', 'name email');
    res.json(popped);
  } catch (err) {
    console.error("PATCH /items/:id/complete error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete — owners or admin
router.delete('/:id', authenticateJWT, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });

    const userId = getUserId(req);
    if (item.owner.toString() !== String(userId) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only owner or admin can delete' });
    }

    // use deleteOne() on the document
    await item.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error("DELETE /items/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Subtasks: add
router.post('/:id/subtasks', authenticateJWT, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });

    const userId = getUserId(req);
    if (item.owner.toString() !== String(userId) && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Only owner or admin' });

    const { title } = req.body;
    if (!title) return res.status(400).json({ message: 'Missing title' });

    item.subtasks.push({ title });
    await item.save();
    const popped = await Item.findById(item._id).populate('owner', 'name email');
    res.json(popped);
  } catch (err) {
    console.error("POST /items/:id/subtasks error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Subtasks: toggle
router.patch('/:id/subtasks/:subtaskId', authenticateJWT, async (req, res) => {
  try {
    const { id, subtaskId } = req.params;
    const item = await Item.findById(id);
    if (!item) return res.status(404).json({ message: 'Not found' });

    const userId = getUserId(req);
    if (item.owner.toString() !== String(userId) && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Only owner or admin' });

    const st = item.subtasks.id(subtaskId);
    if (!st) return res.status(404).json({ message: 'Subtask not found' });

    st.completed = !st.completed;
    await item.save();
    const popped = await Item.findById(item._id).populate('owner', 'name email');
    res.json(popped);
  } catch (err) {
    console.error("PATCH /items/:id/subtasks/:subtaskId error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Reorder: accept { order: [{id, order}] }
router.patch('/reorder', authenticateJWT, async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ message: 'Invalid order payload' });

    const userId = getUserId(req);
    // update only items owned by user (or admin can update all)
    const updates = order.map(o => {
      if (req.user.role === 'admin') {
        return Item.updateOne({ _id: o.id }, { $set: { order: o.order } }).exec();
      } else {
        return Item.updateOne({ _id: o.id, owner: String(userId) }, { $set: { order: o.order } }).exec();
      }
    });

    await Promise.all(updates);
    res.json({ message: 'Reordered' });
  } catch (err) {
    console.error("PATCH /items/reorder error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
