const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Get all users
router.get('/users', authenticate, authorize(['manager']), async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, first_name, last_name, email, role FROM users'
    );
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user role
router.put('/users/:id/role', authenticate, authorize(['manager']), async (req, res) => {
  const { role } = req.body;
  if (role !== 'member' && role !== 'coach') {
    return res.status(403).json({ error: 'No tienes permiso para asignar este rol.' });
  }
  try {
    await db.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ success: true, message: 'Rol actualizado correctamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a user
router.delete('/users/:id', authenticate, authorize(['manager']), async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Usuario eliminado correctamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- NEW: Get branches (for the class form) ----
router.get('/branches', authenticate, authorize(['manager']), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, branch_name FROM branches ORDER BY branch_name ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all classes
router.get('/classes', authenticate, authorize(['manager']), async (req, res) => {
  try {
    const [classes] = await db.query(
      `SELECT c.id, c.class_date, c.max_capacity, c.class_type, c.branch_id, c.coach_id
       FROM classes c
       ORDER BY c.class_date DESC`
    );
    res.json(classes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- FIXED: Add a class (now includes branch_id and class_type) ----
router.post('/classes', authenticate, authorize(['manager']), async (req, res) => {
  const { coach_id, class_date, max_capacity, class_type, branch_id } = req.body;

  if (!branch_id || !class_type || !class_date || !max_capacity) {
    return res.status(400).json({ error: 'Faltan campos requeridos.' });
  }

  try {
    await db.query(
      `INSERT INTO classes (coach_id, branch_id, class_type, class_date, max_capacity)
       VALUES (?, ?, ?, ?, ?)`,
      [coach_id || null, branch_id, class_type, class_date, max_capacity]
    );
    res.json({ success: true, message: 'Clase creada correctamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- NEW: Delete class (used by delete button in UI) ----
router.delete('/classes/:id', authenticate, authorize(['manager']), async (req, res) => {
  try {
    await db.query('DELETE FROM classes WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Clase eliminada correctamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/memberships', authenticate, authorize(['manager']), async (req, res) => {
  try {
    const [memberships] = await db.query(`
      SELECT users.first_name AS member_name,
             class_packages.package_type,
             class_packages.remaining_classes,
             class_packages.expiration_date
      FROM class_packages
      JOIN users ON class_packages.member_id = users.id
      ORDER BY class_packages.expiration_date ASC
    `);
  res.json(memberships);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
