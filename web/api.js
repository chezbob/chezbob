// api.js
import express from "express";
import { db } from "../db/db.js";

const router = express.Router();

// ----------------------
// Add Users
// ----------------------
router.post("/add-users", async (req, res) => {
  try {
    const emails = req.body.emails || [];
    if (!Array.isArray(emails) || emails.length === 0)
      return res.status(400).json({ error: "No emails provided" });

    const processed = [];
    const invalid = [];

    for (const email of emails) {
      const trimmed = email.trim();
      const split = trimmed.split("@");
      if (split.length !== 2) {
        invalid.push(trimmed);
        continue;
      }
      processed.push({ email: trimmed, username: split[0] });
    }

    const conflicts = await db("users")
      .select(["username", "email"])
      .whereIn("username", processed.map(e => e.username))
      .orWhereIn("email", processed.map(e => e.email));

    const conflictingEmails = new Set(conflicts.map(c => c.email));
    const conflictingUsernames = new Set(conflicts.map(c => c.username));

    const valid = processed.filter(
      e => !conflictingEmails.has(e.email) && !conflictingUsernames.has(e.username)
    );

    if (valid.length > 0) {
      await db("users").insert(valid);
    }

    res.json({
      inserted: valid.length,
      conflicts: conflicts.map(c => c.email),
      invalid
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// Add Transactions
// ----------------------
router.post("/add-transactions", async (req, res) => {
  try {
    const { transactions } = req.body;

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ inserted: 0, failed: [], invalidFormat: [], error: "No transactions provided" });
    }

    const inserted = [];
    const failed = [];
    const invalidFormat = [];

    for (const t of transactions) {
      const email = t.email.trim();
      const item_id = parseInt(t.item_id.trim(), 10);

      try {
        const user = await db("users").select("id").where({ email }).first();
        if (!user) {
          failed.push({ email, item_id, error: "User not found" });
          continue;
        }

        const item = await db("inventory").select("cents").where({ id: item_id }).first();
        if (!item) {
          failed.push({ email, item_id, error: "Item not found" });
          continue;
        }

        const last = await db("transactions").max("id as maxId").first();
        const nextId = (last?.maxId || 0) + 1;

        const transaction = {
          id: nextId,
          user_id: user.id,
          item_id: item_id,
          cents: -1 * Math.abs(item.cents),
        };

        await db("transactions").insert(transaction);
        inserted.push(transaction);
      } catch (err) {
        console.error(`Error adding transaction for ${email}:`, err);
        failed.push({ email, item_id, error: err.message });
      }
    }

    res.json({ inserted: inserted.length, failed, invalidFormat });
  } catch (err) {
    console.error("Unexpected error in /add-transactions:", err);
    res.status(500).json({ inserted: 0, failed: [], invalidFormat: [], error: err.message });
  }
});

// ----------------------
// Reset Passwords
// ----------------------
router.post("/reset-passwords", async (req, res) => {
  try {
    const emails = req.body.emails || [];
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ reset: 0, notFound: [], invalid: [], error: "No emails provided" });
    }

    const BATCH_SIZE = 100;
    const invalid = [];
    const notFound = [];
    let resetCount = 0;

    const validEmails = emails.map(e => e.trim()).filter(e => {
      if (!e.includes("@")) {
        invalid.push(e);
        return false;
      }
      return true;
    });

    for (let i = 0; i < validEmails.length; i += BATCH_SIZE) {
      const batch = validEmails.slice(i, i + BATCH_SIZE);
      const existing = await db("users").select(["username", "email"]).whereIn("email", batch);
      const existingEmails = new Set(existing.map(u => u.email));
      const found = batch.filter(email => existingEmails.has(email));
      const missing = batch.filter(email => !existingEmails.has(email));

      notFound.push(...missing);

      if (found.length > 0) {
        await db("users").whereIn("email", found).update({ password_hash: "", password_salt: "" });
        resetCount += found.length;
      }
    }

    res.json({ reset: resetCount, notFound, invalid });
  } catch (err) {
    console.error("Error resetting passwords:", err);
    res.status(500).json({ reset: 0, notFound: [], invalid: [], error: err.message });
  }
});

// ----------------------
// Get Items
// ----------------------
router.get("/items", async (req, res) => {
  try {
    const items = await db("inventory").select("id", "name").orderBy("name", "asc");
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch items" });
  }
});

// ----------------------
// Refunds
// ----------------------
router.post("/refunds", async (req, res) => {
  try {
    const refunds = req.body.refunds || [];
    if (!Array.isArray(refunds) || refunds.length === 0) return res.status(400).json({ error: "No refunds provided" });

    const processed = [];
    const invalidFormat = [];
    const failed = [];

    for (const r of refunds) {
      const email = r.email?.trim();
      const item_id = parseInt(r.item_id, 10);

      if (!email || isNaN(item_id)) {
        invalidFormat.push(r);
        continue;
      }
      processed.push({ email, item_id });
    }

    let inserted = 0;

    for (const entry of processed) {
      try {
        const user = await db("users").select("id").where("email", entry.email).first();
        const item = await db("inventory").select("cents").where("id", entry.item_id).first();
        const last = await db("transactions").select("id").orderBy("id", "desc").first();

        if (!user || !item) {
          failed.push(entry);
          continue;
        }

        const id = last ? last.id + 1 : 1;
        const cents = Math.abs(item.cents); // refund = positive
        await db("transactions").insert({ id, user_id: user.id, item_id: entry.item_id, cents });
        inserted++;
      } catch (err) {
        console.error(err);
        failed.push(entry);
      }
    }

    res.json({ inserted, failed, invalidFormat });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------------
// User Transactions (last 5 spending transactions)
// ----------------------
router.get("/user-transactions", async (req, res) => {
  try {
    const email = req.query.email?.trim();
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await db("users").select("id").where({ email }).first();
    if (!user) return res.status(404).json({ error: "User not found" });

    const lastFive = db("transactions")
      .where("user_id", user.id)
      .orderBy("id", "desc")
      .limit(5)
      .select("*");

    const transactions = await db
      .from(lastFive.as("last_five"))
      .leftJoin("inventory", "last_five.item_id", "inventory.id")
      .select("inventory.id", "inventory.name", "last_five.cents")
      .where("last_five.cents", "<=", 0); // only spending transactions

    res.json({ transactions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

