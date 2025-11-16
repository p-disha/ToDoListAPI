const express = require('express');
const Item = require('../models/Item');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');


const router = express.Router();


// Create item — any authenticated user can create (owner set to req.user.id)
router.post('/', authenticateJWT, async (req, res) => {
    const { title, content } = req.body;
    const item = new Item({ title, content, owner: req.user.id });
    await item.save();
    res.status(201).json(item);
});


// Read all items — admin can see all, users see all but it's up to business logic; here everyone can list
router.get('/', authenticateJWT, async (req, res) => {
    const items = await Item.find().populate('owner', 'name email');
    res.json(items);
});


// Read single
router.get('/:id', authenticateJWT, async (req, res) => {
    const item = await Item.findById(req.params.id).populate('owner', 'name email');
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
});


// Update — owners or admin
router.put('/:id', authenticateJWT, async (req, res) => {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });


        if (item.owner.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only owner or admin can update' });
        }


        item.title = req.body.title ?? item.title;
        item.content = req.body.content ?? item.content;
        await item.save();
        res.json(item);
});


// Delete — owners or admin
router.delete('/:id', authenticateJWT, async (req, res) => {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });


        if (item.owner.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only owner or admin can delete' });
        }


        await item.remove();
        res.json({ message: 'Deleted' });
});


router.patch('/:id/complete', authenticateJWT, async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'Not found' });

  if (item.owner.toString() !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ message: 'Only owner or admin can update' });

  item.completed = !item.completed;
  await item.save();
  res.json(item);
});


module.exports = router;