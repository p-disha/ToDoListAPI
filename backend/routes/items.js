const express = require("express");
const Item = require("../models/Item");
const { authenticateJWT } = require("../middleware/auth");

const router = express.Router();

/* --------------------------------------------- */
/* Helper: Get User ID from JWT                  */
/* --------------------------------------------- */
function getUserId(req) {
  return req.user?.id || req.user?._id;
}

/* --------------------------------------------- */
/* CREATE ITEM                                   */
/* --------------------------------------------- */
router.post("/", authenticateJWT, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { title, content, dueDate, priority, tags } = req.body;

    // Order index (isolated per user)
    const last = await Item.findOne({ owner: userId })
      .sort("-order")
      .select("order")
      .lean();

    const order = last ? last.order + 1 : 0;

    const item = new Item({
      title,
      content,
      owner: userId,
      priority: priority || "medium",
      if (dueDate) {
        const local = new Date(dueDate);  
        item.dueDate = new Date(local.getTime() - local.getTimezoneOffset() * 60000);
      },
      tags: Array.isArray(tags)
        ? tags.filter(Boolean)
        : tags
        ? String(tags)
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      order,
    });

    await item.save();

    const populated = await Item.findById(item._id).populate(
      "owner",
      "name email"
    );

    res.status(201).json(populated);
  } catch (err) {
    console.error("POST /items error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* --------------------------------------------- */
/* LIST ITEMS (USER-ISOLATED)                    */
/* --------------------------------------------- */
router.get("/", authenticateJWT, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { q, tag, priority, status, sort } = req.query;

    const filter = { owner: userId };

    if (q) {
      const re = new RegExp(q, "i");
      filter.$or = [{ title: re }, { content: re }, { tags: re }];
    }
    if (tag) filter.tags = tag;
    if (priority) filter.priority = priority;
    if (status === "completed") filter.completed = true;
    if (status === "pending") filter.completed = false;

    let items = await Item.find(filter)
      .populate("owner", "name email")
      .sort({ order: 1, updatedAt: -1 })
      .lean();

    if (sort === "priority") {
      const score = { high: 3, medium: 2, low: 1 };
      items.sort((a, b) => score[b.priority] - score[a.priority]);
    }

    if (sort === "due") {
      items.sort(
        (a, b) =>
          new Date(a.dueDate || 8640000000000000) -
          new Date(b.dueDate || 8640000000000000)
      );
    }

    res.json(items);
  } catch (err) {
    console.error("GET /items error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* --------------------------------------------- */
/* GET SINGLE ITEM (ISOLATED)                    */
/* --------------------------------------------- */
router.get("/:id", authenticateJWT, async (req, res) => {
  try {
    const userId = getUserId(req);
    const item = await Item.findOne({
      _id: req.params.id,
      owner: userId,
    }).populate("owner", "name email");

    if (!item) return res.status(404).json({ message: "Not found" });

    res.json(item);
  } catch (err) {
    console.error("GET /items/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* --------------------------------------------- */
/* UPDATE ITEM (ISOLATED)                        */
/* --------------------------------------------- */
router.put("/:id", authenticateJWT, async (req, res) => {
  try {
    const userId = getUserId(req);
    const item = await Item.findOne({
      _id: req.params.id,
      owner: userId,
    });

    if (!item) return res.status(404).json({ message: "Not found" });

    const { title, content, dueDate, priority, tags } = req.body;

    if (title !== undefined) item.title = title;
    if (content !== undefined) item.content = content;
    if (dueDate) {
      const local = new Date(dueDate);  
      item.dueDate = new Date(local.getTime() - local.getTimezoneOffset() * 60000);
    }
    if (priority !== undefined) item.priority = priority;

    if (tags !== undefined) {
      item.tags = Array.isArray(tags)
        ? tags.filter(Boolean)
        : String(tags)
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
    }

    await item.save();

    const populated = await Item.findById(item._id).populate(
      "owner",
      "name email"
    );

    res.json(populated);
  } catch (err) {
    console.error("PUT /items/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* --------------------------------------------- */
/* TOGGLE COMPLETE                               */
/* --------------------------------------------- */
router.patch("/:id/complete", authenticateJWT, async (req, res) => {
  try {
    const userId = getUserId(req);

    const item = await Item.findOne({
      _id: req.params.id,
      owner: userId,
    });

    if (!item) return res.status(404).json({ message: "Not found" });

    item.completed = !item.completed;
    await item.save();

    const populated = await Item.findById(item._id).populate(
      "owner",
      "name email"
    );

    res.json(populated);
  } catch (err) {
    console.error("PATCH /items/:id/complete error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* --------------------------------------------- */
/* DELETE ITEM (ISOLATED)                        */
/* --------------------------------------------- */
router.delete("/:id", authenticateJWT, async (req, res) => {
  try {
    const userId = getUserId(req);

    const item = await Item.findOne({
      _id: req.params.id,
      owner: userId,
    });

    if (!item) return res.status(404).json({ message: "Not found" });

    await item.deleteOne();

    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("DELETE /items/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* --------------------------------------------- */
/* ADD SUBTASK                                   */
/* --------------------------------------------- */
router.post("/:id/subtasks", authenticateJWT, async (req, res) => {
  try {
    const userId = getUserId(req);
    const item = await Item.findOne({
      _id: req.params.id,
      owner: userId,
    });

    if (!item) return res.status(404).json({ message: "Not found" });

    const { title } = req.body;
    if (!title?.trim())
      return res.status(400).json({ message: "Missing title" });

    item.subtasks.push({ title });
    await item.save();

    const populated = await Item.findById(item._id).populate(
      "owner",
      "name email"
    );

    res.json(populated);
  } catch (err) {
    console.error("POST /items/:id/subtasks error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* --------------------------------------------- */
/* TOGGLE SUBTASK                                */
/* --------------------------------------------- */
router.patch("/:id/subtasks/:subtaskId", authenticateJWT, async (req, res) => {
  try {
    const userId = getUserId(req);
    const item = await Item.findOne({
      _id: req.params.id,
      owner: userId,
    });

    if (!item) return res.status(404).json({ message: "Not found" });

    const st = item.subtasks.id(req.params.subtaskId);
    if (!st) return res.status(404).json({ message: "Subtask not found" });

    st.completed = !st.completed;

    await item.save();

    const populated = await Item.findById(item._id).populate(
      "owner",
      "name email"
    );

    res.json(populated);
  } catch (err) {
    console.error("PATCH /subtask error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* --------------------------------------------- */
/* REORDER ITEMS (ISOLATED PER USER)             */
/* --------------------------------------------- */
router.patch("/reorder", authenticateJWT, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { order } = req.body;

    if (!Array.isArray(order))
      return res.status(400).json({ message: "Invalid payload" });

    const updates = order.map((o) =>
      Item.updateOne(
        { _id: o.id, owner: userId },
        { $set: { order: Number(o.order) } }
      ).exec()
    );

    await Promise.all(updates);

    res.json({ message: "Reordered" });
  } catch (err) {
    console.error("PATCH /items/reorder error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
